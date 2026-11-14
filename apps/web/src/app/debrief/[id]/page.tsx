"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useState } from "react";
import vi from "../../../../messages/vi.json";
import CitedClaimsSection from "@/components/debrief/CitedClaimsSection";
import ExportPdfButton from "@/components/debrief/ExportPdfButton";
import PedagogicalDebriefPanel from "@/components/debrief/PedagogicalDebriefPanel";
import PracticeNoticeBanner from "@/components/debrief/PracticeNoticeBanner";
import RedFlagAlertBanner from "@/components/debrief/RedFlagAlertBanner";
import RubricEvidenceList from "@/components/debrief/RubricEvidenceList";
import ScoreSummaryCard from "@/components/debrief/ScoreSummaryCard";
import TranscriptDrawer from "@/components/debrief/TranscriptDrawer";
import Button, { buttonClass } from "@/components/ui/Button";
import PageShell from "@/components/ui/PageShell";
import Tile from "@/components/ui/Tile";
import { FOCUS_RING } from "@/components/ui/focus";
import { useAuth } from "@/components/auth/AuthProvider";
import DeleteSessionButton from "@/components/privacy/DeleteSessionButton";
import { useDebriefData } from "@/hooks/useDebriefData";

// Danger outline: delete is destructive but must not compete with the one primary action.
const DELETE_CLASS = `inline-flex h-11 items-center justify-center rounded-control border border-danger px-5 text-sm font-semibold text-danger hover:bg-danger-soft sm:ml-auto ${FOCUS_RING}`;

/** Bento-shaped placeholder while the evaluation or the debrief is being produced. */
function Skeleton({ message, compact = false }: { message: string; compact?: boolean }) {
  return (
    <div className="space-y-4" aria-busy="true">
      <p className="flex items-center gap-3 text-sm font-medium text-ink-muted" role="status">
        <span
          className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-primary-soft border-t-primary motion-reduce:animate-none"
          aria-hidden
        />
        {message}
      </p>
      {compact ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="h-48 animate-pulse rounded-tile bg-surface motion-reduce:animate-none lg:col-span-7" />
          <div className="h-48 animate-pulse rounded-tile bg-surface motion-reduce:animate-none lg:col-span-5" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="h-72 animate-pulse rounded-tile bg-ink/10 motion-reduce:animate-none lg:col-span-4" />
          <div className="space-y-3 lg:col-span-8">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-card bg-surface motion-reduce:animate-none" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NoticeIcon({ tone }: { tone: "error" | "info" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-6 w-6 shrink-0 ${tone === "error" ? "text-warning" : "text-info"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {tone === "error" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5v5.5M12 16.5v.01" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      )}
    </svg>
  );
}

// Errors use the warning tone: red is reserved for red flags and destructive actions.
function Notice({ tone, children }: { tone: "error" | "info"; children: React.ReactNode }) {
  const cls = tone === "error" ? "border-warning/30 bg-warning-soft" : "border-line bg-surface";
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-4 rounded-tile border p-5 text-sm leading-relaxed text-ink sm:p-6 ${cls}`}
    >
      <NoticeIcon tone={tone} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export default function DebriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const auth = useAuth();
  const { evaluation, debrief, turns, timedOut, retry, refresh } = useDebriefData(id);
  const [focusTurn, setFocusTurn] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState(false);
  const closeDrawer = useCallback(() => setFocusTurn(null), []);

  const ev = evaluation.data;
  const db = debrief.data;
  const evDone = evaluation.state === "ready" && ev?.status === "done";
  const evFailed = evaluation.state === "ready" && ev?.status === "failed";
  const dbDone = debrief.state === "ready" && db?.status === "done";
  const signedIn = auth.status === "signedIn";

  async function onRetry() {
    setRetrying(true);
    setRetryError(false);
    const ok = await retry();
    setRetrying(false);
    if (!ok) setRetryError(true);
  }

  let body: React.ReactNode;
  if (timedOut) {
    body = (
      <Notice tone="info">
        <p>{vi.debrief.timeout}</p>
        <Button variant="secondary" onClick={refresh} className="mt-4">
          {vi.debrief.reload}
        </Button>
      </Notice>
    );
  } else if (evaluation.state === "loading" || evaluation.state === "pending") {
    body = <Skeleton message={vi.debrief.pending} />;
  } else if (evaluation.state === "notFound") {
    body = <Notice tone="error">{vi.debrief.notFound}</Notice>;
  } else if (evaluation.state === "notFinished") {
    body = (
      <Notice tone="info">
        <p>{vi.debrief.notFinished}</p>
        <Link href={`/session/${id}`} className={buttonClass({ variant: "secondary", className: "mt-4" })}>
          {vi.debrief.backToSession}
        </Link>
      </Notice>
    );
  } else if (evaluation.state === "error" || !ev) {
    body = (
      <Notice tone="error">
        <p>{vi.debrief.loadError}</p>
        <Button variant="secondary" onClick={refresh} className="mt-4">
          {vi.debrief.reload}
        </Button>
      </Notice>
    );
  } else if (evFailed) {
    // Failure behaviour: no partial score, a retry button (evaluation.md).
    body = (
      <Notice tone="error">
        <p className="text-base font-bold">{vi.debrief.failedTitle}</p>
        {ev.error && <p className="mt-1 text-ink-muted">{ev.error}</p>}
        <Button variant="secondary" onClick={onRetry} disabled={retrying} className="mt-4">
          {retrying ? vi.debrief.retrying : vi.debrief.retry}
        </Button>
        {retryError && <p className="mt-2 text-xs font-medium text-warning">{vi.debrief.retryError}</p>}
      </Notice>
    );
  } else if (evDone) {
    body = (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {ev.critical_missed && (
          <div className="lg:col-span-12">
            <RedFlagAlertBanner />
          </div>
        )}
        <div className="lg:sticky lg:top-24 lg:col-span-4 lg:self-start">
          <ScoreSummaryCard evaluation={ev} />
        </div>
        <div className="min-w-0 lg:col-span-8">
          <RubricEvidenceList evaluation={ev} onOpenTurn={setFocusTurn} />
        </div>
        {debrief.state === "pending" || debrief.state === "loading" ? (
          <div className="lg:col-span-12">
            <Skeleton message={vi.debrief.debriefPending} compact />
          </div>
        ) : dbDone && db.summary ? (
          <>
            <div className="min-w-0 lg:col-span-7">
              <PedagogicalDebriefPanel summary={db.summary} />
            </div>
            <div className="min-w-0 lg:col-span-5">
              <CitedClaimsSection items={db.items ?? []} />
            </div>
          </>
        ) : (
          <div className="lg:col-span-12">
            <Notice tone="info">{db?.error ?? vi.debrief.debriefFailed}</Notice>
          </div>
        )}
      </div>
    );
  }

  return (
    <PageShell
      width="wide"
      title={vi.debrief.title}
      actions={<ExportPdfButton sessionId={id} disabled={!(evDone && dbDone)} />}
    >
      <div className="space-y-4">
        <PracticeNoticeBanner sourcesReviewed={dbDone ? (db?.sources_reviewed ?? false) : null} />
        {body}
        <Tile as="footer" tone="surface" compact className="border border-line">
          <h2 className="text-base font-bold">{vi.debriefUx.actionsTitle}</h2>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link href="/setup" className={buttonClass({ variant: "secondary" })}>
              {vi.debrief.actions.newCase}
            </Link>
            {/* A finished session redirects away from /session/{id}, so review the transcript here. */}
            <Button
              variant="secondary"
              onClick={() => setFocusTurn(turns[0]?.turn_idx ?? 0)}
              disabled={turns.length === 0}
            >
              {vi.debriefUx.reviewTranscript}
            </Button>
            <Link href={signedIn ? "/history" : "/"} className={buttonClass({ variant: "ghost" })}>
              {signedIn ? vi.debriefUx.backToHistory : vi.debriefUx.backToHome}
            </Link>
            {/* Owner-only delete (Slice 13): afterwards every route of this session is 404. */}
            <DeleteSessionButton
              sessionId={id}
              onDeleted={() => router.replace(signedIn ? "/history" : "/")}
              className={DELETE_CLASS}
            />
          </div>
        </Tile>
      </div>
      {focusTurn !== null && <TranscriptDrawer turns={turns} focusIdx={focusTurn} onClose={closeDrawer} />}
    </PageShell>
  );
}
