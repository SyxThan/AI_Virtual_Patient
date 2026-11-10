"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import vi from "../../messages/vi.json";

/**
 * Push-to-talk voice loop over `/ws/sessions/{id}` (Slice 6-02).
 *
 * Protocol: first message is `{type:"auth", token}` (never in the URL), then binary
 * `audio/webm;codecs=opus` chunks, then `{type:"end"}`. The server replies with
 * transcript / audio / timing / error events. Any voice failure leaves the socket
 * (and the text chat) usable. Playback goes through an AnalyserNode that is exposed
 * so the avatar lip-sync can follow the patient's voice.
 */

export type VoiceStatus = "idle" | "connecting" | "ready" | "recording" | "processing" | "closed";
export type VoiceTranscript = { speaker: "student" | "patient"; text: string; turn_idx?: number };

type ServerEvent =
  | { type: "ready" }
  | { type: "transcript"; speaker: "student" | "patient"; text: string; turn_idx?: number }
  | { type: "audio"; data: string; mime: string }
  | { type: "timing"; stt_ms: number | null; llm_ms: number | null; tts_ms: number | null }
  | { type: "error"; code: string; message: string };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const MIME = "audio/webm;codecs=opus";
const CHUNK_MS = 250;

function wsBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  return API_URL.replace(/\/$/, "").replace(/^http(s?):/, (_m, s: string) => `ws${s}:`);
}

function guestToken(): string | null {
  try {
    return sessionStorage.getItem("avp_guest_token");
  } catch {
    return null;
  }
}

// Server error code -> [message, blocking?]. Non-blocking codes are notices: the
// text reply was still delivered.
const ERROR_TEXT: Record<string, [string, boolean]> = {
  STT_FAILED: [vi.voice.sttFailed, true],
  TTS_FAILED: [vi.voice.ttsFailed, false],
  AUDIO_TOO_LARGE: [vi.voice.tooLarge, true],
  PATIENT_UNAVAILABLE: [vi.voice.patientUnavailable, true],
};

export function useVoiceSession({
  sessionId,
  onTranscript,
}: {
  sessionId: string;
  onTranscript: (t: VoiceTranscript) => void;
}) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const readyRef = useRef<Promise<WebSocket> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const playingRef = useRef<AudioBufferSourceNode | null>(null);
  const stopRequestedRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const play = useCallback(async (b64: string) => {
    const ctx = ctxRef.current;
    const out = analyserRef.current;
    if (!ctx || !out) return;
    try {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const buffer = await ctx.decodeAudioData(bytes.buffer);
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
          setStatus("ready");
          break;
        case "error": {
          const [msg, blocking] = ERROR_TEXT[ev.code] ?? [vi.voice.genericError, true];
          if (blocking) {
            setError(msg);
            setStatus("ready");
          } else {
            setNotice(msg);
          }
          break;
        }
      }
    },
    [play],
  );

  const connect = useCallback((): Promise<WebSocket> => {
    const open = wsRef.current;
    if (open && open.readyState === WebSocket.OPEN && readyRef.current) return readyRef.current;
    setStatus("connecting");
    const ws = new WebSocket(`${wsBaseUrl()}/ws/sessions/${sessionId}`);
    wsRef.current = ws;
    const ready = new Promise<WebSocket>((resolve, reject) => {
      let isReady = false;
      ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token: guestToken() ?? "" }));
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
        setStatus("closed");
        setError(c.code === 1008 ? vi.voice.authFailed : vi.voice.disconnected);
        if (!isReady) reject(new Error("ws closed"));
      };
    });
    ready.catch(() => undefined); // surfaced via onclose; avoid unhandled rejection
    readyRef.current = ready;
    return ready;
  }, [sessionId, handleEvent]);

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

    if (
      typeof window === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(vi.voice.unsupported);
      return;
    }

    // Audio output must be created/resumed inside the user gesture.
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
    playingRef.current?.stop(); // student speaks over the patient: cut playback

    let ws: WebSocket;
    let stream: MediaStream;
    try {
      [ws, stream] = await Promise.all([
        connect(),
        navigator.mediaDevices.getUserMedia({ audio: true }),
      ]);
    } catch (e) {
      const denied = e instanceof DOMException && e.name === "NotAllowedError";
      if (denied) setError(vi.voice.micDenied);
      else if (!(e instanceof DOMException)) setError((prev) => prev ?? vi.voice.disconnected);
      else setError(vi.voice.unsupported);
      if (wsRef.current?.readyState === WebSocket.OPEN) setStatus("ready");
      return;
    }
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
      }
    };
    recorderRef.current = rec;
    rec.start(CHUNK_MS);
    setStatus("recording");
    if (stopRequestedRef.current) rec.stop(); // released before the mic was ready
  }, [connect, releaseMic]);

  useEffect(() => {
    return () => {
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

  return { status, error, notice, analyser, start, stop };
}
