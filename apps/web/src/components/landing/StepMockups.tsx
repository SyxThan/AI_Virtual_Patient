import vi from "../../../messages/vi.json";

/*
 * Simple HTML/CSS mockups of the three real screens, built from the app's own
 * strings (no screenshots yet: TODO(nhóm) replace with real screenshots when
 * the team has them). Decorative: the step text carries the meaning. No scores
 * or other numbers are shown, so nothing here can read as a measured result.
 */

const S = vi.landing.stage;

function Window({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-card bg-surface shadow-lift ring-1 ring-line/70" aria-hidden="true">
      <div className="flex items-center gap-1.5 border-b border-line bg-canvas px-4 py-2.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        ))}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function SetupMockup() {
  return (
    <Window>
      <div className="rounded-card bg-sand-soft p-4 text-sand-ink">
        <p className="text-xs font-semibold">{vi.setup.case.label}</p>
        <p className="font-display mt-1 text-lg font-bold leading-tight text-ink">{vi.setup.case.title}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <span className="rounded-control border-2 border-primary bg-primary-soft px-3 py-2 font-semibold text-ink">{vi.setup.mode.guided}</span>
        <span className="rounded-control border-2 border-line px-3 py-2 font-semibold text-ink-muted">{vi.setup.mode.exam}</span>
      </div>
      <span className="mt-3 flex h-10 items-center justify-center rounded-control bg-primary text-sm font-semibold text-white">
        {vi.setup.start}
      </span>
    </Window>
  );
}

export function WorkspaceMockup() {
  return (
    <Window>
      <div className="grid grid-cols-5 gap-3">
        <div className="col-span-2 flex items-end justify-center rounded-card bg-info-soft p-3">
          {/* The mother holding the child, as a silhouette. */}
          <svg viewBox="0 0 80 90" className="h-24 w-full text-info" fill="currentColor">
            <circle cx="34" cy="20" r="11" opacity="0.8" />
            <path d="M12 90c2-26 10-42 22-42s20 16 22 42z" opacity="0.8" />
            <circle cx="56" cy="50" r="8" />
            <path d="M44 90c1-16 6-26 12-26s11 10 12 26z" />
          </svg>
        </div>
        <div className="col-span-3 flex flex-col gap-2 text-xs leading-snug">
          <span className="self-end rounded-card rounded-br-control bg-primary px-3 py-2 text-white">{S.student2}</span>
          <span className="self-start rounded-card rounded-bl-control bg-sand-soft px-3 py-2 text-ink">{S.mother2}</span>
          <span className="mt-auto flex h-8 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
            {S.mic}
          </span>
        </div>
      </div>
    </Window>
  );
}

export function DebriefMockup() {
  const rows = [
    { tone: "bg-success-soft text-success", label: vi.debrief.status.met, w: "w-3/4" },
    { tone: "bg-warning-soft text-warning", label: vi.debrief.status.partial, w: "w-2/3" },
    { tone: "bg-danger-soft text-danger", label: vi.debrief.status.unmet, w: "w-1/2" },
  ];
  return (
    <Window>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0 -rotate-90">
          <circle cx="32" cy="32" r="26" fill="none" stroke="var(--color-line)" strokeWidth="7" />
          <circle cx="32" cy="32" r="26" fill="none" stroke="var(--color-primary)" strokeWidth="7" strokeLinecap="round" strokeDasharray="163" strokeDashoffset="60" />
        </svg>
        <div>
          <p className="font-display text-lg font-bold text-ink">{vi.debrief.score.title}</p>
          <p className="text-xs text-ink-muted">{vi.debrief.rubric.title}</p>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-3 rounded-control border border-line px-3 py-2">
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${r.tone}`}>{r.label}</span>
            <span className={`h-2 rounded-full bg-line ${r.w}`} />
          </li>
        ))}
      </ul>
    </Window>
  );
}
