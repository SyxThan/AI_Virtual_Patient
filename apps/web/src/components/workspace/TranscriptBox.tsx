"use client";

import { useEffect, useRef } from "react";
import vi from "../../../messages/vi.json";

export type Turn = { turn_idx: number; speaker: string; text: string };

export default function TranscriptBox({ turns }: { turns: Turn[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      {turns.length === 0 && <p className="m-auto text-center text-gray-500">{vi.session.empty}</p>}
      {turns.map((t) => {
        const mine = t.speaker === "student";
        return (
          <div
            key={`${t.turn_idx}-${t.speaker}`}
            className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
              mine
                ? "self-end bg-blue-600 text-white"
                : "self-start border border-gray-200 bg-gray-100 text-gray-900"
            }`}
          >
            <span className="mb-0.5 block text-[11px] opacity-70">
              {mine ? vi.session.you : vi.session.mother}
            </span>
            {t.text}
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
