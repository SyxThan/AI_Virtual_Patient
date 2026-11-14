import Link from "next/link";
import vi from "../../../messages/vi.json";
import DeleteSessionButton from "@/components/privacy/DeleteSessionButton";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import type { SessionSummary } from "@/hooks/useSessionHistory";
import { fmt } from "@/lib/sessionAuth";
import { evaluationLabel, formatDate, formatScore, modeLabel, statusLabel } from "./format";

// A finished session (any post-interview status) has a debrief page.
const FINISHED = new Set(["completed", "evaluating", "evaluated", "failed"]);

// A failed evaluation is a pending problem, not a red flag: warning, never danger.
const EVAL_TONE: Record<string, BadgeTone> = {
  none: "neutral",
  pending: "info",
  done: "success",
  failed: "warning",
};

function FlagIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <path
        d="M8 2.5l6 11H2l6-11zM8 6.5v3.2M8 11.6v.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Props = { session: SessionSummary; onDeleted?: () => void };

export default function SessionCard({ session, onDeleted }: Props) {
  const scored = session.evaluation_status === "done" && session.total_score != null;
  return (
    <Card as="li" className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="font-bold text-ink">{session.case_title ?? session.case_id}</p>
          <p className="text-sm text-ink-muted">
            <time dateTime={session.started_at}>
              {fmt(vi.history.startedAt, { date: formatDate(session.started_at) })}
            </time>
          </p>
        </div>
        <p className="shrink-0 text-right">
          {scored ? (
            <span className="tabular text-2xl font-extrabold tracking-tight text-ink">
              {fmt(vi.history.score, { score: formatScore(session.total_score as number) })}
            </span>
          ) : (
            <span className="text-sm text-ink-muted">{vi.history.noScore}</span>
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge>{modeLabel(session.mode)}</Badge>
        <Badge>{statusLabel(session.status)}</Badge>
        <Badge tone={EVAL_TONE[session.evaluation_status] ?? "neutral"}>
          {evaluationLabel(session.evaluation_status)}
        </Badge>
        {scored && session.critical_missed && (
          <Badge tone="danger">
            <FlagIcon />
            {vi.history.redFlag}
          </Badge>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {session.status === "active" && (
          <Link href={`/session/${session.id}`} className={buttonClass({ variant: "secondary" })}>
            {vi.history.continue}
          </Link>
        )}
        {FINISHED.has(session.status) && (
          <Link href={`/debrief/${session.id}`} className={buttonClass({ variant: "secondary" })}>
            {vi.history.viewFeedback}
          </Link>
        )}
        {onDeleted && (
          <span className="ml-auto">
            <DeleteSessionButton sessionId={session.id} onDeleted={onDeleted} />
          </span>
        )}
      </div>
    </Card>
  );
}
