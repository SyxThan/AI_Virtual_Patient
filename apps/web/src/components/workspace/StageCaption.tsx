"use client";

import { useEffect, useState } from "react";
import vi from "../../../messages/vi.json";
import { FOCUS_RING } from "@/components/ui/focus";

const OFF_KEY = "avp_caption_off_v1";

/**
 * The mother's latest reply as a one- or two-line caption over the stage, so
 * the learner reads it without looking at the chat column. Hidden from screen
 * readers: the page's live region announces each reply once. The on/off choice
 * is remembered in this browser (a convenience only).
 */
export default function StageCaption({ text }: { text: string | null }) {
  const [off, setOff] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      try {
        if (!cancelled) setOff(localStorage.getItem(OFF_KEY) === "1");
      } catch {
        /* storage blocked: captions stay on */
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = () => {
    setOff((cur) => {
      const next = !cur;
      try {
        localStorage.setItem(OFF_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  if (!text) return null;

  return (
    <div className="pointer-events-auto flex items-start justify-center gap-2">
      {!off && (
        <p
          aria-hidden="true"
          key={text}
          className="line-clamp-2 max-w-3xl rounded-card bg-ink/85 px-4 py-2 text-center text-base leading-snug text-white shadow-lg backdrop-blur motion-safe:animate-[fade-in_var(--dur-base)_var(--ease-out)_both]"
        >
          <span className="mr-1.5 font-semibold text-glow">{vi.session.mother}:</span>
          {text}
        </p>
      )}
      <button
        type="button"
        onClick={toggle}
        aria-pressed={!off}
        aria-label={off ? vi.cockpit.caption.show : vi.cockpit.caption.hide}
        title={off ? vi.cockpit.caption.show : vi.cockpit.caption.hide}
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface/90 text-ink shadow-sm ring-1 ring-line/60 backdrop-blur hover:bg-surface ${FOCUS_RING}`}
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
          <rect x="2.5" y="4.5" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8.5 8.6a2 2 0 1 0 0 2.8M14 8.6a2 2 0 1 0 0 2.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          {off && <path d="M3 3l14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
        </svg>
      </button>
    </div>
  );
}
