import vi from "../../../messages/vi.json";
import type { Evaluation } from "@/hooks/useDebriefData";
import { fmt } from "@/lib/sessionAuth";
import { STATUS_BADGE, statusLabel, type CriterionStatus } from "./statusStyle";

export default function RubricEvidenceList({
  evaluation,
  onOpenTurn,
}: {
  evaluation: Evaluation;
  onOpenTurn: (turnIdx: number) => void;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">{vi.debrief.rubric.title}</h2>
      <ol className="mt-3 divide-y divide-gray-100">
        {(evaluation.criteria ?? []).map((c) => (
          <li key={c.criterion_id} className="py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  STATUS_BADGE[c.status as CriterionStatus] ?? STATUS_BADGE.insufficient_evidence
                }`}
              >
                {statusLabel(c.status)}
              </span>
              {c.critical && (
                <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                  {vi.debrief.rubric.critical}
                </span>
              )}
              {c.flagged && (
                <span
                  className="rounded-full border border-orange-300 bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-800"
                  title={vi.debrief.rubric.flaggedHint}
                >
                  ⚑ {vi.debrief.rubric.flagged}
                </span>
              )}
              {c.low_reliability && (
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
                  {vi.debrief.rubric.lowReliability}
                </span>
              )}
              <span className="ml-auto text-xs text-gray-400">
                {fmt(vi.debrief.rubric.weight, { weight: c.weight })}
              </span>
            </div>
            <p className="mt-2 font-medium text-gray-900">{c.criterion}</p>
            {c.feedback && <p className="mt-1 text-sm text-gray-600">{c.feedback}</p>}
            {c.flagged && <p className="mt-1 text-xs text-orange-700">{vi.debrief.rubric.flaggedHint}</p>}

            <div className="mt-2">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                {vi.debrief.rubric.evidence}
              </p>
              {c.evidence.length === 0 ? (
                <p className="mt-1 text-sm italic text-gray-400">{vi.debrief.rubric.noEvidence}</p>
              ) : (
                <ul className="mt-1 flex flex-col gap-1.5">
                  {c.evidence.map((e) => (
                    <li key={`${e.turn_idx}-${e.quote}`}>
                      <button
                        type="button"
                        onClick={() => onOpenTurn(e.turn_idx)}
                        className="w-full rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-left text-sm text-blue-900 hover:border-blue-300 hover:bg-blue-100"
                        title={vi.debrief.rubric.openTranscript}
                      >
                        <span className="mr-2 font-mono text-xs text-blue-600">
                          {fmt(vi.debrief.rubric.turn, { idx: e.turn_idx })}
                        </span>
                        “{e.quote}”
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
