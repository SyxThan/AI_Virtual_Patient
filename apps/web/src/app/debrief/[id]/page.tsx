"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useMemo, useState } from "react";
import vi from "../../../../messages/vi.json";
import CitedClaimsSection from "@/components/debrief/CitedClaimsSection";
import DomainBreakdown from "@/components/debrief/DomainBreakdown";
import ExportPdfButton from "@/components/debrief/ExportPdfButton";
import PedagogicalDebriefPanel from "@/components/debrief/PedagogicalDebriefPanel";
import PracticeNoticeBanner from "@/components/debrief/PracticeNoticeBanner";
import RedFlagAlertBanner from "@/components/debrief/RedFlagAlertBanner";
import RubricEvidenceList from "@/components/debrief/RubricEvidenceList";
import ScoreSummaryCard from "@/components/debrief/ScoreSummaryCard";
import StepHeading from "@/components/debrief/StepHeading";
import TranscriptDrawer from "@/components/debrief/TranscriptDrawer";
import { isCriticalMiss, splitClaims } from "@/components/debrief/debriefHelpers";
import { fmt } from "@/lib/sessionAuth";
import { caseVoiceOf, speakerText } from "@/components/workspace/caseVoice";
import Button, { buttonClass } from "@/components/ui/Button";
import PageShell from "@/components/ui/PageShell";
import { caseLabel, patientLine, useSessionCase } from "@/lib/caseSummary";
import Tile from "@/components/ui/Tile";
import { useAuth } from "@/components/auth/AuthProvider";
import DeleteSessionButton from "@/components/privacy/DeleteSessionButton";
import { useDebriefData } from "@/hooks/useDebriefData";

// Danger outline: delete is destructive but must not compete with the one primary action.
// DeleteSessionButton appends this to its own trigger styles: outline + layout only.
const DELETE_CLASS = "border border-danger px-5 sm:ml-auto";

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
        <div className="h-56 animate-pulse rounded-tile bg-surface motion-reduce:animate-none" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="h-80 animate-pulse rounded-tile bg-ink/10 motion-reduce:animate-none lg:col-span-5 xl:col-span-4" />
            <div className="h-80 animate-pulse rounded-tile bg-surface motion-reduce:animate-none lg:col-span-7 xl:col-span-8" />
          </div>
          <div className="h-56 animate-pulse rounded-tile bg-surface motion-reduce:animate-none" />
        </>
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

/** Stored error codes are technical (API-safe); students see a Vietnamese sentence instead. */
const ERROR_TEXT = vi.debrief.errorCodes as Record<string, string>;
function errorText(code: string): string {
  return ERROR_TEXT[code] ?? ERROR_TEXT.unknown;
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
  // AVP-149: name the practised case the way the library does (complaint, not diagnosis).
  const sessionCase = useSessionCase(id);
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
  const criteria = useMemo(() => (evDone ? (ev?.criteria ?? []) : []), [evDone, ev]);
  // Claims about a criterion sit under it in the checklist; the rest form step 4.
  const claims = useMemo(
    () => splitClaims(dbDone ? (db?.items ?? []) : [], criteria.map((c) => c.criterion_id)),
    [dbDone, db, criteria],
  );

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
        {ev.error && <p className="mt-1 text-ink-muted">{errorText(ev.error)}</p>}
        <Button variant="secondary" onClick={onRetry} disabled={retrying} className="mt-4">
          {retrying ? vi.debrief.retrying : vi.debrief.retry}
        </Button>
        {retryError && <p className="mt-2 text-xs font-medium text-warning">{vi.debrief.retryError}</p>}
      </Notice>
    );
  } else if (evDone) {
    // Reading order (AVP-169): how did I do, what to learn, the detail, general notes.
    const hasGeneral = claims.general.length > 0;
    body = (
      <>
        <section aria-labelledby="sec-overview" className="space-y-4">
          <StepHeading n={1} id="sec-overview" title={vi.debrief.sections.overview} />
          {ev.critical_missed && <RedFlagAlertBanner missed={criteria.filter(isCriticalMiss)} />}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-5 xl:col-span-4">
              <ScoreSummaryCard evaluation={ev} />
            </div>
            {criteria.length > 0 && (
              <div className="min-w-0 lg:col-span-7 xl:col-span-8">
                <DomainBreakdown evaluation={ev} />
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="sec-feedback" className="space-y-4">
          <StepHeading n={2} id="sec-feedback" title={vi.debrief.sections.feedback} />
          {debrief.state === "pending" || debrief.state === "loading" ? (
            <Skeleton message={vi.debrief.debriefPending} compact />
          ) : dbDone && db.summary ? (
            <PedagogicalDebriefPanel summary={db.summary} />
          ) : (
            <Notice tone="info">{db?.error ? errorText(db.error) : vi.debrief.debriefFailed}</Notice>
          )}
        </section>

        <section aria-labelledby="sec-checklist" className="space-y-4">
          <StepHeading
            n={3}
            id="sec-checklist"
            title={vi.debrief.sections.checklist}
            aside={
              <p className="tabular text-sm text-ink-muted">{fmt(vi.debrief.rubricCount, { count: criteria.length })}</p>
            }
          />
          <RubricEvidenceList evaluation={ev} claimsByCriterion={claims.byCriterion} onOpenTurn={setFocusTurn} />
        </section>

        {hasGeneral && (
          <section aria-labelledby="sec-general" className="space-y-4">
            <StepHeading n={4} id="sec-general" title={vi.debrief.sections.general} />
            <CitedClaimsSection items={claims.general} />
          </section>
        )}
      </>
    );
  }
  const nextStep = evDone ? (claims.general.length > 0 ? 5 : 4) : undefined;

  return (
    <PageShell
      width="wide"
      title={vi.debrief.title}
      description={
        sessionCase ? `“${caseLabel(sessionCase)}” · ${patientLine(sessionCase)}` : undefined
      }
      actions={<ExportPdfButton sessionId={id} disabled={!(evDone && dbDone)} />}
    >
      <div className="space-y-10">
        <PracticeNoticeBanner sourcesReviewed={dbDone ? (db?.sources_reviewed ?? false) : null} />
        {body}
        <footer aria-labelledby="sec-next" className="space-y-4">
          <StepHeading n={nextStep} id="sec-next" title={vi.debrief.sections.next} />
          <Tile compact>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link href="/cases" className={buttonClass({ variant: "secondary" })}>
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
            {evDone && (
              // Grading provenance (evaluation.md): kept for traceability, out of the student's way.
              <div className="mt-5 border-t border-line pt-4 text-xs text-ink-muted">
                <p className="font-semibold">{vi.debrief.versionsTitle}</p>
                <dl className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1">
                  {(
                    [
                      [vi.debrief.versionRubric, ev?.rubric_version],
                      [vi.debrief.versionScoring, ev?.scoring_version],
                      [vi.debrief.versionModel, ev?.model],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex gap-2">
                      <dt>{label}</dt>
                      <dd className="tabular break-all font-semibold text-ink">{value ?? vi.debrief.scoreNoValue}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </Tile>
        </footer>
      </div>
      {focusTurn !== null && <TranscriptDrawer
          turns={turns}
          focusIdx={focusTurn}
          patientLabel={speakerText(vi.debrief.transcript.patient, caseVoiceOf(sessionCase))}
          onClose={closeDrawer}
        />}
    </PageShell>
  );
}
