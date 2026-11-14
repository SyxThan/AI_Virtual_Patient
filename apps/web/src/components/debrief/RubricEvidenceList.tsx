import vi from "../../../messages/vi.json";
import Badge from "@/components/ui/Badge";
import Tile from "@/components/ui/Tile";
import { FOCUS_RING } from "@/components/ui/focus";
import type { Evaluation } from "@/hooks/useDebriefData";
import { fmt } from "@/lib/sessionAuth";
import StatusIcon from "./StatusIcon";
import { statusLabel, statusTone } from "./statusStyle";

const MISSED = new Set(["unmet", "insufficient_evidence"]);

export default function RubricEvidenceList({
  evaluation,
  onOpenTurn,
}: {
  evaluation: Evaluation;
  onOpenTurn: (turnIdx: number) => void;
}) {
  const criteria = evaluation.criteria ?? [];
  return (
    <Tile as="section" tone="surface" aria-labelledby="rubric-title" className="border border-line">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="rubric-title" className="text-xl font-bold tracking-tight">
          {vi.debrief.rubric.title}
        </h2>
        <p className="tabular text-sm text-ink-muted">
          {fmt(vi.debrief.rubricCount, { count: criteria.length })}
        </p>
      </div>
      <ol className="mt-5 space-y-3">
        {criteria.map((c) => {
          const criticalMissed = c.critical && MISSED.has(c.status);
          return (
            <li
              key={c.criterion_id}
              className={`rounded-card border bg-surface p-4 sm:p-5 ${
                criticalMissed ? "border-danger" : "border-line"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(c.status)}>
                  <StatusIcon status={c.status} />
                  {statusLabel(c.status)}
                </Badge>
                {c.critical && (
                  <Badge tone={criticalMissed ? "danger" : "neutral"}>{vi.debrief.rubric.critical}</Badge>
                )}
                {c.flagged && (
                  <Badge tone="warning" title={vi.debrief.rubric.flaggedHint}>
                    <svg
                      viewBox="0 0 16 16"
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3.5 14V2.5M3.5 3h8l-1.8 3 1.8 3h-8" />
                    </svg>
                    {vi.debrief.rubric.flagged}
                  </Badge>
                )}
                {c.low_reliability && <Badge tone="neutral">{vi.debrief.rubric.lowReliability}</Badge>}
                <span className="tabular ml-auto text-xs text-ink-muted">
                  {fmt(vi.debrief.rubric.weight, { weight: c.weight })}
                </span>
              </div>
              <p className="mt-3 font-semibold leading-snug text-ink">{c.criterion}</p>
              {c.feedback && <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{c.feedback}</p>}
              {c.flagged && <p className="mt-1.5 text-xs text-warning">{vi.debrief.rubric.flaggedHint}</p>}

              <div className="mt-4">
                <p className="text-xs font-semibold text-ink-muted">{vi.debrief.rubric.evidence}</p>
                {c.evidence.length === 0 ? (
                  <p className="mt-1.5 text-sm italic text-ink-muted">{vi.debrief.rubric.noEvidence}</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-2">
                    {c.evidence.map((e) => (
                      <li key={`${e.turn_idx}-${e.quote}`}>
                        <button
                          type="button"
                          onClick={() => onOpenTurn(e.turn_idx)}
                          className={`group flex min-h-11 w-full flex-col gap-1.5 rounded-control border-l-4 border-primary bg-primary-soft/60 px-3 py-2.5 text-left text-sm text-ink hover:bg-primary-soft ${FOCUS_RING}`}
                          title={vi.debrief.rubric.openTranscript}
                        >
                          <span className="leading-relaxed">“{e.quote}”</span>
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-primary-strong">
                            <span className="tabular">{fmt(vi.debrief.rubric.turn, { idx: e.turn_idx })}</span>
                            <span className="inline-flex items-center gap-1 underline-offset-2 group-hover:underline">
                              <svg
                                viewBox="0 0 16 16"
                                className="h-3.5 w-3.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M3 3.5h10v7H7l-3 2.5v-2.5H3z" />
                              </svg>
                              {vi.debrief.rubric.openTranscript}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Tile>
  );
}
