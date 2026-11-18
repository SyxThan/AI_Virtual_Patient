import vi from "../../../messages/vi.json";
import Tile, { TILE_MUTED } from "@/components/ui/Tile";
import type { Evaluation } from "@/hooks/useDebriefData";
import StatusIcon from "./StatusIcon";
import { STATUS_ORDER, statusLabel } from "./statusStyle";

const R = 54;
const CIRC = 2 * Math.PI * R;

/**
 * Score stage. The total comes from the API (scored by code from the versioned rubric);
 * the UI only displays it, as a number inside a ring gauge, plus the count per result.
 * A missing total shows a dash and an empty ring, never a made-up 0.
 */
export default function ScoreSummaryCard({ evaluation }: { evaluation: Evaluation }) {
  const score = evaluation.total_score;
  const hasScore = typeof score === "number";
  const pct = hasScore ? Math.max(0, Math.min(100, score)) : 0;
  const criteria = evaluation.criteria ?? [];
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<string, number>;
  for (const c of criteria) counts[c.status] = (counts[c.status] ?? 0) + 1;
  const muted = TILE_MUTED.ink;

  return (
    <Tile tone="ink" className="flex h-full flex-col gap-6">
      <h3 id="score-title" className={`text-sm font-semibold ${muted}`}>
        {vi.debrief.score.title}
      </h3>
      <div
        className="relative mx-auto h-40 w-40 shrink-0"
        role="progressbar"
        aria-labelledby="score-title"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={hasScore ? pct : undefined}
      >
        <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="64" cy="64" r={R} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="10" />
          <circle
            cx="64"
            cy="64"
            r={R}
            fill="none"
            stroke="var(--color-glow)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - pct / 100)}
          />
        </svg>
        <p className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display tabular text-5xl font-bold leading-none tracking-tight">
            {hasScore ? score.toLocaleString("vi-VN", { maximumFractionDigits: 2 }) : vi.debrief.scoreNoValue}
          </span>
          <span className={`tabular mt-1 text-xs font-semibold ${muted}`}>{vi.debrief.score.outOf}</span>
        </p>
      </div>

      {criteria.length > 0 && (
        <ul className="mt-auto grid grid-cols-2 gap-2" aria-label={vi.debrief.scoreCountsTitle}>
          {STATUS_ORDER.map((s) => (
            <li key={s} className="flex items-center justify-between gap-2 rounded-card bg-white/10 px-3 py-2.5">
              <span className="flex min-w-0 items-center gap-1.5 text-sm leading-tight">
                <StatusIcon status={s} className="h-4 w-4 shrink-0" />
                <span className="min-w-0">{statusLabel(s)}</span>
              </span>
              <span className="font-display tabular text-xl font-bold">{counts[s]}</span>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}
