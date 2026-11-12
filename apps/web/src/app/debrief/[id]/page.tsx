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
import { FOCUS_RING } from "@/components/ui/focus";
import { useAuth } from "@/components/auth/AuthProvider";
import DeleteSessionButton from "@/components/privacy/DeleteSessionButton";
import { useDebriefData } from "@/hooks/useDebriefData";

function Skeleton({ message }: { message: string }) {
  return (
    <div className="space-y-4" aria-busy="true">
      <p className="flex items-center gap-2 text-sm text-gray-600" role="status">
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-700 motion-reduce:animate-none"
          aria-hidden
        />
        {message}
      </p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-lg bg-gray-100" />
      ))}
    </div>
  );
}

function Notice({ tone, children }: { tone: "error" | "info"; children: React.ReactNode }) {
  const cls =
    tone === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-gray-200 bg-gray-50 text-gray-800";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-4 text-sm ${cls}`}>
      {children}
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
        <button
          type="button"
          onClick={refresh}
          className={`mt-3 rounded-md bg-gray-800 px-3 py-1.5 text-white ${FOCUS_RING}`}
        >
          {vi.debrief.reload}
        </button>
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
        <Link
          href={`/session/${id}`}
          className={`mt-3 inline-block rounded text-indigo-800 underline ${FOCUS_RING}`}
        >
          {vi.debrief.backToSession}
        </Link>
      </Notice>
    );
  } else if (evaluation.state === "error" || !ev) {
    body = (
      <Notice tone="error">
        <p>{vi.debrief.loadError}</p>
        <button
          type="button"
          onClick={refresh}
          className={`mt-3 rounded-md bg-red-700 px-3 py-1.5 text-white ${FOCUS_RING}`}
        >
          {vi.debrief.reload}
        </button>
      </Notice>
    );
  } else if (evFailed) {
    // Failure behaviour: no partial score, a retry button (evaluation.md).
    body = (
      <Notice tone="error">
        <p className="font-semibold">{vi.debrief.failedTitle}</p>
        {ev.error && <p className="mt-1">{ev.error}</p>}
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className={`mt-3 rounded-md bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-800 disabled:opacity-60 ${FOCUS_RING}`}
        >
          {retrying ? vi.debrief.retrying : vi.debrief.retry}
        </button>
        {retryError && <p className="mt-2 text-xs">{vi.debrief.retryError}</p>}
      </Notice>
    );
  } else if (evDone) {
    body = (
      <div className="space-y-5">
        {ev.critical_missed && <RedFlagAlertBanner />}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="space-y-5">
            <ScoreSummaryCard evaluation={ev} />
          </div>
          <RubricEvidenceList evaluation={ev} onOpenTurn={setFocusTurn} />
        </div>
        {debrief.state === "pending" || debrief.state === "loading" ? (
          <Skeleton message={vi.debrief.debriefPending} />
        ) : dbDone && db.summary ? (
          <>
            <PedagogicalDebriefPanel summary={db.summary} />
            <CitedClaimsSection items={db.items ?? []} />
          </>
        ) : (
          <Notice tone="info">{db?.error ?? vi.debrief.debriefFailed}</Notice>
        )}
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">{vi.debrief.title}</h1>
        <ExportPdfButton sessionId={id} disabled={!(evDone && dbDone)} />
      </header>
      <PracticeNoticeBanner sourcesReviewed={dbDone ? (db?.sources_reviewed ?? false) : null} />
      {body}
      <footer className="flex flex-wrap gap-3 border-t border-gray-200 pt-5">
        <Link
          href="/setup"
          className={`rounded-md bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-800 ${FOCUS_RING}`}
        >
          {vi.debrief.actions.newCase}
        </Link>
        {/* A finished session redirects away from /session/{id}, so review the transcript here. */}
        <button
          type="button"
          onClick={() => setFocusTurn(turns[0]?.turn_idx ?? 0)}
          disabled={turns.length === 0}
          className={`rounded-md border border-gray-400 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50 ${FOCUS_RING}`}
        >
          {vi.debriefUx.reviewTranscript}
        </button>
        {/* Owner-only delete (Slice 13): afterwards every route of this session is 404. */}
        <DeleteSessionButton
          sessionId={id}
          onDeleted={() => router.replace(auth.status === "signedIn" ? "/history" : "/")}
          className="ml-auto"
        />
      </footer>
      {focusTurn !== null && <TranscriptDrawer turns={turns} focusIdx={focusTurn} onClose={closeDrawer} />}
    </main>
  );
}
