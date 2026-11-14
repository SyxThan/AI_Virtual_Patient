import vi from "../../../messages/vi.json";
import type { ProgressRubricGroup } from "@/hooks/useSessionHistory";
import { fmt } from "@/lib/sessionAuth";

/** met / attempts per rubric criterion, one table per rubric version. */
export default function CriteriaTable({ groups }: { groups: ProgressRubricGroup[] }) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold tracking-tight text-ink">{vi.history.progress.criteriaTitle}</h3>
      {groups.map((g) => (
        <div key={g.rubric_version} className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="pb-2 text-left text-sm text-ink-muted">
              {fmt(vi.history.progress.rubricVersion, { v: g.rubric_version })}
            </caption>
            <thead className="border-b border-line text-sm text-ink-muted">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">{vi.history.progress.colCriterion}</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">{vi.history.progress.colMet}</th>
                <th scope="col" className="py-2 text-right font-medium">{vi.history.progress.colPartial}</th>
              </tr>
            </thead>
            <tbody>
              {g.criteria.map((c) => {
                const pct = c.attempts ? (c.met / c.attempts) * 100 : 0;
                return (
                  <tr key={c.criterion_id} className="border-b border-line/60 align-top last:border-b-0">
                    <th scope="row" className="py-2.5 pr-3 font-normal text-ink">{c.criterion}</th>
                    <td className="tabular py-2.5 pr-3 text-right text-ink">
                      <span className="inline-flex items-center gap-2">
                        <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-canvas sm:inline-block" aria-hidden>
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </span>
                        {c.met}/{c.attempts}
                      </span>
                    </td>
                    <td className="tabular py-2.5 text-right text-ink-muted">{c.partial}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
