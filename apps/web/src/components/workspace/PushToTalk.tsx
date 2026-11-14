"use client";

import vi from "../../../messages/vi.json";
import type { MicState, VoiceStatus } from "@/hooks/useVoiceSession";
import { buttonClass } from "@/components/ui/Button";
import { FOCUS_RING } from "@/components/ui/focus";

/**
 * Push-to-talk control. When the microphone is denied or recording is not
 * supported it is replaced by guidance and the page falls back to text input
 * (T-UX-01). After the voice socket gave up reconnecting it offers a manual
 * retry and points to the text input (T-VOICE-03).
 */
export default function PushToTalk({
  status,
  error,
  notice,
  micState,
  gaveUp,
  disabled,
  onStart,
  onStop,
  onRetry,
}: {
  status: VoiceStatus;
  error: string | null;
  notice: string | null;
  micState: MicState;
  gaveUp: boolean;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
  onRetry: () => void;
}) {
  if (micState === "denied" || micState === "unsupported") {
    return <MicGuidance kind={micState} />;
  }

  const recording = status === "recording";
  const busy = status === "processing" || status === "connecting" || status === "reconnecting";
  const label = recording
    ? vi.voice.recording
    : status === "connecting" || status === "reconnecting"
      ? vi.voice.connecting
      : status === "processing"
        ? vi.voice.processing
        : vi.voice.hold;

  return (
    <div className="flex flex-col gap-2 px-4 pt-4">
      {gaveUp ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={disabled}
          className={buttonClass({ variant: "secondary", size: "lg", className: "w-full" })}
        >
          {vi.workspace.voice.retryVoice}
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled || busy}
          aria-pressed={recording}
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
          className={`flex h-14 w-full select-none items-center justify-center gap-3 rounded-full px-6 text-base font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING} ${
            recording
              ? "bg-ink text-white ring-4 ring-primary-soft"
              : "bg-primary text-white hover:bg-primary-strong"
          }`}
        >
          {recording ? (
            <span
              className="h-3 w-3 animate-pulse rounded-full bg-primary-soft motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <MicIcon />
          )}
          {label}
        </button>
      )}
      <p id="ptt-hint" className="text-sm text-ink-muted">
        {vi.voice.hint}
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-control border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-ink"
        >
          {error}
        </p>
      )}
      {notice && !error && (
        <p role="status" className="rounded-control bg-info-soft px-3 py-2 text-sm text-ink">
          {notice}
        </p>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0" fill="none" aria-hidden="true">
      <rect x="7" y="2.5" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M4.5 9.5a5.5 5.5 0 0011 0M10 15v2.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MicGuidance({ kind }: { kind: "denied" | "unsupported" }) {
  const m = vi.workspace.mic;
  return (
    <div
      role="status"
      className="mx-4 mt-4 rounded-card border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-ink"
    >
      <p className="font-bold text-warning">{kind === "denied" ? m.deniedTitle : m.unsupportedTitle}</p>
      {kind === "denied" ? (
        <ol className="mt-1.5 list-decimal space-y-1 pl-5 leading-relaxed">
          {m.deniedSteps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      ) : (
        <p className="mt-1.5 leading-relaxed">{m.unsupportedBody}</p>
      )}
      <p className="mt-2 font-semibold">{m.textMode}</p>
    </div>
  );
}
