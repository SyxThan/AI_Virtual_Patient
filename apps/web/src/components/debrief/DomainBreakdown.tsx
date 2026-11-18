import vi from "../../../messages/vi.json";
import Tile from "@/components/ui/Tile";
import type { Evaluation } from "@/hooks/useDebriefData";
import { fmt } from "@/lib/sessionAuth";
import StatusIcon from "./StatusIcon";
import { domainSummary } from "./debriefHelpers";
import { STATUS_BAR, STATUS_ORDER, statusLabel, type CriterionStatus } from "./statusStyle";

const DOMAIN_LABEL = vi.debrief.domains as Record<string, string>;

/**
 * Overview per rubric domain: "x/y đạt" in text (the readable value) plus one bar
 * segment per criterion colored by result (decorative; the legend names the colors).
 */
export default function DomainBreakdown({ evaluation }: { evaluation: Evaluation }) {
  const rows = domainSummary(evaluation.criteria ?? []);
  return (
    <Tile className="flex h-full flex-col">
      <h3 className="font-display text-xl font-bold tracking-tight">{vi.debrief.domainTitle}</h3>
      <ul className="mt-5 space-y-4">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold text-ink">{DOMAIN_LABEL[r.key] ?? r.key}</span>
              <span className="tabular font-semibold text-ink-muted">
                {fmt(vi.debrief.domainCount, { met: r.met, total: r.total })}
              </span>
            </div>
            <div className="mt-2 flex h-2.5 gap-1" aria-hidden="true">
              {r.items.map((c) => (
                <span
                  key={c.criterion_id}
                  className={`flex-1 rounded-full ${STATUS_BAR[c.status as CriterionStatus] ?? STATUS_BAR.insufficient_evidence}`}
                />
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-6">
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-muted" aria-hidden="true">
          {STATUS_ORDER.map((s) => (
            <li key={s} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${STATUS_BAR[s]}`} />
              <StatusIcon status={s} className="h-3.5 w-3.5" />
              {statusLabel(s)}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink-muted">{vi.debrief.domainLegend}</p>
      </div>
    </Tile>
  );
}
