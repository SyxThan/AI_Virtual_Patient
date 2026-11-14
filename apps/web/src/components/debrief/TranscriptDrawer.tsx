"use client";

import { useEffect, useRef } from "react";
import { useFocusTrap } from "@/components/ui/useFocusTrap";
import vi from "../../../messages/vi.json";
import { buttonClass } from "@/components/ui/Button";
import type { TurnRow } from "@/hooks/useDebriefData";
import { fmt } from "@/lib/sessionAuth";

const SPEAKER: Record<string, string> = {
  student: vi.debrief.transcript.student,
  patient: vi.debrief.transcript.patient,
  system: vi.debrief.transcript.system,
};

/** Side drawer with the full transcript; scrolls to and highlights `focusIdx`. */
export default function TranscriptDrawer({
  turns,
  focusIdx,
  onClose,
}: {
  turns: TurnRow[];
  focusIdx: number;
  onClose: () => void;
}) {
  const refs = useRef(new Map<number, HTMLLIElement>());
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  // Focus starts on "close", stays inside the drawer, Escape closes, focus returns.
  useFocusTrap(true, panelRef, onClose, closeRef);

  useEffect(() => {
    refs.current.get(focusIdx)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusIdx, turns]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/50" onClick={onClose}>
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={vi.debrief.transcript.title}
        className="flex h-full w-full max-w-lg flex-col bg-canvas shadow-xl outline-none sm:rounded-l-tile"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3 sm:rounded-tl-tile">
          <h2 className="text-lg font-bold tracking-tight text-ink">{vi.debrief.transcript.title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className={buttonClass({ variant: "secondary", pill: true })}
          >
            {vi.debrief.transcript.close}
          </button>
        </header>
        <ol className="flex-1 space-y-2.5 overflow-y-auto p-4 sm:p-5">
          {turns.length === 0 && <p className="text-sm text-ink-muted">{vi.debrief.transcript.empty}</p>}
          {turns.map((t) => {
            const focused = t.turn_idx === focusIdx;
            const student = t.speaker === "student";
            return (
              <li
                key={t.turn_idx}
                ref={(el) => {
                  if (el) refs.current.set(t.turn_idx, el);
                  else refs.current.delete(t.turn_idx);
                }}
                className={`rounded-card border px-4 py-3 text-sm leading-relaxed text-ink transition-colors ${student ? "ml-6" : "mr-6"} ${
                  focused
                    ? "border-primary bg-primary-soft ring-2 ring-primary"
                    : student
                      ? "border-info-soft bg-info-soft"
                      : "border-line bg-surface"
                }`}
              >
                <span className="mb-1 flex flex-wrap gap-x-3 text-xs font-semibold text-ink-muted">
                  <span>{SPEAKER[t.speaker] ?? t.speaker}</span>
                  <span className="tabular font-normal">{fmt(vi.debrief.rubric.turn, { idx: t.turn_idx })}</span>
                </span>
                {t.text}
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}
