import vi from "../../../messages/vi.json";

const S = vi.landing.stage;

/** Mother-and-child mark for the speaker avatar (decorative). */
function MotherChildMark() {
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="20" fill="var(--color-sand-soft)" />
      <circle cx="17" cy="13" r="5" fill="var(--color-sand-ink)" />
      <path d="M7.5 32c1-7 5-10.5 9.5-10.5s8.5 3.5 9.5 10.5" fill="var(--color-sand-ink)" />
      <circle cx="27.5" cy="22" r="3.4" fill="var(--color-primary)" />
      <path d="M22 32c.6-3.6 2.8-5.6 5.5-5.6S32.4 28.4 33 32" fill="var(--color-primary)" />
    </svg>
  );
}

/** Waveform bars; the whole bar strip is one breathing gesture (aria-hidden). */
const BARS = [0.35, 0.6, 1, 0.75, 0.45, 0.9, 0.55, 0.8, 0.4, 0.7, 1, 0.5, 0.3];

/**
 * The landing hero's one bold element: a real exchange from the HFMD case,
 * staged as it looks in the workspace (mother bubble, student bubble, hold-to-talk).
 * Lines are taken from the case's chief complaint; nothing is invented.
 * One orchestrated reveal on load; nothing animates under prefers-reduced-motion.
 */
export default function ConversationStage() {
  return (
    <figure className="relative flex h-full flex-col overflow-hidden rounded-card bg-white/[0.07] p-4 ring-1 ring-white/15 backdrop-blur-sm sm:p-5">
      <figcaption className="flex items-center gap-3">
        <MotherChildMark />
        <span className="min-w-0">
          <span className="block text-sm font-bold text-white">{S.speakerMother}</span>
          <span className="flex items-center gap-1.5 text-xs text-ink-inverse-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-glow motion-safe:animate-breathe" aria-hidden="true" />
            {S.status}
          </span>
        </span>
        <span className="ml-auto rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-ink-inverse-muted">
          {S.label}
        </span>
      </figcaption>

      <ol className="my-5 flex flex-1 flex-col justify-center gap-3">
        <li
          className="max-w-[88%] self-start rounded-card rounded-bl-control bg-sand-soft px-4 py-3 text-sm leading-relaxed text-ink motion-safe:animate-rise"
          style={{ animationDelay: "250ms" }}
        >
          <span className="sr-only">{S.speakerMother}: </span>
          {S.mother1}
        </li>
        <li
          className="max-w-[88%] self-end rounded-card rounded-br-control bg-primary px-4 py-3 text-sm leading-relaxed text-white motion-safe:animate-rise"
          style={{ animationDelay: "1100ms" }}
        >
          <span className="sr-only">{S.speakerYou}: </span>
          {S.you1}
        </li>
        <li
          className="max-w-[88%] self-start rounded-card rounded-bl-control bg-sand-soft px-4 py-3 text-sm leading-relaxed text-ink motion-safe:animate-rise"
          style={{ animationDelay: "2000ms" }}
        >
          <span className="sr-only">{S.speakerMother}: </span>
          {S.mother2}
        </li>
      </ol>

      <div
        className="flex items-center gap-3 rounded-full bg-ink-deep/60 py-2 pl-2 pr-4 ring-1 ring-white/10 motion-safe:animate-rise"
        style={{ animationDelay: "2700ms" }}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white">
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
            <rect x="7" y="2.5" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.7" />
            <path d="M4.5 9.5a5.5 5.5 0 0011 0M10 15v2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </span>
        <span className="flex h-7 flex-1 items-center justify-center gap-1" aria-hidden="true">
          {BARS.map((h, i) => (
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
