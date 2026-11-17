"use client";

import { useEffect, useRef } from "react";
import vi from "../../../messages/vi.json";
import type { MicState, VoiceStatus } from "@/hooks/useVoiceSession";
import { FOCUS_RING } from "@/components/ui/focus";

const BARS = 9;

/**
 * Push-to-talk at the foot of the stage, so the learner never looks away from
 * the mother while speaking. Four visible states: ready, listening (bars follow
 * the microphone level), processing, and the mother replying (the button waits
 * until she has finished). Hold the button or Space; the page handles Space
 * when focus is elsewhere. Without a usable microphone it becomes "Gõ câu hỏi",
 * which moves focus to the text input, plus one line on how to allow the mic.
 * Below 768 px it floats fixed above the conversation sheet.
 */
export default function VoiceDock({
  status,
  micState,
  gaveUp,
  error,
  notice,
  replying,
  disabled,
  lockedReason,
  micLevel,
  onStart,
  onStop,
  onRetry,
  onTypeInstead,
}: {
  status: VoiceStatus;
  micState: MicState;
  gaveUp: boolean;
  error: string | null;
  notice: string | null;
  /** The mother's reply is playing. */
  replying: boolean;
  /** A typed question is in flight. */
  disabled: boolean;
  lockedReason: string | null;
  micLevel: () => number;
  onStart: () => void;
  onStop: () => void;
  onRetry: () => void;
  onTypeInstead: () => void;
}) {
  const barsRef = useRef<HTMLSpanElement>(null);
  const recording = status === "recording";

  // Waveform: scale the bars from the live mic level (transform only, rAF).
  useEffect(() => {
    if (!recording) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let smooth = 0;
    const tick = (t: number) => {
      smooth += (micLevel() - smooth) * 0.35;
      const bars = barsRef.current?.children;
      if (bars) {
        for (let i = 0; i < bars.length; i++) {
          const wobble = reduce ? 1 : 0.65 + 0.35 * Math.sin(t / 140 + i * 1.3);
          const k = Math.max(0.18, Math.min(1, smooth * wobble * (1 - Math.abs(i - (BARS - 1) / 2) / BARS)));
          (bars[i] as HTMLElement).style.transform = `scaleY(${k.toFixed(3)})`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [recording, micLevel]);

  const wrap = "pointer-events-auto flex flex-col items-center gap-1.5 max-md:fixed max-md:inset-x-4 max-md:bottom-[calc(var(--sheet-peek,9.5rem)+0.75rem)] max-md:z-30";

  if (lockedReason) {
    return (
      <div className={wrap}>
        <p className="rounded-full bg-surface/95 px-4 py-2 text-sm text-ink-muted shadow-sm ring-1 ring-line">{lockedReason}</p>
      </div>
    );
  }

  if (micState === "denied" || micState === "unsupported") {
    return (
      <div className={wrap}>
        <button
          type="button"
          onClick={onTypeInstead}
          className={`flex h-14 w-full max-w-[280px] items-center justify-center gap-3 rounded-full bg-ink px-6 text-base font-bold text-white shadow-lg ${FOCUS_RING}`}
        >
          <KeyboardIcon />
          {vi.cockpit.voice.typeInstead}
        </button>
        <p role="status" className="max-w-md rounded-control bg-warning-soft/95 px-3 py-1.5 text-center text-xs leading-snug text-ink shadow-sm">
          {micState === "denied" ? vi.cockpit.voice.deniedLine : vi.cockpit.voice.unsupportedLine}
        </p>
      </div>
    );
  }

  if (gaveUp) {
    return (
      <div className={wrap}>
        <button
          type="button"
          onClick={onRetry}
          className={`flex h-14 w-full max-w-[280px] items-center justify-center rounded-full bg-surface px-6 text-base font-bold text-ink shadow-lg ring-1 ring-line-strong ${FOCUS_RING}`}
        >
          {vi.workspace.voice.retryVoice}
        </button>
        <p role="status" className="max-w-md text-center text-xs text-ink-muted">
          {vi.workspace.voice.gaveUp}
        </p>
      </div>
    );
  }

  const connecting = status === "connecting" || status === "reconnecting";
  const processing = status === "processing";
  const locked = disabled || processing || connecting || (replying && !recording);
  const label = recording
    ? vi.cockpit.voice.listening
    : processing
      ? vi.cockpit.voice.processing
      : connecting
        ? vi.cockpit.voice.connecting
        : replying
          ? vi.cockpit.voice.replying
          : vi.cockpit.voice.ready;
  const tone = recording
    ? "bg-ink text-white ring-4 ring-glow/50"
    : replying
      ? "bg-sand-soft text-sand-ink ring-1 ring-sand-ink/20"
      : processing || connecting
        ? "bg-surface text-ink ring-1 ring-line-strong"
        : "bg-primary text-white hover:bg-primary-strong";

  return (
    <div className={wrap}>
      {error && (
        <p role="alert" className="max-w-md rounded-control bg-warning-soft/95 px-3 py-1.5 text-center text-xs leading-snug text-ink shadow-sm">
          {error}
        </p>
      )}
      {notice && !error && (
        <p role="status" className="max-w-md rounded-control bg-info-soft/95 px-3 py-1.5 text-center text-xs leading-snug text-ink shadow-sm">
          {notice}
        </p>
      )}
      <button
        type="button"
        data-ptt=""
        disabled={locked}
        aria-pressed={recording}
        aria-keyshortcuts="Space"
        aria-describedby="ptt-hint"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          onStart();
        }}
        onPointerUp={onStop}
        onPointerCancel={onStop}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            onStart();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            onStop();
          }
        }}
        onBlur={() => recording && onStop()}
        className={`flex h-14 w-full max-w-[280px] select-none items-center justify-center gap-3 rounded-full px-6 text-base font-bold shadow-lg transition-colors disabled:cursor-not-allowed ${FOCUS_RING} ${tone}`}
      >
        {recording ? (
          <span ref={barsRef} className="flex h-6 items-center gap-[3px]" aria-hidden="true">
            {Array.from({ length: BARS }, (_, i) => (
              <span key={i} className="h-full w-[3px] origin-center scale-y-[0.18] rounded-full bg-glow" />
            ))}
          </span>
        ) : processing || connecting ? (
          <span
            className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-primary motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : replying ? (
          <ReplyBars />
        ) : (
          <MicIcon />
        )}
        <span className="truncate">{label}</span>
        {!recording && !locked && (
          <kbd aria-hidden="true" className="hidden rounded border border-white/40 px-1.5 text-xs font-semibold opacity-80 sm:inline">
            Space
          </kbd>
        )}
      </button>
      <p id="ptt-hint" className="sr-only">
        {vi.cockpit.voice.hint}
      </p>
    </div>
  );
}

function ReplyBars() {
  return (
    <span className="flex h-5 items-end gap-[3px]" aria-hidden="true">
      {[0.6, 1, 0.75, 0.9].map((h, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-current motion-safe:animate-wave"
          style={{ height: `${h * 100}%`, animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0" fill="none" aria-hidden="true">
      <rect x="7" y="2.5" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4.5 9.5a5.5 5.5 0 0011 0M10 15v2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0" fill="none" aria-hidden="true">
      <rect x="2" y="5" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 8.5h1M8 8.5h1M11 8.5h1M14 8.5h1M6 11.5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
