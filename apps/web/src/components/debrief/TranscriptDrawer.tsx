"use client";

import { useEffect, useRef } from "react";
import vi from "../../../messages/vi.json";
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

  useEffect(() => {
    refs.current.get(focusIdx)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusIdx, turns]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={vi.debrief.transcript.title}
        className="flex h-full w-full max-w-lg flex-col bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="font-semibold text-gray-900">{vi.debrief.transcript.title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
          >
            {vi.debrief.transcript.close}
          </button>
        </header>
        <ol className="flex-1 space-y-2 overflow-y-auto p-4">
          {turns.length === 0 && <p className="text-sm text-gray-500">{vi.debrief.transcript.empty}</p>}
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
                <span className="mb-0.5 block text-[11px] text-gray-500">
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
