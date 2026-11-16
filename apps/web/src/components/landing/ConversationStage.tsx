"use client";

import { useEffect, useRef, useState } from "react";
import vi from "../../../messages/vi.json";
import { FOCUS_RING_DARK } from "@/components/ui/focus";
import { useActive, useReducedMotion } from "@/hooks/useMotionPrefs";
import { emitEcg } from "./ecgEvents";

const S = vi.landing.stage;

/*
 * A real exchange from the demo case, replayed every 10 s. The mother's lines
 * are her verbatim lay responses from data/cases/case-01-hfmd.json (h-fever,
 * h-startle); the red flag is that history item's own label (red_flag: true).
 * Nothing here is invented (Hard rule 1).
 */
type Line = { who: "student" | "mother"; text: string; at: number; until?: number };
const LINES: Line[] = [
  { who: "student", text: S.student1, at: 300 },
  { who: "mother", text: S.mother1, at: 1700, until: 3900 },
  { who: "student", text: S.student2, at: 4300 },
  { who: "mother", text: S.mother2, at: 5700, until: 7700 },
];
const TYPE_MS = 1100;
const FLAG_AT = 6600;
const BOOST_MS = 2000;
const FADE_AT = 9500;
const LOOP_MS = 10000;
const TICK_MS = 50;
/** A point in the loop where everything is on screen (static and paused states). */
const ALL_SHOWN = 9000;

function MotherChildMark() {
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="20" fill="var(--color-sand-soft)" />
      <circle cx="17" cy="13" r="5" fill="var(--color-sand-ink)" />
      <path d="M7.5 32c1-7 5-10.5 9.5-10.5s8.5 3.5 9.5 10.5" fill="var(--color-sand-ink)" />
      <circle cx="27.5" cy="22" r="3.4" fill="var(--color-primary)" />
      <path d="M22 32c.6-3.6 2.8-5.6 5.5-5.6S32.4 28.4 33 32" fill="var(--color-primary)" />
    </svg>
  );
}

function SpeakingBars({ on }: { on: boolean }) {
  return (
    <span
      className={`mb-2 flex h-5 shrink-0 items-center gap-[3px] transition-opacity duration-[var(--dur-base)] ${on ? "opacity-100" : "opacity-0"}`}
      aria-hidden="true"
    >
      {[0.5, 1, 0.7, 0.9, 0.45].map((h, i) => (
        <span
          key={i}
          className={`w-[3px] origin-center rounded-full bg-sand-soft ${on ? "animate-wave" : ""}`}
          style={{ height: `${h * 100}%`, animationDelay: `${i * 110}ms` }}
        />
      ))}
    </span>
  );
}

/**
 * The hero's sample conversation: student lines type themselves, the mother's
 * lines arrive with a speaking waveform, and on the last answer the red-flag
 * label pops and the ECG beats faster for 2 s. Has a pause button; stops off
 * screen and in hidden tabs. The full dialogue is in the DOM from the server
 * render for screen readers; reduced motion shows it all, still.
 */
export default function ConversationStage() {
  const rootRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const active = useActive(rootRef);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [t, setT] = useState(ALL_SHOWN);
  const boostedLoopRef = useRef(-1);
  const loopRef = useRef(0);

  // After hydration: start the loop from the beginning (or stay still).
  useEffect(() => {
    const id = setTimeout(() => {
      setReady(true);
      if (!reduced) setT(0);
    }, 0);
    return () => clearTimeout(id);
  }, [reduced]);

  const running = ready && !reduced && playing && active;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setT((cur) => {
        const next = cur + TICK_MS;
        if (next >= LOOP_MS) {
          loopRef.current += 1;
          return 0;
        }
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  // The red flag lands: one ECG burst per loop.
  useEffect(() => {
    if (!running || t < FLAG_AT || boostedLoopRef.current === loopRef.current) return;
    boostedLoopRef.current = loopRef.current;
    emitEcg({ kind: "boost", ms: BOOST_MS });
  }, [running, t]);

  const still = !ready || reduced;
  const fading = !still && t >= FADE_AT;
  const flagShown = still || t >= FLAG_AT;

  return (
    <figure
      ref={rootRef}
      data-paused={!running}
      data-ready={ready}
      className="relative flex h-full flex-col overflow-hidden rounded-card bg-white/[0.07] p-4 ring-1 ring-white/15 backdrop-blur-sm sm:p-5"
    >
      <figcaption className="flex items-center gap-3">
        <MotherChildMark />
        <span className="min-w-0">
          <span className="block text-sm font-bold text-white">{S.speakerMother}</span>
          <span className="flex items-center gap-1.5 text-xs text-ink-inverse-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-glow motion-safe:animate-breathe" aria-hidden="true" />
            {S.status}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-pressed={!playing}
          aria-label={playing ? S.pause : S.play}
          title={playing ? S.pause : S.play}
          className={`ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 motion-reduce:hidden ${FOCUS_RING_DARK}`}
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
            {playing ? <path d="M4 3h3v10H4zM9 3h3v10H9z" /> : <path d="M5 3l8 5-8 5z" />}
          </svg>
        </button>
      </figcaption>

      {/* Every line is always in the DOM (only its opacity changes), so the box has its final size from the first paint. */}
      <ol
        className={`my-5 flex flex-1 flex-col justify-center gap-3 transition-opacity duration-[var(--dur-base)] ${
          fading ? "opacity-0" : "opacity-100"
        }`}
      >
        {LINES.map((line, i) => {
          const shown = still || t >= line.at;
          const mine = line.who === "student";
          const typed =
            still || !mine ? line.text : line.text.slice(0, Math.max(0, Math.round(((t - line.at) / TYPE_MS) * line.text.length)));
          const typing = !still && mine && shown && typed.length < line.text.length;
          const speaking = !still && !mine && line.until !== undefined && t >= line.at && t < line.until;
          const last = i === LINES.length - 1;
          return (
            <li
              key={i}
              className={`chat-line transition-[opacity,transform] duration-[var(--dur-base)] ease-[var(--ease-out)] ${
                mine ? "self-end" : "self-start"
              } max-w-[92%] ${shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
            >
              <span className="sr-only">{mine ? S.speakerYou : S.speakerMother}: {line.text}</span>
              <span className={`flex items-end gap-2 ${mine ? "justify-end" : ""}`} aria-hidden="true">
              <span
                className={`relative block rounded-card px-4 py-3 text-sm leading-relaxed ${
                  mine ? "rounded-br-control bg-primary text-white" : "rounded-bl-control bg-sand-soft text-ink"
                }`}
              >
                {/* The full text reserves the bubble's final size; the typed text sits on top. */}
                <span className={mine ? "invisible" : undefined}>{line.text}</span>
                {mine && (
                  <span className="absolute inset-0 px-4 py-3">
                    {typed}
                    {typing && <span className="ml-0.5 inline-block h-[1.1em] w-px translate-y-[0.2em] bg-white" />}
                  </span>
                )}
              </span>
                {!mine && <SpeakingBars on={speaking} />}
              </span>
              {last && (
                <span
                  className={`mt-2 inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-3 py-1 text-xs font-bold text-danger ${
                    flagShown ? "opacity-100" : "opacity-0"
                  } ${flagShown && !still ? "animate-[flag-pop_520ms_var(--ease-out)_both]" : ""}`}
                >
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3.5 14V2.5M3.5 3h8l-1.8 3 1.8 3h-8" />
                  </svg>
                  <span>
                    {S.flagLabel}: {S.flag}
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex items-center gap-3 rounded-full bg-ink-deep/60 py-2 pl-2 pr-4 ring-1 ring-white/10">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white" aria-hidden="true">
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none">
            <rect x="7" y="2.5" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.7" />
            <path d="M4.5 9.5a5.5 5.5 0 0011 0M10 15v2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </span>
        <span className="flex h-7 flex-1 items-center justify-center gap-1" aria-hidden="true">
          {[0.35, 0.6, 1, 0.75, 0.45, 0.9, 0.55, 0.8, 0.4, 0.7, 1, 0.5, 0.3].map((h, i) => (
            <span
              key={i}
              className="w-1 origin-center rounded-full bg-glow motion-safe:animate-wave"
              style={{ height: `${Math.round(h * 100)}%`, animationDelay: `${(i % 5) * 120}ms` }}
            />
          ))}
        </span>
        <span className="shrink-0 text-sm font-semibold text-white">{S.mic}</span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-inverse-muted">{S.caption}</p>
    </figure>
  );
}
