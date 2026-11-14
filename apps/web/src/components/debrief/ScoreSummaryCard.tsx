import vi from "../../../messages/vi.json";
import Tile, { TILE_MUTED } from "@/components/ui/Tile";
import type { Evaluation } from "@/hooks/useDebriefData";
import StatusIcon from "./StatusIcon";
import { STATUS_BAR, STATUS_ORDER, statusLabel, type CriterionStatus } from "./statusStyle";

/**
 * Hero tile. The total comes from the API (scored by code from the versioned rubric);
 * the UI only displays it. A missing total shows a dash, never a made-up 0.
 */
export default function ScoreSummaryCard({ evaluation }: { evaluation: Evaluation }) {
  const score = evaluation.total_score;
  const hasScore = typeof score === "number";
  const pct = hasScore ? Math.max(0, Math.min(100, score)) : 0;
  const criteria = evaluation.criteria ?? [];
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<string, number>;
  for (const c of criteria) counts[c.status] = (counts[c.status] ?? 0) + 1;
  const muted = TILE_MUTED.ink;
  const none = vi.debrief.scoreNoValue;

  return (
    <Tile as="section" tone="ink" aria-labelledby="score-title" className="flex flex-col gap-6">
      <div>
        <h2 id="score-title" className={`text-sm font-semibold ${muted}`}>
          {vi.debrief.score.title}
        </h2>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="tabular text-6xl font-extrabold leading-none tracking-tight sm:text-7xl">
            {hasScore ? score.toLocaleString("vi-VN", { maximumFractionDigits: 2 }) : none}
          </span>
          <span className={`tabular text-xl font-semibold ${muted}`}>{vi.debrief.score.outOf}</span>
        </p>
        <div
          className="mt-5 h-2.5 w-full overflow-hidden rounded-full bg-white/15"
          role="progressbar"
          aria-label={vi.debrief.score.title}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={hasScore ? pct : undefined}
        >
          <div className="h-full rounded-full bg-primary-soft" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {criteria.length > 0 && (
        <div>
          <h3 className={`text-sm font-semibold ${muted}`}>{vi.debrief.scoreCountsTitle}</h3>
          {/* One segment per criterion in rubric order; the counts below carry the labels. */}
          <div className="mt-3 flex h-2 gap-1" aria-hidden="true">
            {criteria.map((c) => (
              <span
                key={c.criterion_id}
                className={`flex-1 rounded-full ${
                  STATUS_BAR[c.status as CriterionStatus] ?? STATUS_BAR.insufficient_evidence
                }`}
              />
            ))}
          </div>
          <ul className="mt-4 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
            {STATUS_ORDER.map((s) => (
              <li
                key={s}
                className="flex items-center justify-between gap-2 rounded-card bg-white/10 px-3 py-2.5"
              >
                <span className="flex min-w-0 items-center gap-1.5 text-sm">
                  <StatusIcon status={s} className="h-4 w-4 shrink-0" />
                  <span className="min-w-0">{statusLabel(s)}</span>
                </span>
                <span className="tabular text-lg font-bold">{counts[s]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={`border-t border-white/15 pt-4 text-xs ${muted}`}>
        <p className="font-semibold">{vi.debrief.versionsTitle}</p>
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
          <dt>{vi.debrief.versionRubric}</dt>
          <dd className="tabular break-words text-white">{evaluation.rubric_version ?? none}</dd>
          <dt>{vi.debrief.versionScoring}</dt>
          <dd className="tabular break-words text-white">{evaluation.scoring_version ?? none}</dd>
          <dt>{vi.debrief.versionModel}</dt>
          <dd className="break-words text-white">{evaluation.model ?? none}</dd>
        </dl>
      </div>
    </Tile>
  );
}
