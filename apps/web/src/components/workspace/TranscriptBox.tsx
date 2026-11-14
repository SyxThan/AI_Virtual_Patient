"use client";

import { useEffect, useRef } from "react";
import vi from "../../../messages/vi.json";
import Badge from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { FOCUS_RING } from "@/components/ui/focus";

export type Turn = { turn_idx: number; speaker: string; text: string };

/** A typed question not yet answered: in flight, or failed (never saved by the server). */
export type PendingTurn = { text: string; state: "sending" | "failed"; error?: string };

const BUBBLE = "max-w-[85%] whitespace-pre-line break-words rounded-card px-4 py-2.5 text-base leading-relaxed sm:text-sm";

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
      className={`flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 sm:p-6 ${FOCUS_RING} focus-visible:ring-inset focus-visible:ring-offset-0`}
    >
      {turns.length === 0 && !pending && (
        <p className="m-auto max-w-sm text-center text-ink-muted">{vi.session.empty}</p>
      )}
      {turns.map((t) => {
        if (t.speaker === "system") {
          // Recorded exam finding: not something the mother said.
          return (
            <div
              key={`${t.turn_idx}-${t.speaker}`}
              className="max-w-[92%] self-center whitespace-pre-line break-words rounded-card border border-sand-ink/20 bg-sand-soft px-4 py-2.5 text-sm text-sand-ink"
            >
              <span className="mb-0.5 block font-bold">{vi.exam.systemLabel}</span>
              {t.text}
            </div>
          );
        }
        const mine = t.speaker === "student";
        return (
          <div
            key={`${t.turn_idx}-${t.speaker}`}
            className={`${BUBBLE} ${
              mine
                ? "self-end rounded-br-control bg-primary text-white"
                : "self-start rounded-bl-control bg-canvas text-ink"
            }`}
          >
            <span
              className={`mb-0.5 block text-xs font-semibold ${mine ? "text-primary-soft" : "text-ink-muted"}`}
            >
              {mine ? vi.session.you : vi.session.mother}
            </span>
            {t.text}
          </div>
        );
      })}

      {pending && (
        <div
          className={`${BUBBLE} self-end rounded-br-control ${
            pending.state === "failed"
              ? "border border-warning/40 bg-warning-soft text-ink"
              : "border border-dashed border-primary/50 bg-primary-soft text-ink"
          }`}
        >
          <span className="mb-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-ink-muted">
            {vi.session.you}
            {pending.state === "failed" && <Badge tone="warning">{vi.workspace.notSent}</Badge>}
          </span>
          {pending.text}
        </div>
      )}

      {showWaiting && (
        <div className="flex items-center gap-2 self-start rounded-card rounded-bl-control bg-canvas px-4 py-2.5 text-sm text-ink-muted">
          <span className="flex gap-1" aria-hidden="true">
            {[0, 150, 300].map((d) => (
              <span
                key={d}
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted motion-reduce:animate-none"
                style={{ animationDelay: `${d}ms` }}
              />
            ))}
          </span>
          {vi.workspace.waiting}
        </div>
      )}

      {pending?.state === "failed" && (
        <div
          role="alert"
          className="self-stretch rounded-card border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-ink"
        >
          <p>{pending.error}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onResend} className={buttonClass({ variant: "primary" })}>
              {vi.workspace.resend}
            </button>
            <button type="button" onClick={onDiscard} className={buttonClass({ variant: "secondary" })}>
              {vi.workspace.discard}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
