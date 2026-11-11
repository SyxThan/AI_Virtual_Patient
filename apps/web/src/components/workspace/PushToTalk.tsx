"use client";

import vi from "../../../messages/vi.json";
import type { MicState, VoiceStatus } from "@/hooks/useVoiceSession";
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
    <div className="flex flex-col gap-1.5 border-t border-gray-200 px-3 pt-3">
      {gaveUp ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={disabled}
          className={`rounded-md border border-gray-400 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50 ${FOCUS_RING}`}
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
          className={`select-none rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${FOCUS_RING} ${
            recording ? "bg-red-700" : "bg-blue-700 hover:bg-blue-800"
          }`}
        >
          {label}
        </button>
      )}
      <p id="ptt-hint" className="text-xs text-gray-600">
        {vi.voice.hint}
      </p>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-900">
          {error}
        </p>
      )}
      {notice && !error && (
        <p role="status" className="rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-950">
          {notice}
        </p>
      )}
    </div>
  );
}

function MicGuidance({ kind }: { kind: "denied" | "unsupported" }) {
  const m = vi.workspace.mic;
  return (
    <div
      role="status"
      className="mx-3 mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950"
    >
      <p className="font-semibold">{kind === "denied" ? m.deniedTitle : m.unsupportedTitle}</p>
      {kind === "denied" ? (
        <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs leading-relaxed">
          {m.deniedSteps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      ) : (
        <p className="mt-1 text-xs leading-relaxed">{m.unsupportedBody}</p>
      )}
      <p className="mt-1.5 text-xs font-medium">{m.textMode}</p>
    </div>
  );
}
