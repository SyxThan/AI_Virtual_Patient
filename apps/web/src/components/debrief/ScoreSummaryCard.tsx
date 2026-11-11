import vi from "../../../messages/vi.json";
import type { Evaluation } from "@/hooks/useDebriefData";
import { fmt } from "@/lib/sessionAuth";
import { STATUS_BADGE, STATUS_ORDER, statusLabel } from "./statusStyle";

export default function ScoreSummaryCard({ evaluation }: { evaluation: Evaluation }) {
  const score = evaluation.total_score ?? 0;
  const pct = Math.max(0, Math.min(100, score));
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<string, number>;
  for (const c of evaluation.criteria ?? []) counts[c.status] = (counts[c.status] ?? 0) + 1;
  const barColor = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-400" : "bg-red-500";

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-medium text-gray-600">{vi.debrief.score.title}</h2>
      <p className="mt-1 text-4xl font-bold text-gray-900">
        {score.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}
        <span className="ml-1 text-lg font-medium text-gray-600">{vi.debrief.score.outOf}</span>
      </p>
      <div
        className="mt-3 h-3 w-full overflow-hidden rounded-full bg-gray-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-4 flex flex-wrap gap-2">
        {STATUS_ORDER.map((s) => (
          <li key={s} className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE[s]}`}>
            {statusLabel(s)}: {counts[s]}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-gray-600">
        {fmt(vi.debrief.score.versions, {
          rubric: evaluation.rubric_version ?? "?",
          scoring: evaluation.scoring_version ?? "?",
          model: evaluation.model ?? "?",
        })}
      </p>
    </section>
  );
}
