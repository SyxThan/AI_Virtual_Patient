"use client";

import { useEffect, useRef } from "react";
import vi from "../../../messages/vi.json";
import { FOCUS_RING } from "@/components/ui/focus";

export type Turn = { turn_idx: number; speaker: string; text: string };

/** A typed question not yet answered: in flight, or failed (never saved by the server). */
export type PendingTurn = { text: string; state: "sending" | "failed"; error?: string };

/**
 * The interview transcript. It is an ARIA live log, so new messages are read
 * out by screen readers. A pending question is shown apart from saved turns:
 * while in flight with the "Người mẹ đang trả lời…" indicator, after a failure
 * with the reason and a resend button. A failed question is never shown as
 * answered (T-UX-02).
 */
export default function TranscriptBox({
  turns,
  pending,
  waiting,
  onResend,
  onDiscard,
}: {
  turns: Turn[];
  pending: PendingTurn | null;
  waiting: boolean;
  onResend: () => void;
  onDiscard: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  // Scroll the transcript itself, never the page (the page scrolls on mobile).
  useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [turns, pending, waiting]);

  const showWaiting = waiting || pending?.state === "sending";

  return (
    <div
      ref={boxRef}
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      aria-label={vi.workspace.regions.transcript}
      tabIndex={0}
      className={`flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 ${FOCUS_RING} focus-visible:ring-offset-0`}
    >
      {turns.length === 0 && !pending && (
        <p className="m-auto max-w-sm text-center text-sm text-gray-600">{vi.session.empty}</p>
      )}
      {turns.map((t) => {
        if (t.speaker === "system") {
          // Recorded exam finding: not something the mother said.
          return (
            <div
              key={`${t.turn_idx}-${t.speaker}`}
              className="max-w-[90%] self-center whitespace-pre-line break-words rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950"
            >
              <span className="mb-0.5 block font-semibold">{vi.exam.systemLabel}</span>
              {t.text}
            </div>
          );
        }
        const mine = t.speaker === "student";
        return (
          <div
            key={`${t.turn_idx}-${t.speaker}`}
            className={`max-w-[85%] whitespace-pre-line break-words rounded-2xl px-4 py-2 text-sm ${
              mine
                ? "self-end bg-blue-700 text-white"
                : "self-start border border-gray-200 bg-gray-100 text-gray-900"
            }`}
          >
            <span className={`mb-0.5 block text-xs ${mine ? "text-blue-100" : "text-gray-600"}`}>
              {mine ? vi.session.you : vi.session.mother}
            </span>
            {t.text}
          </div>
        );
      })}

      {pending && (
        <div
          className={`max-w-[85%] self-end whitespace-pre-line break-words rounded-2xl px-4 py-2 text-sm ${
            pending.state === "failed"
              ? "border border-red-300 bg-red-50 text-red-950"
              : "border border-dashed border-blue-300 bg-blue-50 text-blue-950"
          }`}
        >
          <span
            className={`mb-0.5 block text-xs ${pending.state === "failed" ? "text-red-800" : "text-blue-800"}`}
          >
            {vi.session.you}
            {pending.state === "failed" && ` · ${vi.workspace.notSent}`}
          </span>
          {pending.text}
        </div>
      )}

      {showWaiting && (
        <div className="flex items-center gap-2 self-start rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700">
          <span className="flex gap-1" aria-hidden="true">
            {[0, 150, 300].map((d) => (
              <span
                key={d}
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500 motion-reduce:animate-none"
                style={{ animationDelay: `${d}ms` }}
              />
            ))}
          </span>
          {vi.workspace.waiting}
        </div>
      )}

      {pending?.state === "failed" && (
        <div role="alert" className="self-stretch rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-950">
          <p>{pending.error}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onResend}
              className={`rounded-md bg-red-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-900 ${FOCUS_RING}`}
            >
              {vi.workspace.resend}
            </button>
            <button
              type="button"
              onClick={onDiscard}
              className={`rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-900 hover:bg-red-100 ${FOCUS_RING}`}
            >
              {vi.workspace.discard}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
