"use client";

import { useEffect, useRef } from "react";
import { useFocusTrap } from "@/components/ui/useFocusTrap";
import vi from "../../../messages/vi.json";
import { FOCUS_RING } from "@/components/ui/focus";
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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={vi.debrief.transcript.title}
        className="flex h-full w-full max-w-lg flex-col bg-white shadow-xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="font-semibold text-gray-900">{vi.debrief.transcript.title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className={`rounded-md px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 ${FOCUS_RING}`}
          >
            {vi.debrief.transcript.close}
          </button>
        </header>
        <ol className="flex-1 space-y-2 overflow-y-auto p-4">
          {turns.length === 0 && <p className="text-sm text-gray-600">{vi.debrief.transcript.empty}</p>}
          {turns.map((t) => {
            const focused = t.turn_idx === focusIdx;
            return (
              <li
                key={t.turn_idx}
                ref={(el) => {
                  if (el) refs.current.set(t.turn_idx, el);
                  else refs.current.delete(t.turn_idx);
                }}
                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                  focused
                    ? "border-yellow-400 bg-yellow-100 ring-2 ring-yellow-300"
                    : t.speaker === "student"
                      ? "border-blue-100 bg-blue-50"
                      : "border-gray-200 bg-gray-50"
                }`}
              >
                <span className="mb-0.5 block text-xs text-gray-600">
                  {fmt(vi.debrief.rubric.turn, { idx: t.turn_idx })} · {SPEAKER[t.speaker] ?? t.speaker}
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
