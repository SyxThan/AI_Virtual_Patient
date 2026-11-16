import type { ReactNode } from "react";

/**
 * Drawn glyphs for the landing feature tiles: each shows the feature's own
 * material (a waveform, the child's hand, a checklist with a quote, a cited
 * page, a score line) instead of a generic icon. Always decorative (aria-hidden),
 * stroke in currentColor so every tile tone keeps its contrast.
 */
function Glyph({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 96 64"
      className={`h-16 w-24 shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const WAVE = [10, 22, 38, 54, 30, 16, 44, 58, 26, 12, 34, 48, 20];

export function WaveGlyph() {
  return (
    <Glyph>
      {WAVE.map((h, i) => (
        <line key={i} x1={8 + i * 6.6} x2={8 + i * 6.6} y1={32 - h / 2} y2={32 + h / 2} strokeWidth="3" />
      ))}
    </Glyph>
  );
}

export function HandGlyph() {
  return (
    <Glyph>
      <path d="M30 40V18a4 4 0 0 1 8 0v16M38 32V12a4 4 0 0 1 8 0v20M46 30V14a4 4 0 0 1 8 0v18M54 32V20a4 4 0 0 1 8 0v18c0 12-8 20-18 20h-3c-6 0-10-3-13-8l-8-11a4 4 0 0 1 6-5l6 7" />
      <circle cx="42" cy="44" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="51" cy="48" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="47" cy="38" r="2.2" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

export function ChecklistGlyph() {
  return (
    <Glyph>
      <path d="M14 16l4 4 7-8M14 32l4 4 7-8M14 48l4 4 7-8" />
      <path d="M34 16h26M34 32h40M34 48h30" />
      <path d="M72 10c0 4-2 6-5 7M80 10c0 4-2 6-5 7" strokeWidth="2.4" />
    </Glyph>
  );
}

export function CitedPageGlyph() {
  return (
    <Glyph>
      <path d="M22 6h34l14 14v38H22z" />
      <path d="M56 6v14h14" />
      <path d="M30 30h32M30 38h32M30 46h18" />
      <rect x="28" y="35" width="36" height="6" rx="3" fill="currentColor" fillOpacity="0.18" stroke="none" />
      <path d="M50 46c8 0 12 6 14 12" strokeDasharray="3 3" />
    </Glyph>
  );
}

export function ProgressGlyph() {
  return (
    <Glyph>
      <path d="M10 54h76" strokeOpacity="0.4" />
      <path d="M14 46l16-10 14 6 16-18 14 4 12-14" strokeWidth="2.6" />
      <circle cx="30" cy="36" r="3" fill="currentColor" stroke="none" />
      <circle cx="60" cy="24" r="3" fill="currentColor" stroke="none" />
      <circle cx="86" cy="14" r="3.5" fill="currentColor" stroke="none" />
    </Glyph>
  );
}
