"use client";

import vi from "../../../messages/vi.json";
import type { VoiceStatus } from "@/hooks/useVoiceSession";

export default function PushToTalk({
  status,
  error,
  notice,
  disabled,
  onStart,
  onStop,
}: {
  status: VoiceStatus;
  error: string | null;
  notice: string | null;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const recording = status === "recording";
  const busy = status === "processing" || status === "connecting";
  const label = recording
    ? vi.voice.recording
    : status === "connecting"
      ? vi.voice.connecting
      : status === "processing"
        ? vi.voice.processing
        : vi.voice.hold;

  return (
    <div className="flex flex-col gap-1 border-t border-gray-200 px-3 pt-3">
      <button
        type="button"
        disabled={disabled || busy}
        aria-pressed={recording}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onStart();
        }}
        onPointerUp={onStop}
        onPointerCancel={onStop}
        onKeyDown={(e) => {
          if (e.key === " " && !e.repeat) {
            e.preventDefault();
            onStart();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " ") {
            e.preventDefault();
            onStop();
          }
        }}
        className={`select-none rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
          recording ? "bg-red-600" : "bg-blue-600"
        }`}
      >
        {label}
      </button>
      <p className="text-[11px] text-gray-500">{vi.voice.hint}</p>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-800">
          {error}
        </p>
      )}
      {notice && !error && (
        <p role="status" className="rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          {notice}
        </p>
      )}
    </div>
  );
}
