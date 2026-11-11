import vi from "../../../messages/vi.json";
import type { Progress } from "@/hooks/useSessionHistory";
import CriteriaTable from "./CriteriaTable";
import ProgressChart from "./ProgressChart";

const MIN_ATTEMPTS = 2;

/**
 * Score per attempt + per-criterion met rate, built only from stored evaluations
 * (the API returns done evaluations only). Hidden below two scored attempts.
 */
export default function ProgressSection({ progress }: { progress: Progress | null }) {
  const scored = progress?.attempts.filter((a) => a.total_score != null) ?? [];
  if (!progress || scored.length < MIN_ATTEMPTS) return null;
  return (
    <section aria-labelledby="progress-title" className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <header className="space-y-1">
        <h2 id="progress-title" className="text-lg font-semibold text-gray-900">
          {vi.history.progress.title}
        </h2>
        <p className="text-xs font-medium uppercase tracking-wide text-amber-800">{vi.history.progress.label}</p>
        <p className="text-xs text-gray-600">{progress.notice}</p>
      </header>
      <ProgressChart attempts={progress.attempts} />
      {progress.rubric_groups.length > 0 && <CriteriaTable groups={progress.rubric_groups} />}
    </section>
  );
}
