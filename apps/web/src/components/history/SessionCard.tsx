import Link from "next/link";
import vi from "../../../messages/vi.json";
import DeleteSessionButton from "@/components/privacy/DeleteSessionButton";
import type { SessionSummary } from "@/hooks/useSessionHistory";
import { fmt } from "@/lib/sessionAuth";
import { evaluationLabel, formatDate, formatScore, modeLabel, statusLabel } from "./format";

// A finished session (any post-interview status) has a debrief page.
const FINISHED = new Set(["completed", "evaluating", "evaluated", "failed"]);

const EVAL_BADGE: Record<string, string> = {
  none: "border-gray-300 bg-gray-50 text-gray-700",
  pending: "border-indigo-200 bg-indigo-50 text-indigo-800",
  done: "border-green-300 bg-green-50 text-green-800",
  failed: "border-red-200 bg-red-50 text-red-800",
};

type Props = { session: SessionSummary; onDeleted?: () => void };

export default function SessionCard({ session, onDeleted }: Props) {
  const scored = session.evaluation_status === "done" && session.total_score != null;
  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-gray-900">{session.case_title ?? session.case_id}</p>
          <p className="text-sm text-gray-600">
            <time dateTime={session.started_at}>
              {fmt(vi.history.startedAt, { date: formatDate(session.started_at) })}
            </time>
          </p>
          <div className="flex flex-wrap gap-2 pt-1 text-xs">
            <span className="rounded-full border border-gray-300 px-2 py-0.5 text-gray-700">
              {modeLabel(session.mode)}
            </span>
            <span className="rounded-full border border-gray-300 px-2 py-0.5 text-gray-700">
              {statusLabel(session.status)}
            </span>
            <span className={`rounded-full border px-2 py-0.5 ${EVAL_BADGE[session.evaluation_status] ?? EVAL_BADGE.none}`}>
              {evaluationLabel(session.evaluation_status)}
            </span>
            {scored && session.critical_missed && (
              <span className="rounded-full border border-red-500 bg-red-50 px-2 py-0.5 font-semibold text-red-800">
                <span aria-hidden>⚠ </span>
                {vi.history.redFlag}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <p className="text-right">
            {scored ? (
              <span className="text-xl font-semibold tabular-nums text-gray-900">
                {fmt(vi.history.score, { score: formatScore(session.total_score as number) })}
              </span>
            ) : (
              <span className="text-sm text-gray-500">{vi.history.noScore}</span>
            )}
          </p>
          {session.status === "active" && (
            <Link
              href={`/session/${session.id}`}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              {vi.history.continue}
            </Link>
          )}
          {FINISHED.has(session.status) && (
            <Link
              href={`/debrief/${session.id}`}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {vi.history.viewFeedback}
            </Link>
          )}
          {onDeleted && <DeleteSessionButton sessionId={session.id} onDeleted={onDeleted} />}
        </div>
      </div>
    </li>
  );
}
