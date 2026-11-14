import vi from "../../../messages/vi.json";
import type { Progress } from "@/hooks/useSessionHistory";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Tile, { TILE_MUTED } from "@/components/ui/Tile";
import { fmt } from "@/lib/sessionAuth";
import CriteriaTable from "./CriteriaTable";
import ProgressChart from "./ProgressChart";
import { formatScore } from "./format";

const MIN_ATTEMPTS = 2;

/**
 * Bento header row for /history: score per attempt + a summary tile, then the
 * per-criterion met rate. Built only from stored evaluations (the API returns
 * done evaluations only). The chart needs at least two scored attempts; below
 * that a short note says when it will appear. Attempts are oldest to newest.
 */
export default function ProgressSection({ progress }: { progress: Progress | null }) {
  if (!progress) return null;
  const scored = progress.attempts.filter((a) => a.total_score != null);
  const latest = scored.length ? scored[scored.length - 1] : undefined;
  const showChart = scored.length >= MIN_ATTEMPTS;

  return (
    <section aria-labelledby="progress-title" className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-4">
        <Tile tone="surface" className="min-w-0 border border-line lg:col-span-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 id="progress-title" className="text-xl font-bold tracking-tight">
              {vi.history.progress.title}
            </h2>
            <Badge tone="warning">{vi.history.progress.label}</Badge>
          </div>
          {progress.notice && <p className="mt-2 text-sm text-ink-muted">{progress.notice}</p>}
          <div className="mt-5">
            {showChart ? (
              <ProgressChart attempts={progress.attempts} />
            ) : (
              <p className="rounded-card bg-canvas px-4 py-6 text-sm text-ink-muted">
                {vi.history.progressPending}
              </p>
            )}
          </div>
        </Tile>
        <Tile tone="mint" compact className="flex flex-col gap-6">
          <div>
            <p className={`text-sm font-medium ${TILE_MUTED.mint}`}>{vi.history.scoredCount}</p>
            <p className="tabular mt-1 text-4xl font-extrabold tracking-tight">{scored.length}</p>
          </div>
          <div>
            <p className={`text-sm font-medium ${TILE_MUTED.mint}`}>{vi.history.latestScore}</p>
            <p className="tabular mt-1 text-4xl font-extrabold tracking-tight">
              {latest ? fmt(vi.history.score, { score: formatScore(latest.total_score as number) }) : "—"}
            </p>
          </div>
        </Tile>
      </div>
      {showChart && progress.rubric_groups.length > 0 && (
        <Card>
          <CriteriaTable groups={progress.rubric_groups} />
        </Card>
      )}
    </section>
  );
}
