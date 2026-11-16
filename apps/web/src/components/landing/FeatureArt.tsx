"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import vi from "../../../messages/vi.json";
import { useActive, useInView } from "@/hooks/useMotionPrefs";

const A = vi.landing.art;
const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

/**
 * Shared frame for every feature illustration: a fixed-size box (no layout
 * shift), plays once when 35% of it is on screen, replays on hover, and keeps
 * its loops paused while off screen or in a hidden tab. Decorative only.
 */
function ArtFrame({
  children,
  className = "",
  viewBox = "0 0 160 96",
}: {
  children: (state: { active: boolean }) => ReactNode;
  className?: string;
  viewBox?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { threshold: 0.35, once: true });
  const active = useActive(ref);
  const [replays, setReplays] = useState(0);
  return (
    <div
      ref={ref}
      data-art=""
      data-play={seen ? "" : undefined}
      data-paused={!active}
      onPointerEnter={() => seen && setReplays((n) => n + 1)}
      className={`relative shrink-0 ${className || "h-24 w-40"}`}
      aria-hidden="true"
    >
      <svg
        key={replays}
        viewBox={viewBox}
        className="h-full w-full overflow-visible"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children({ active })}
      </svg>
    </div>
  );
}

const BARS = [18, 34, 52, 70, 44, 26, 58, 76, 40, 22, 48, 64, 30];

/** Voice: a mic and a live waveform; hover raises the amplitude. */
export function VoiceArt() {
  return (
    <div className="group/art">
      <ArtFrame className="h-28 w-[11.5rem]">
        {() => (
          <>
            <rect x="8" y="26" width="18" height="30" rx="9" />
            <path d="M3 46a14 14 0 0 0 28 0M17 60v10M10 70h14" />
            <g className="origin-center transition-transform duration-[var(--dur-base)] group-hover/art:scale-y-[1.3]" style={{ transformBox: "fill-box" }}>
              {BARS.map((h, i) => (
                <line
                  key={i}
                  x1={44 + i * 9}
                  x2={44 + i * 9}
                  y1={48 - h / 2}
                  y2={48 + h / 2}
                  strokeWidth="4"
                  className="animate-wave"
                  style={{ transformBox: "fill-box", transformOrigin: "center", animationDelay: `${(i % 6) * 110}ms` }}
                />
              ))}
            </g>
          </>
        )}
      </ArtFrame>
    </div>
  );
}

/** Exam art box, in rem (aspect 1.6 = the viewBox). */
const EXAM_W = 12;
const EXAM_H = 7.5;

/** Exam: the child, with three real exam regions sending out ripples in turn; hover a point for its name. */
export function ExamArt() {
  const points = [
    { key: "mouth", label: A.mouth, cx: 80, cy: 26, d: 0 },
    { key: "palm", label: A.palm, cx: 44, cy: 54, d: 800 },
    { key: "sole", label: A.sole, cx: 96, cy: 90, d: 1600 },
  ];
  return (
    <div className="relative">
      <ArtFrame viewBox="0 0 160 100" className="h-[7.5rem] w-48">
        {() => (
          <>
            {/* Toddler: round head, soft body, arms out, legs (filled at low opacity, outlined). */}
            <circle cx="80" cy="20" r="14" fill="currentColor" fillOpacity="0.12" strokeWidth="2.5" />
            <path d="M68 38c4-3 20-3 24 0l3 28H65z" fill="currentColor" fillOpacity="0.12" strokeWidth="2.5" />
            <path d="M68 42l-22 11M92 42l22 11M72 66l-6 22M88 66l8 22" strokeWidth="5" strokeOpacity="0.85" />
            {points.map((p) => (
              <g key={p.key}>
                <circle cx={p.cx} cy={p.cy} r="6" className="art-ripple" style={d(p.d)} />
                <circle cx={p.cx} cy={p.cy} r="4" fill="currentColor" stroke="none" />
              </g>
            ))}
          </>
        )}
      </ArtFrame>
      {/* Hover targets and labels sit over the SVG (decorative: the card text names the regions). */}
      {points.map((p) => (
        <span
          key={p.key}
          className="group/pt absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${(p.cx / 160) * EXAM_W}rem`, top: `${(p.cy / 100) * EXAM_H}rem` }}
          aria-hidden="true"
        >
          <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-white opacity-0 transition-opacity duration-[var(--dur-fast)] group-hover/pt:opacity-100">
            {p.label}
          </span>
        </span>
      ))}
    </div>
  );
}

/** OSCE: three checklist rows tick themselves 250 ms apart. */
export function ChecklistArt() {
  return (
    <ArtFrame>
      {() => (
        <>
          {[14, 46, 78].map((y, i) => (
            <g key={y}>
              <rect x="6" y={y - 9} width="18" height="18" rx="5" strokeOpacity="0.5" />
              <path d={`M10 ${y}l4 4 7-8`} pathLength={1} className="art-draw" style={d(200 + i * 250)} strokeWidth="2.6" />
              <path d={`M36 ${y}h${[92, 112, 76][i]}`} strokeOpacity="0.35" strokeWidth="6" />
            </g>
          ))}
        </>
      )}
    </ArtFrame>
  );
}

/** Cited feedback: a highlighter sweeps one line, then its citation number pops up. */
export function CitationArt() {
  return (
    <ArtFrame>
      {() => (
        <>
          <path d="M8 14h120M8 38h144M8 62h132M8 86h84" strokeOpacity="0.3" strokeWidth="6" />
          <rect x="4" y="29" width="152" height="18" rx="4" fill="var(--color-monitor)" fillOpacity="0.45" stroke="none" className="art-sweep" style={d(200)} />
          <path d="M8 38h144" strokeWidth="6" strokeOpacity="0.55" />
          <g className="art-pop" style={d(1100)}>
            <circle cx="152" cy="18" r="10" fill="currentColor" stroke="none" />
            <text x="152" y="22.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="white" stroke="none">
              1
            </text>
          </g>
        </>
      )}
    </ArtFrame>
  );
}

/** Progress: a small score line draws itself up through five attempts. */
export function ProgressArt() {
  const pts = [
    [10, 78],
    [46, 64],
    [82, 70],
    [118, 40],
    [150, 20],
  ];
  return (
    <ArtFrame>
      {() => (
        <>
          <path d="M4 90h152" strokeOpacity="0.3" />
          <path d={pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ")} pathLength={1} className="art-draw" style={{ ...d(150), animationDuration: "1100ms" }} strokeWidth="2.6" />
          {pts.map(([x, y], i) => (
            <circle key={x} cx={x} cy={y} r="4" fill="currentColor" stroke="none" className="art-pop" style={d(250 + i * 220)} />
          ))}
        </>
      )}
    </ArtFrame>
  );
}
