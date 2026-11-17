"use client";

import vi from "../../../messages/vi.json";
import { FOCUS_RING } from "@/components/ui/focus";
import { fmt } from "@/lib/sessionAuth";
import { EXAM_TARGETS, type ExamTarget } from "./examTurns";

/**
 * "Phiếu khám": every exam target with what was recorded for it, verbatim from
 * the transcript (the source of truth). An unexamined region says so and
 * offers to fly the camera there; nothing is ever filled in for it.
 */
export default function ExamRecord({
  findings,
  onOpen,
  onGoTo,
}: {
  /** Target -> recorded finding text (null: recorded, result not yet in). */
  findings: Partial<Record<ExamTarget, string | null>>;
  onOpen: (target: ExamTarget, finding: string | null) => void;
  onGoTo: (target: ExamTarget) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
      <ul className="flex flex-col gap-2">
        {EXAM_TARGETS.map((target) => {
          const examined = target in findings;
          const finding = findings[target] ?? null;
          const label = vi.exam.regions[target];
          return (
            <li key={target} className={`rounded-card p-3 ring-1 ${examined ? "bg-surface ring-line" : "bg-canvas ring-line/60"}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-bold text-ink">
                  <span
                    aria-hidden="true"
                    className={`grid h-5 w-5 place-items-center rounded-full ${examined ? "bg-success text-white" : "border border-line-strong"}`}
                  >
                    {examined && (
                      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
                        <path d="M2.5 6.5l2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  {label}
                </p>
                {examined ? (
                  <button
                    type="button"
                    data-opens-exam=""
                    onClick={() => onOpen(target, finding)}
                    className={`min-h-11 rounded-control px-3 text-sm font-semibold text-primary hover:bg-primary-soft ${FOCUS_RING}`}
                  >
                    {vi.cockpit.record.open}
                  </button>
                ) : (
                  <span className="flex items-center gap-2">
                    <span className="text-sm text-ink-muted">{vi.cockpit.record.notExamined}</span>
                    <button
                      type="button"
                      onClick={() => onGoTo(target)}
                      aria-label={fmt(vi.cockpit.record.goToLabel, { region: label.toLowerCase() })}
                      className={`min-h-11 rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-canvas ${FOCUS_RING}`}
                    >
                      {vi.cockpit.record.goTo}
                    </button>
                  </span>
                )}
              </div>
              {examined && (
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink">{finding ?? vi.cockpit.examPending}</p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-4 flex items-start gap-2 text-xs leading-snug text-warning">
        <svg viewBox="0 0 20 20" className="mt-px h-3.5 w-3.5 shrink-0" fill="none" aria-hidden="true">
          <path d="M10 3l7.5 13h-15L10 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M10 8.5v3.5M10 14.2v.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {vi.exam.draft}
      </p>
    </div>
  );
}
