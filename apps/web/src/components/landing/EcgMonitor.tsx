"use client";

import { useEffect, useRef, useState } from "react";
import vi from "../../../messages/vi.json";
import { useActive, useReducedMotion } from "@/hooks/useMotionPrefs";
import { DEMO_VITALS } from "./demoVitals";
import { ECG_EVENT, type EcgEventDetail } from "./ecgEvents";

const M = vi.landing.monitor;

/*
 * Geometry. One beat is a piecewise-linear shape 120 units wide; five beats fill
 * the 600 x 120 viewBox. Because the trace is made of straight segments, the
 * sweep dot can follow it with plain translate keyframes (transform only).
 */
const W = 600;
const H = 120;
const BEAT: [number, number][] = [
  [22, 0], [6, -6], [6, 6], [10, 0], [4, 8], [8, -52], [8, 62], [5, -18], [10, 0], [9, -9], [9, 9], [23, 0],
];
const BEATS = 5;
const POINTS: [number, number][] = (() => {
  const pts: [number, number][] = [[0, 70]];
  let [x, y] = pts[0];
  for (let b = 0; b < BEATS; b++) {
    for (const [dx, dy] of BEAT) {
      x += dx;
      y += dy;
      pts.push([x, y]);
    }
  }
  return pts;
})();
const PATH = POINTS.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
/** x of each R peak (the tallest point of a beat). */
const PEAKS = Array.from({ length: BEATS }, (_, b) => b * 120 + 56);

const pct = (n: number) => `${+n.toFixed(3)}%`;
const DOT_Y = POINTS.map(([x, y]) => `${pct((x / W) * 100)}{transform:translateY(${pct((y / H) * 100)})}`).join("");
const HALO = [
  "0%{transform:scale(1);opacity:.35}",
  ...PEAKS.flatMap((x) => {
    const p = (x / W) * 100;
    return [
      `${pct(p - 1.5)}{transform:scale(1);opacity:.35}`,
      `${pct(p)}{transform:scale(2.6);opacity:.9}`,
      `${pct(p + 6)}{transform:scale(1);opacity:.35}`,
    ];
  }),
  "100%{transform:scale(1);opacity:.35}",
].join("");

// Generated once at module load: identical on server and client.
const KEYFRAMES = `
@keyframes ecg-dot-y{${DOT_Y}}
@keyframes ecg-halo{${HALO}}
@keyframes ecg-x{from{transform:translateX(0)}to{transform:translateX(100%)}}
@keyframes ecg-band{from{transform:translateX(0)}to{transform:translateX(${W}px)}}
@keyframes ecg-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
.js .ecg-draw{stroke-dasharray:1;animation:ecg-draw var(--dur-draw) var(--ease-out) 450ms both}
.ecg-live .ecg-band{animation:ecg-band 4s linear infinite}
.ecg-live .ecg-head-x{animation:ecg-x 4s linear infinite}
.ecg-live .ecg-head-y{animation:ecg-dot-y 4s linear infinite}
.ecg-live .ecg-halo{animation:ecg-halo 4s linear infinite}
`;

const HOVER_RATE = 1.2;
const BOOST_RATE = 1.6;

type Phase = "static" | "drawing" | "live";

function formatNumber(n: number, digits = 0) {
  return n.toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/**
 * The hero's patient monitor. On load the trace draws itself left to right
 * (stroke-dashoffset, --dur-draw), then runs as a live monitor: a bright head
 * sweeps across every 4 s with a fading trail and a halo that flares on each R
 * peak. The start button speeds it up ~20% on hover; a red flag in the sample
 * conversation gives a 2 s burst. Loops pause off screen and in hidden tabs.
 * Reduced motion: a still trace. Decorative (aria-hidden) except the vitals.
 */
export default function EcgMonitor() {
  const rootRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const active = useActive(rootRef);
  // "drawing" from the server render: with `.js` the CSS draw runs from first paint;
  // without JavaScript the trace simply shows in full.
  const [phase, setPhase] = useState<Phase>("drawing");
  const [pulse, setPulse] = useState<number>(DEMO_VITALS.pulse);
  const hoverRef = useRef(false);
  const boostUntilRef = useRef(0);

  // Draw first, then go live; reduced motion keeps a still trace.
  useEffect(() => {
    const id = setTimeout(() => setPhase(reduced ? "static" : "live"), reduced ? 0 : 450 + 1600 + 100);
    return () => clearTimeout(id);
  }, [reduced]);

  // Playback rate: hover on the start button or a red-flag burst.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const apply = () => {
      const boosted = performance.now() < boostUntilRef.current;
      const rate = boosted ? BOOST_RATE : hoverRef.current ? HOVER_RATE : 1;
      for (const a of root.getAnimations({ subtree: true })) a.updatePlaybackRate(rate);
    };
    let boostTimer: ReturnType<typeof setTimeout> | undefined;
    const onEvent = (e: Event) => {
      const d = (e as CustomEvent<EcgEventDetail>).detail;
      if (d.kind === "hover") hoverRef.current = d.on;
      if (d.kind === "boost") {
        boostUntilRef.current = performance.now() + d.ms;
        clearTimeout(boostTimer);
        boostTimer = setTimeout(apply, d.ms + 20);
      }
      apply();
    };
    window.addEventListener(ECG_EVENT, onEvent);
    return () => {
      window.removeEventListener(ECG_EVENT, onEvent);
      clearTimeout(boostTimer);
    };
  }, [phase]);

  // The pulse wobbles by 1-2 beats every few seconds while the monitor is live and visible.
  useEffect(() => {
    if (!active || phase !== "live") return;
    const id = setInterval(() => {
      const delta = Math.round((Math.random() * 2 - 1) * DEMO_VITALS.pulseWobble);
      setPulse(DEMO_VITALS.pulse + delta);
    }, 2800);
    return () => clearInterval(id);
  }, [active, phase]);

  const live = phase === "live";
  const vitals = [
    { key: "temp", label: M.temp, value: formatNumber(DEMO_VITALS.tempC, 1), unit: M.unitTemp },
    { key: "pulse", label: M.pulse, value: formatNumber(pulse), unit: M.unitPerMin },
    { key: "resp", label: M.resp, value: formatNumber(DEMO_VITALS.respRate), unit: M.unitPerMin },
    {
      key: "spo2",
      label: M.spo2,
      value: DEMO_VITALS.spo2 === null ? M.noValue : formatNumber(DEMO_VITALS.spo2),
      unit: DEMO_VITALS.spo2 === null ? "" : "%",
    },
  ];

  return (
    <div ref={rootRef} data-paused={!active} className={live ? "ecg-live" : undefined}>
      <style>{KEYFRAMES}</style>
      {/* Fixed height from the first paint: nothing below shifts. */}
      <div className="relative h-24 w-full sm:h-28" aria-hidden="true">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="ecg-trail" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="white" stopOpacity="0" />
              <stop offset="0.85" stopColor="white" stopOpacity="0.9" />
              <stop offset="1" stopColor="white" stopOpacity="1" />
            </linearGradient>
            <mask id="ecg-sweep" maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
              <g className="ecg-band">
                <rect x={-260} y="0" width="260" height={H} fill="url(#ecg-trail)" />
              </g>
            </mask>
          </defs>
          {/* Dim full trace, always visible (the monitor's memory). */}
          <path
            d={PATH}
            fill="none"
            stroke="var(--color-monitor)"
            strokeOpacity={phase === "static" ? 0.9 : 0.18}
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {/* Bright trace: draws itself, then shows only the trail behind the sweep head. */}
          {phase !== "static" && (
            <path
              d={PATH}
              pathLength={1}
              fill="none"
              stroke="var(--color-monitor)"
              strokeWidth="2.25"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className={live ? undefined : "ecg-draw"}
              mask={live ? "url(#ecg-sweep)" : undefined}
            />
          )}
        </svg>
        {live && (
          <span className="ecg-head-x pointer-events-none absolute inset-0 block">
            <span className="ecg-head-y absolute left-0 top-0 block h-full w-0">
              <span className="absolute -left-1.5 -top-1.5 block h-3 w-3">
                <span className="ecg-halo absolute inset-0 rounded-full bg-monitor/50" />
                <span className="absolute inset-0.5 rounded-full bg-monitor shadow-[0_0_12px_var(--color-monitor)]" />
              </span>
            </span>
          </span>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {vitals.map((v) => (
          <div key={v.key} className="min-w-0 border-l border-white/15 pl-3">
            <dt className="text-xs text-ink-inverse-muted">{v.label}</dt>
            <dd className="mt-0.5 flex items-baseline gap-1 text-monitor">
              <span className="tabular inline-block min-w-[3ch] text-2xl font-semibold leading-none">{v.value}</span>
              {v.unit && <span className="text-xs text-ink-inverse-muted">{v.unit}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-ink-inverse-muted">{M.label}</p>
    </div>
  );
}
