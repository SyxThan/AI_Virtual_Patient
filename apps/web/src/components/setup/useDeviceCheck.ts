"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MODEL_URL } from "@/components/avatar/avatarContract";
import type { StageSource } from "@/components/avatar/caseScene";
import { modelUrlOf } from "@/components/avatar/caseSceneLoader";
import { onModelProgress } from "@/components/avatar/modelBytes";

/* ------------------------------------------------------------------ WebGL */

export type WebglState = "checking" | "ok" | "unsupported";

let webglCache: Exclude<WebglState, "checking"> | null = null;

/** Same requirement as AvatarScene: a WebGL context can be created. The probe context is released at once. */
function probeWebgl(): Exclude<WebglState, "checking"> {
  if (webglCache) return webglCache;
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
    webglCache = gl ? "ok" : "unsupported";
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglCache = "unsupported";
  }
  return webglCache;
}

const noopSubscribe = () => () => undefined;

/** "checking" on the server and during hydration, then the probe result (no hydration mismatch). */
export function useWebgl(): WebglState {
  return useSyncExternalStore<WebglState>(noopSubscribe, probeWebgl, () => "checking");
}

/* ------------------------------------------------------- clinic preload */

export type PreloadState = { phase: "waiting" | "loading" | "ready" | "failed"; fraction: number };

const preloads = new Map<string, Promise<void>>();

/**
 * Warms exactly what the Clinical Workspace loads for this case, through the
 * same modules so the session page finds it cached after client-side
 * navigation: the case's .glb bytes (mother_child.glb for HFMD, else the model
 * its `/models/<caseId>.scene.json` names; modelBytes.ts promise), the three.js
 * scene chunk, and the Draco decoder (ModelLoader keeps one decoder and its
 * workers for the page's lifetime; parsing once here compiles the wasm).
 * Nothing clinical is involved.
 */
function preloadClinic(url: string): Promise<void> {
  let p = preloads.get(url);
  if (!p) {
    p = Promise.all([
      import("@/components/avatar/ModelLoader").then((m) => m.loadClinicModel(url)),
      import("@/components/avatar/AvatarScene"),
    ]).then(
      () => undefined,
      (err: unknown) => {
        preloads.delete(url); // let the workspace (or a reload) try again
        throw err;
      },
    );
    preloads.set(url, p);
  }
  return p;
}

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

const HFMD_STAGE: StageSource = { kind: "hfmd" };

/**
 * Starts the preload of the case's 3D stage (`source`, HFMD by default) when
 * the browser is idle after load; reports real download progress.
 */
export function useClinicPreload(webgl: WebglState, source: StageSource = HFMD_STAGE): PreloadState {
  const [state, setState] = useState<PreloadState>({ phase: "waiting", fraction: 0 });
  const sourceKey = source.kind === "hfmd" ? "" : source.caseId;

  useEffect(() => {
    if (webgl !== "ok") return;
    let alive = true;
    let unsubscribe = () => {};
    const stage: StageSource = sourceKey ? { kind: "case", caseId: sourceKey } : HFMD_STAGE;
    const subscribe = (url: string) => {
      unsubscribe = onModelProgress((fraction) => {
        if (alive) setState((s) => (s.phase === "ready" || s.phase === "failed" ? s : { phase: "loading", fraction }));
      }, url);
    };
    // HFMD knows its model now; a case learns it from its scene file first.
    if (!sourceKey) subscribe(MODEL_URL);
    const run = () => {
      if (!alive) return;
      setState((s) => (s.phase === "waiting" ? { ...s, phase: "loading" } : s));
      modelUrlOf(stage)
        .then((url) => {
          if (!alive) return;
          if (sourceKey) subscribe(url);
          return preloadClinic(url);
        })
        .then(
          () => alive && setState({ phase: "ready", fraction: 1 }),
          () => alive && setState({ phase: "failed", fraction: 0 }),
        );
    };
    const w = window as IdleWindow;
    let idleId: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (w.requestIdleCallback) idleId = w.requestIdleCallback(run, { timeout: 1500 });
      else timer = setTimeout(run, 200);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => {
      alive = false;
      unsubscribe();
      window.removeEventListener("load", schedule);
      if (idleId !== undefined) w.cancelIdleCallback?.(idleId);
      if (timer) clearTimeout(timer);
    };
  }, [webgl, sourceKey]);

  return state;
}

/* ------------------------------------------------------------- mic check */

export type MicState =
  | "idle"
  | "requesting"
  | "listening"
  | "ok"
  | "skipped"
  | "denied"
  | "missing"
  | "unsupported"
  | "error";

const SPEECH_LEVEL = 0.12; // normalised RMS that counts as "heard a voice"
const SPEECH_FRAMES = 6; // consecutive frames above it
const AUTO_STOP_MS = 20_000; // release the microphone if the learner walks away

/**
 * Microphone test, only on demand (never on page load). Level is written to the
 * meter element directly each frame (no React re-render per frame). Audio stays
 * in the browser: nothing is recorded or sent.
 */
export function useMicCheck(meterRef: React.RefObject<HTMLElement | null>) {
  const [state, setState] = useState<MicState>("idle");
  const [running, setRunning] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setRunning(false);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }
    setState("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setState(
        name === "NotAllowedError" || name === "SecurityError"
          ? "denied"
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "missing"
            : "error",
      );
      return;
    }
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let raf = 0;
    let loud = 0;
    let heard = false;
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const level = Math.min(1, Math.sqrt(sum / buf.length) * 5);
      const meter = meterRef.current;
      if (meter) {
        meter.style.setProperty("--mic-level", level.toFixed(3));
        const lit = Math.round(level * 5);
        meter.querySelectorAll<HTMLElement>("[data-seg]").forEach((el, i) => {
          el.dataset.on = i < lit ? "true" : "false";
        });
      }
      loud = level > SPEECH_LEVEL ? loud + 1 : 0;
      if (!heard && loud >= SPEECH_FRAMES) {
        heard = true;
        setState("ok");
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const timer = setTimeout(() => {
      stop();
      setState((s) => (s === "listening" ? "idle" : s));
    }, AUTO_STOP_MS);
    stopRef.current = () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
      meterRef.current?.querySelectorAll<HTMLElement>("[data-seg]").forEach((el) => {
        el.dataset.on = "false";
      });
    };
    setState("listening");
    setRunning(true);
  }, [meterRef, stop]);

  const finish = useCallback(() => {
    stop();
    setState((s) => (s === "listening" ? "idle" : s));
  }, [stop]);

  const skip = useCallback(() => {
    stop();
    setState("skipped");
  }, [stop]);

  return { state, running, start, finish, skip };
}
