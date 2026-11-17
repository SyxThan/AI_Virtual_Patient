"use client";

import { useEffect, useRef, useState } from "react";
import vi from "../../../messages/vi.json";
import type { components } from "@/lib/api-client/schema";
import type { ExamTarget } from "@/components/workspace/examTurns";
import Badge from "@/components/ui/Badge";
import { FOCUS_RING } from "@/components/ui/focus";

export type ExamActionResponse = components["schemas"]["ExamActionResponse"];

/**
 * What the card shows. `live`: the answer of the exam action just performed
 * (finding verbatim from the case JSON, via the backend). `transcript`: a past
 * exam reopened from the conversation, shown with the text the transcript
 * recorded, verbatim; nothing is inferred from it.
 */
export type ExamCardState =
  | { source: "live"; target: ExamTarget; loading: boolean; error: string | null; result: ExamActionResponse | null }
  | { source: "transcript"; target: ExamTarget; finding: string | null; documented: boolean | undefined };

const AUTO_CLOSE_MS = 8000;

/**
 * Exam result shown beside the examined region on the stage (AvatarScene moves
 * it with `data-anchor`). It closes on its own after 8 s or on a click outside,
 * unless pinned; Escape and the close button always close it. Never steals
 * focus: the result is also announced through the page's live region.
 */
export default function ExamResultCard({
  state,
  pinned,
  onPin,
  onClose,
}: {
  state: ExamCardState;
  pinned: boolean;
  onPin: (pinned: boolean) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState(false); // pointer over or focus inside: keep it open
  const loading = state.source === "live" && state.loading;

  useEffect(() => {
    if (pinned || held || loading) return;
    const id = window.setTimeout(onClose, AUTO_CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [pinned, held, loading, onClose, state]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (pinned) return;
      const t = e.target as Element | null;
      // Opening another result (marker, chip, transcript event) replaces this one instead.
      if (!t || ref.current?.contains(t) || t.closest("[data-opens-exam]")) return;
      onClose();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [pinned, onClose]);

  const regionLabel = vi.exam.regions[state.target];
  const result = state.source === "live" ? state.result : null;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={`${vi.exam.panelTitle}: ${regionLabel}`}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false);
      }}
      className="pointer-events-auto rounded-card bg-surface/97 p-4 text-ink shadow-xl ring-1 ring-line backdrop-blur motion-safe:animate-[fade-in_var(--dur-base)_var(--ease-out)_both]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{vi.exam.panelTitle}</p>
          <h3 className="font-display text-lg font-bold leading-tight">{regionLabel}</h3>
        </div>
        <div className="-mr-2 -mt-2 flex shrink-0">
          <button
            type="button"
            onClick={() => onPin(!pinned)}
            aria-pressed={pinned}
            aria-label={pinned ? vi.cockpit.card.unpin : vi.cockpit.card.pin}
            title={pinned ? vi.cockpit.card.unpin : vi.cockpit.card.pin}
            className={`grid h-11 w-11 place-items-center rounded-full ${pinned ? "text-primary" : "text-ink-muted"} hover:bg-canvas ${FOCUS_RING}`}
          >
            <PinIcon filled={pinned} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={vi.cockpit.card.close}
            title={vi.cockpit.card.close}
            className={`grid h-11 w-11 place-items-center rounded-full text-ink-muted hover:bg-canvas hover:text-ink ${FOCUS_RING}`}
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="mt-2 max-h-[40vh] overflow-y-auto">
        {state.source === "live" && state.loading && (
          <p className="flex items-center gap-3 text-sm text-ink-muted">
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-primary motion-reduce:animate-none"
              aria-hidden="true"
            />
            {vi.exam.loading}
          </p>
        )}
        {state.source === "live" && state.error && (
          <p className="rounded-control border border-warning/30 bg-warning-soft px-3 py-2 text-sm">{state.error}</p>
        )}

        {result && !loading && (
          <>
            {result.red_flag && (
              <Badge tone="danger" className="mb-2">
                {vi.exam.redFlag}
              </Badge>
            )}
            {result.documented ? (
              <>
                {result.case_action && (
                  <p className="mb-1.5 text-sm text-ink-muted">
                    {vi.exam.caseAction}: {result.case_action}
                  </p>
                )}
                <p className="text-xs font-semibold text-ink-muted">{vi.exam.finding}</p>
                <p className="mt-0.5 whitespace-pre-line text-base leading-relaxed">{result.finding}</p>
              </>
            ) : (
              <p className="text-sm leading-relaxed">{vi.exam.unknown}</p>
            )}
          </>
        )}

        {state.source === "transcript" && (
          <>
            <p className="text-xs font-semibold text-ink-muted">{vi.cockpit.card.fromTranscript}</p>
            {state.documented === false ? (
              <p className="mt-0.5 text-sm leading-relaxed">{vi.exam.unknown}</p>
            ) : (
              <p className="mt-0.5 whitespace-pre-line text-base leading-relaxed">
                {state.finding ?? vi.cockpit.examPending}
              </p>
            )}
          </>
        )}
      </div>

      {(state.source === "transcript" || (result && result.review_status !== "clinician_reviewed")) && (
        <p className="mt-3 flex items-start gap-2 text-xs leading-snug text-warning">
          <svg viewBox="0 0 20 20" className="mt-px h-3.5 w-3.5 shrink-0" fill="none" aria-hidden="true">
            <path d="M10 3l7.5 13h-15L10 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M10 8.5v3.5M10 14.2v.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          {vi.exam.draft}
        </p>
      )}
    </div>
  );
}

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill={filled ? "currentColor" : "none"} aria-hidden="true">
      <path
        d="M7.5 2.5h5l-.8 5 2.8 2.8v1.2h-9v-1.2L8.3 7.5zM10 11.5v6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
