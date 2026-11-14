"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import vi from "../../messages/vi.json";
import { API_URL, authHeaders, fmt, whenAuthReady, wsAuthMessage } from "@/lib/sessionAuth";

/**
 * Push-to-talk voice loop over `/ws/sessions/{id}` (Slice 6-02, hardened in Slice 12).
 *
 * Protocol: first message is `{type:"auth", access_token}` when signed in or
 * `{type:"auth", token}` for a guest (never in the URL), then binary
 * `audio/webm;codecs=opus` chunks, then `{type:"end"}`. The server replies with
 * transcript / audio / timing / error events. Playback goes through an
 * AnalyserNode that is exposed so the avatar lip-sync can follow the voice.
 *
 * Robustness (TASK-S12-02, T-UX-01, T-VOICE-03):
 * - `micState` reports a denied permission or a browser without MediaRecorder,
 *   so the page can show guidance and fall back to text.
 * - An unexpected socket drop reconnects with backoff (max 3 tries); after that
 *   `gaveUp` is set and the user is told to use text (`retryConnection` resets).
 * - A voice turn with no reply within REPLY_TIMEOUT_MS ends with a clear error.
 * - A failed turn calls `onTurnFailed` so the page reloads the canonical
 *   transcript (the server saved nothing): no turn is ever shown as answered
 *   when it was not.
 *
 * Typed turns (Slice 16, AVP-133): the page calls `prepareAudio()` inside the
 * submit gesture, then `speakTurn(turn_idx)` once the reply is saved; the reply
 * audio comes from `POST /sessions/{id}/turns/{idx}/speech` and plays through the
 * same AnalyserNode, so the avatar lip-syncs to typed turns too. 204 (no real
 * TTS configured) plays nothing; a failure is only a notice, the text stands.
 */

export type VoiceStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "recording"
  | "processing"
  | "reconnecting"
  | "closed";
export type MicState = "unknown" | "available" | "denied" | "unsupported";
export type VoiceTranscript = { speaker: "student" | "patient"; text: string; turn_idx?: number };
export type LockReason = "TIME_LIMIT_REACHED" | "SESSION_FINISHED";

type ServerEvent =
  | { type: "ready" }
  | { type: "transcript"; speaker: "student" | "patient"; text: string; turn_idx?: number }
  | { type: "audio"; data: string; mime: string }
  | { type: "timing"; stt_ms: number | null; llm_ms: number | null; tts_ms: number | null }
  | { type: "error"; code: string; message: string };

const MIME = "audio/webm;codecs=opus";
const CHUNK_MS = 250;
export const MAX_RECONNECTS = 3;
const BACKOFF_MS = [1000, 2000, 4000];
const REPLY_TIMEOUT_MS = 30_000;
const SPEECH_TIMEOUT_MS = 60_000;

function wsBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  return API_URL.replace(/\/$/, "").replace(/^http(s?):/, (_m, s: string) => `ws${s}:`);
}

function recordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

// Server error code -> [message, blocking?]. Non-blocking codes are notices: the
// text reply was still delivered.
const ERROR_TEXT: Record<string, [string, boolean]> = {
  STT_FAILED: [vi.voice.sttFailed, true],
  TTS_FAILED: [vi.voice.ttsFailed, false],
  AUDIO_TOO_LARGE: [vi.voice.tooLarge, true],
  PATIENT_UNAVAILABLE: [vi.voice.patientUnavailable, true],
  TIME_LIMIT_REACHED: [vi.workspace.voice.timeUp, true],
  SESSION_FINISHED: [vi.workspace.voice.finished, true],
};

export function useVoiceSession({
  sessionId,
  onTranscript,
  onTurnFailed,
  onLocked,
}: {
  sessionId: string;
  onTranscript: (t: VoiceTranscript) => void;
  onTurnFailed?: () => void;
  onLocked?: (reason: LockReason) => void;
}) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [micState, setMicState] = useState<MicState>("unknown");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [gaveUp, setGaveUp] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const readyRef = useRef<Promise<WebSocket> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const playingRef = useRef<AudioBufferSourceNode | null>(null);
  const stopRequestedRef = useRef(false);
  const closingRef = useRef(false); // intentional close: never reconnect
  const attemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<() => Promise<WebSocket>>(() => Promise.reject(new Error("init")));
  const onTranscriptRef = useRef(onTranscript);
  const onTurnFailedRef = useRef(onTurnFailed);
  const onLockedRef = useRef(onLocked);
  const speechSeqRef = useRef(0); // only the latest typed-turn speech may play
  const speechAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onTurnFailedRef.current = onTurnFailed;
    onLockedRef.current = onLocked;
  }, [onTranscript, onTurnFailed, onLocked]);

  // Detect "no recording support" and an already-denied permission up front, so
  // the page can switch to text before the student even tries the button.
  useEffect(() => {
    let cancelled = false;
    let perm: PermissionStatus | null = null;
    const apply = (state: PermissionState) => {
      if (cancelled) return;
      setMicState(state === "denied" ? "denied" : state === "granted" ? "available" : "unknown");
    };
    (async () => {
      if (!recordingSupported()) {
        if (!cancelled) setMicState("unsupported");
        return;
      }
      try {
        perm = await navigator.permissions.query({ name: "microphone" as PermissionName });
        apply(perm.state);
        perm.onchange = () => perm && apply(perm.state);
      } catch {
        /* Permissions API unavailable (e.g. older Safari): learn on first use. */
      }
    })();
    return () => {
      cancelled = true;
      if (perm) perm.onchange = null;
    };
  }, []);

  const clearReplyTimer = useCallback(() => {
    if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
    replyTimerRef.current = null;
  }, []);

  const armReplyTimer = useCallback(() => {
    clearReplyTimer();
    replyTimerRef.current = setTimeout(() => {
      replyTimerRef.current = null;
      setError(vi.workspace.voice.timeout);
      setStatus((s) => (s === "processing" ? "ready" : s));
      onTurnFailedRef.current?.();
    }, REPLY_TIMEOUT_MS);
  }, [clearReplyTimer]);

  /** Create (or resume) audio output. Browsers only allow this inside a user
   *  gesture, so call it from the click/submit handler before any await. */
  const prepareAudio = useCallback(() => {
    if (typeof window === "undefined" || typeof AudioContext === "undefined") return;
    if (!ctxRef.current) {
      const ctx = new AudioContext();
      const node = ctx.createAnalyser();
      node.fftSize = 1024;
      node.connect(ctx.destination);
      ctxRef.current = ctx;
      analyserRef.current = node;
      setAnalyser(node);
    }
    void ctxRef.current.resume();
  }, []);

  const playBuffer = useCallback(async (data: ArrayBuffer) => {
    const ctx = ctxRef.current;
    const out = analyserRef.current;
    if (!ctx || !out) return;
    try {
      const buffer = await ctx.decodeAudioData(data);
      playingRef.current?.stop();
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(out);
      src.start();
      playingRef.current = src;
    } catch {
      setNotice(vi.voice.playbackFailed);
    }
  }, []);

  const play = useCallback(
    async (b64: string) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      await playBuffer(bytes.buffer);
    },
    [playBuffer],
  );

  /** Read a saved patient turn aloud (typed turns). Never throws. */
  const speakTurn = useCallback(
    async (turnIdx: number) => {
      speechAbortRef.current?.abort();
      const ctrl = new AbortController();
      speechAbortRef.current = ctrl;
      const seq = ++speechSeqRef.current;
      const timer = setTimeout(() => ctrl.abort(), SPEECH_TIMEOUT_MS);
      try {
        const res = await fetch(`${API_URL}/api/v1/sessions/${sessionId}/turns/${turnIdx}/speech`, {
          method: "POST",
          headers: authHeaders(),
          signal: ctrl.signal,
        });
        if (res.status === 204) return; // no real TTS configured: text only, by design
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        if (seq !== speechSeqRef.current) return; // a newer reply superseded this one
        await playBuffer(data);
      } catch {
        // Superseded or stopped (seq moved on): silent. Failure or timeout: say so.
        if (seq === speechSeqRef.current) setNotice(vi.voice.ttsFailed);
      } finally {
        clearTimeout(timer);
        if (speechAbortRef.current === ctrl) speechAbortRef.current = null;
      }
    },
    [sessionId, playBuffer],
  );

  /** Stop the patient's voice and drop any typed-turn speech still loading. */
  const stopSpeaking = useCallback(() => {
    speechSeqRef.current++;
    speechAbortRef.current?.abort();
    speechAbortRef.current = null;
    playingRef.current?.stop();
    playingRef.current = null;
  }, []);

  const handleEvent = useCallback(
    (ev: ServerEvent) => {
      switch (ev.type) {
        case "transcript":
          onTranscriptRef.current({ speaker: ev.speaker, text: ev.text, turn_idx: ev.turn_idx });
          if (ev.speaker === "student") setStatus("processing");
          break;
        case "audio":
          void play(ev.data);
          break;
        case "timing":
          clearReplyTimer();
          setStatus("ready");
          break;
        case "error": {
          const [msg, blocking] = ERROR_TEXT[ev.code] ?? [vi.voice.genericError, true];
          if (blocking) {
            clearReplyTimer();
            setError(msg);
            setStatus("ready");
            onTurnFailedRef.current?.();
            if (ev.code === "TIME_LIMIT_REACHED" || ev.code === "SESSION_FINISHED") {
              onLockedRef.current?.(ev.code);
            }
          } else {
            setNotice(msg);
          }
          break;
        }
      }
    },
    [play, clearReplyTimer],
  );

  const scheduleReconnect = useCallback(() => {
    if (closingRef.current) return;
    if (attemptsRef.current >= MAX_RECONNECTS) {
      setGaveUp(true);
      setStatus("closed");
      setReconnectAttempt(0);
      setError(vi.workspace.voice.gaveUp);
      return;
    }
    const n = attemptsRef.current + 1;
    attemptsRef.current = n;
    setReconnectAttempt(n);
    setStatus("reconnecting");
    setError(null);
    setNotice(fmt(vi.workspace.voice.reconnecting, { n, max: MAX_RECONNECTS }));
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      void connectRef.current().catch(() => undefined);
    }, BACKOFF_MS[n - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1]);
  }, []);

  const connect = useCallback((): Promise<WebSocket> => {
    const open = wsRef.current;
    if (open && open.readyState === WebSocket.OPEN && readyRef.current) return readyRef.current;
    if (open && open.readyState === WebSocket.CONNECTING && readyRef.current) {
      return readyRef.current;
    }
    closingRef.current = false;
    if (attemptsRef.current === 0) setStatus("connecting");
    const ws = new WebSocket(`${wsBaseUrl()}/ws/sessions/${sessionId}`);
    wsRef.current = ws;
    const ready = new Promise<WebSocket>((resolve, reject) => {
      let isReady = false;
      ws.onopen = () => {
        void whenAuthReady().then(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(wsAuthMessage()));
        });
      };
      ws.onmessage = (m) => {
        if (typeof m.data !== "string") return;
        let ev: ServerEvent;
        try {
          ev = JSON.parse(m.data) as ServerEvent;
        } catch {
          return;
        }
        if (ev.type === "ready") {
          isReady = true;
          if (attemptsRef.current > 0) setNotice(null); // reconnected
          attemptsRef.current = 0;
          setReconnectAttempt(0);
          setGaveUp(false);
          setStatus("ready");
          resolve(ws);
        } else {
          handleEvent(ev);
        }
      };
      ws.onclose = (c) => {
        if (wsRef.current !== ws) return; // superseded by a newer socket
        wsRef.current = null;
        readyRef.current = null;
        if (!isReady) reject(new Error("ws closed"));
        if (closingRef.current) {
          setStatus("closed");
          return;
        }
        // A reply in flight is lost with the socket: say so, reload the transcript.
        if (replyTimerRef.current) {
          clearReplyTimer();
          onTurnFailedRef.current?.();
        }
        const rec = recorderRef.current;
        if (rec && rec.state !== "inactive") {
          rec.onstop = null;
          rec.stop();
          recorderRef.current = null;
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        if (c.code === 1008) {
          // Auth/ownership refused: retrying cannot help.
          setStatus("closed");
          setError(vi.voice.authFailed);
          return;
        }
        scheduleReconnect();
      };
    });
    ready.catch(() => undefined); // surfaced via onclose; avoid unhandled rejection
    readyRef.current = ready;
    return ready;
  }, [sessionId, handleEvent, scheduleReconnect, clearReplyTimer]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    stopRequestedRef.current = true;
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop(); // onstop sends "end"
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current?.state === "recording") return;
    setError(null);
    setNotice(null);
    stopRequestedRef.current = false;

    if (!recordingSupported()) {
      setMicState("unsupported");
      setError(vi.voice.unsupported);
      return;
    }

    // Audio output must be created/resumed inside the user gesture.
    prepareAudio();
    stopSpeaking(); // student speaks over the patient: cut playback

    const [wsRes, micRes] = await Promise.allSettled([
      connect(),
      navigator.mediaDevices.getUserMedia({ audio: true }),
    ]);
    if (micRes.status === "rejected") {
      const e = micRes.reason;
      const denied =
        e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      if (denied) {
        setMicState("denied");
        setError(vi.voice.micDenied);
      } else {
        setError(vi.voice.unsupported);
      }
      if (wsRef.current?.readyState === WebSocket.OPEN) setStatus("ready");
      return;
    }
    const stream = micRes.value;
    setMicState("available");
    if (wsRes.status === "rejected") {
      stream.getTracks().forEach((t) => t.stop()); // never keep the mic open without a socket
      return; // onclose already scheduled a reconnect or reported the failure
    }
    const ws = wsRes.value;
    streamRef.current = stream;

    const rec = new MediaRecorder(
      stream,
      MediaRecorder.isTypeSupported(MIME) ? { mimeType: MIME } : undefined,
    );
    rec.ondataavailable = (e) => {
      if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data);
    };
    rec.onstop = () => {
      releaseMic();
      recorderRef.current = null;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "end" }));
        setStatus("processing");
        armReplyTimer();
      }
    };
    recorderRef.current = rec;
    rec.start(CHUNK_MS);
    setStatus("recording");
    if (stopRequestedRef.current) rec.stop(); // released before the mic was ready
  }, [connect, releaseMic, armReplyTimer, prepareAudio, stopSpeaking]);

  /** Manual retry after `gaveUp`: a fresh set of reconnect attempts. */
  const retryConnection = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    attemptsRef.current = 0;
    setGaveUp(false);
    setError(null);
    setNotice(null);
    void connect().catch(() => undefined);
  }, [connect]);

  /** Close for good (the session ended): no reconnect, mic released. */
  const shutdown = useCallback(() => {
    closingRef.current = true;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    clearReplyTimer();
    stopSpeaking();
    const rec = recorderRef.current;
    if (rec) {
      rec.onstop = null;
      if (rec.state !== "inactive") rec.stop();
      recorderRef.current = null;
    }
    releaseMic();
    wsRef.current?.close();
  }, [clearReplyTimer, releaseMic, stopSpeaking]);

  useEffect(() => {
    return () => {
      closingRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
      speechAbortRef.current?.abort();
      const rec = recorderRef.current;
      if (rec) {
        rec.onstop = null;
        if (rec.state !== "inactive") rec.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
      void ctxRef.current?.close();
    };
  }, []);

  return {
    status,
    error,
    notice,
    analyser,
    micState,
    reconnectAttempt,
    gaveUp,
    start,
    stop,
    retryConnection,
    shutdown,
    prepareAudio,
    speakTurn,
    stopSpeaking,
  };
}
