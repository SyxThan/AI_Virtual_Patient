"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import vi from "../../../messages/vi.json";
import { speakerText, useCaseVoice } from "@/components/workspace/caseVoice";
import Badge from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { FOCUS_RING } from "@/components/ui/focus";
import { fmt } from "@/lib/sessionAuth";
import { useExamRegions } from "./examRegions";
import { foldTranscript, type ExamTarget } from "./examTurns";

export type Turn = { turn_idx: number; speaker: string; text: string };

/** A typed question not yet answered: in flight, or failed (never saved by the server). */
export type PendingTurn = { text: string; state: "sending" | "failed"; error?: string };

const BUBBLE = "max-w-[85%] whitespace-pre-line break-words rounded-card px-4 py-2.5 text-base leading-relaxed sm:text-sm";
const NEAR_BOTTOM_PX = 56;

/** "Đã khám lòng bàn tay" / "Đã quan sát toàn trạng". */
export function examEventLabel(target: ExamTarget, labelOf: (t: ExamTarget) => string): string {
  return target === "observe_child"
    ? vi.cockpit.observeDone
    : fmt(vi.cockpit.examDone, { region: labelOf(target).toLowerCase() });
}

/**
 * The interview transcript. Exam actions (a "[Khám - …]" turn and its recorded
 * finding) show as one compact, centred event line that reopens the result.
 * It follows new messages only while the reader is at the bottom; scrolled up,
 * a "Tin mới" button appears instead. A pending question is shown apart from
 * saved turns, and a failed question is never shown as answered (T-UX-02).
 * Replies are announced by the page's live region, so this log stays quiet.
 */
export default function TranscriptBox({
  turns,
  pending,
  waiting,
  onResend,
  onDiscard,
  onOpenExam,
}: {
  turns: Turn[];
  pending: PendingTurn | null;
  waiting: boolean;
  onResend: () => void;
  onDiscard: () => void;
  onOpenExam: (target: ExamTarget, finding: string | null) => void;
}) {
  const voice = useCaseVoice();
  const boxRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [unseen, setUnseen] = useState(false);
  const { labelOf, labelToTarget } = useExamRegions();
  const items = useMemo(() => foldTranscript(turns, labelToTarget), [turns, labelToTarget]);
  const showWaiting = waiting || pending?.state === "sending";
  const contentKey = `${turns.length}|${pending?.state ?? ""}|${showWaiting}`;

  const scrollToEnd = (smooth: boolean) => {
    const box = boxRef.current;
    if (!box) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollTo({ top: box.scrollHeight, behavior: smooth && !reduce ? "smooth" : "auto" });
  };

  // First paint: start at the latest message.
  useLayoutEffect(() => {
    scrollToEnd(false);
  }, []);

  // New content: follow it only if the reader was already at the bottom.
  useEffect(() => {
    if (atBottomRef.current) {
      scrollToEnd(true);
      return;
    }
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setUnseen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [contentKey]);

  const onScroll = () => {
    const box = boxRef.current;
    if (!box) return;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < NEAR_BOTTOM_PX;
    atBottomRef.current = atBottom;
    if (atBottom && unseen) setUnseen(false);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={boxRef}
        role="log"
        aria-live="off"
        aria-label={vi.workspace.regions.transcript}
        tabIndex={0}
        onScroll={onScroll}
        className={`flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4 ${FOCUS_RING} focus-visible:ring-inset focus-visible:ring-offset-0`}
      >
        {turns.length === 0 && !pending && (
          <p className="m-auto max-w-sm text-center text-ink-muted">{speakerText(vi.session.empty, voice)}</p>
        )}
        {items.map((item) => {
          if (item.kind === "exam") {
            return (
              <button
                key={item.key}
                type="button"
                data-opens-exam=""
                onClick={() => onOpenExam(item.target, item.finding)}
                title={vi.cockpit.viewResult}
                className={`inline-flex min-h-11 items-center gap-2 self-center rounded-full border border-sand-ink/20 bg-sand-soft px-4 text-sm font-semibold text-sand-ink hover:border-sand-ink/40 ${FOCUS_RING}`}
              >
                <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 shrink-0" fill="none" aria-hidden="true">
                  <path d="M2.5 6.5l2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {examEventLabel(item.target, labelOf)}
                <span className="sr-only">. {vi.cockpit.viewResult}</span>
              </button>
            );
          }
          const t = item.turn;
          if (t.speaker === "system") {
            // A recorded finding without its "[Khám - …]" turn: still shown, never dropped.
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
                mine ? "self-end rounded-br-control bg-primary text-white" : "self-start rounded-bl-control bg-sand-soft text-ink"
              }`}
            >
              <span className={`mb-0.5 block text-xs font-semibold ${mine ? "text-primary-soft" : "text-sand-ink"}`}>
                {mine ? vi.session.you : voice.Who}
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
          <div className="flex items-center gap-2 self-start rounded-card rounded-bl-control bg-sand-soft px-4 py-2.5 text-sm text-sand-ink">
            <span className="flex gap-1" aria-hidden="true">
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-sand-ink motion-reduce:animate-none"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </span>
            {speakerText(vi.workspace.waiting, voice)}
          </div>
        )}

        {pending?.state === "failed" && (
          <div role="alert" className="self-stretch rounded-card border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-ink">
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

      {unseen && (
        <button
          type="button"
          onClick={() => {
            setUnseen(false);
            atBottomRef.current = true;
            scrollToEnd(true);
          }}
          className={`absolute bottom-3 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-white shadow-lg ${FOCUS_RING}`}
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
            <path d="M10 4v11M5 10.5l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {vi.cockpit.newMessages}
        </button>
      )}
    </div>
  );
}
