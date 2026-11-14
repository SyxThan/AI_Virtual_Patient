/**
 * Decorative patient-monitor strip for the hero: a faint grid and one ECG-like
 * trace. Purely visual (aria-hidden), carries no values or numbers.
 */
const BEAT = "h22 l6 -6 l6 6 h10 l4 8 l8 -52 l8 62 l5 -18 h10 l9 -9 l9 9 h23";

export default function MonitorTrace() {
  const trace = `M0 70 ${BEAT} ${BEAT} ${BEAT} ${BEAT} ${BEAT}`;
  return (
    <div className="pointer-events-none relative h-28 w-full sm:h-36" aria-hidden="true">
      <svg
        viewBox="0 0 600 120"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full text-ink-inverse-muted"
      >
        <defs>
          <pattern id="monitor-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0H0V20" fill="none" stroke="currentColor" strokeOpacity="0.14" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="600" height="120" fill="url(#monitor-grid)" />
        <path
          d={trace}
          fill="none"
          className="text-primary-soft"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="absolute right-0 top-[58%] h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-primary-soft motion-safe:animate-pulse" />
    </div>
  );
}
