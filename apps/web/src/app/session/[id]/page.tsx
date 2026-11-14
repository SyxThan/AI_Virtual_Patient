"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useRef, useState } from "react";
import vi from "../../../../messages/vi.json";
import type { ExamRegionId } from "@/components/avatar/AnatomyColliders";
import AvatarCanvas from "@/components/avatar/AvatarCanvas";
import ExamFindingPanel, { type ExamActionResponse } from "@/components/avatar/ExamFindingPanel";
import { patientLipSync } from "@/components/avatar/LipSyncController";
import GuidedChecklist, { type GuideItem } from "@/components/guide/GuidedChecklist";
import OnboardingOverlay, { onboardingSeen } from "@/components/onboarding/OnboardingOverlay";
import Badge from "@/components/ui/Badge";
import Button, { buttonClass } from "@/components/ui/Button";
import PageShell from "@/components/ui/PageShell";
import Tile from "@/components/ui/Tile";
import ChatInput from "@/components/workspace/ChatInput";
import FinishDialog from "@/components/workspace/FinishDialog";
import PushToTalk from "@/components/workspace/PushToTalk";
import SessionTimer from "@/components/workspace/SessionTimer";
import TranscriptBox, { type PendingTurn, type Turn } from "@/components/workspace/TranscriptBox";
import VitalsMonitor from "@/components/workspace/VitalsMonitor";
import {
  useVoiceSession,
  type LockReason,
  type VoiceTranscript,
} from "@/hooks/useVoiceSession";
import type { components } from "@/lib/api-client/schema";
import { API_URL, authHeaders, whenAuthReady } from "@/lib/sessionAuth";

type ExamActionRequest = components["schemas"]["ExamActionRequest"];

/** Local mirror of GET /sessions/{id}/guide (the generated client is regenerated later). */
type GuideResponse = {
  session_id: string;
  mode: string;
  checklist_enabled: boolean;
  items: GuideItem[];
  rubric_version: number | null;
  review_status: "draft";
  notice: string;
  time_limit_s: number | null;
  started_at: string;
  server_now: string;
  deadline_at: string | null;
  time_limit_reached: boolean;
};

type SessionMeta = { id: string; mode: string; status: string; created_at: string };
type LoadState = "loading" | "ready" | "notFound" | "error" | "redirecting";
type Lock = "timeUp" | "finished" | null;

const TURN_TIMEOUT_MS = 30_000;

async function errorCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: { code?: string } };
    return body.error?.code ?? null;
  } catch {
    return null;
  }
}

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [load, setLoad] = useState<LoadState>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const [lock, setLock] = useState<Lock>(null);

  const [guide, setGuide] = useState<GuideResponse | null>(null);
  const [guideState, setGuideState] = useState<"loading" | "ready" | "error">("loading");
  const [clockOffset, setClockOffset] = useState(0);

  const [finishOpen, setFinishOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  const [examOpen, setExamOpen] = useState(false);
  const [examResult, setExamResult] = useState<ExamActionResponse | null>(null);
  const [examLoading, setExamLoading] = useState(false);
  const [examError, setExamError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const goToDebrief = useCallback(() => {
    setLoad("redirecting");
    router.replace(`/debrief/${id}`);
  }, [id, router]);

  /** Canonical transcript from the server (after a failed voice turn or an exam action). */
  const reloadTurns = useCallback(async (): Promise<Turn[] | null> => {
    try {
      const res = await fetch(`${API_URL}/api/v1/sessions/${id}/turns`, { headers: authHeaders() });
      if (!res.ok) return null;
      const fresh = (await res.json()) as Turn[];
      setTurns(fresh);
      return fresh;
    } catch {
      return null; // keep what is shown; the next action retries
    }
  }, [id]);

  const applyLock = useCallback((reason: LockReason) => {
    setLock(reason === "TIME_LIMIT_REACHED" ? "timeUp" : "finished");
  }, []);

  // Voice turns land in the same transcript list as typed turns.
  const onVoiceTranscript = useCallback((t: VoiceTranscript) => {
    setTurns((cur) => [
      ...cur,
      { turn_idx: t.turn_idx ?? cur.length, speaker: t.speaker, text: t.text },
    ]);
  }, []);
  const voice = useVoiceSession({
    sessionId: id,
    onTranscript: onVoiceTranscript,
    onTurnFailed: () => void reloadTurns(),
    onLocked: applyLock,
  });
  const { shutdown: shutdownVoice, prepareAudio, speakTurn, stopSpeaking } = voice;

  // Lip-sync follows the patient's voice playback once audio output exists.
  useEffect(() => {
    if (!voice.analyser) return;
    patientLipSync.attachAnalyser(voice.analyser);
    return () => patientLipSync.detach();
  }, [voice.analyser]);

  // Restore on load / reload (T-SESSION-01): session (mode, status), transcript,
  // guide (timer start, limit, checklist). Vitals restore inside VitalsMonitor.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await whenAuthReady(); // the first request must carry the restored bearer token
        const sRes = await fetch(`${API_URL}/api/v1/sessions/${id}`, { headers: authHeaders() });
        if (cancelled) return;
        if (sRes.status === 404 || sRes.status === 401 || sRes.status === 422) {
          setLoad("notFound");
          return;
        }
        if (!sRes.ok) throw new Error(`HTTP ${sRes.status}`);
        const s = (await sRes.json()) as SessionMeta;
        if (cancelled) return;
        if (s.status !== "active") {
          goToDebrief(); // a finished session can only be reviewed on the debrief page
          return;
        }
        const tRes = await fetch(`${API_URL}/api/v1/sessions/${id}/turns`, {
          headers: authHeaders(),
        });
        if (!tRes.ok) throw new Error(`HTTP ${tRes.status}`);
        const t = (await tRes.json()) as Turn[];
        if (cancelled) return;
        setMeta(s);
        setTurns(t);
        setLoad("ready");
        if (!onboardingSeen()) setOnboardingOpen(true);
      } catch {
        if (!cancelled) setLoad("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey, goToDebrief]);

  const loadGuide = useCallback(async () => {
    setGuideState("loading");
    try {
      const res = await fetch(`${API_URL}/api/v1/sessions/${id}/guide`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const g = (await res.json()) as GuideResponse;
      setGuide(g);
      setClockOffset(Date.parse(g.server_now) - Date.now());
      if (g.time_limit_reached) setLock("timeUp");
      setGuideState("ready");
    } catch {
      setGuideState("error");
    }
  }, [id]);

  useEffect(() => {
    if (load !== "ready") return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void loadGuide();
    });
    return () => {
      cancelled = true;
    };
  }, [load, loadGuide]);

  // Voice unusable (mic denied/unsupported, or reconnects exhausted): move
  // keyboard focus to the text input so the student can carry on typing.
  const voiceUnusable =
    voice.micState === "denied" || voice.micState === "unsupported" || voice.gaveUp;
  useEffect(() => {
    if (voiceUnusable && load === "ready" && !onboardingOpen) inputRef.current?.focus();
  }, [voiceUnusable, load, onboardingOpen]);

  async function sendTurn(text: string) {
    if (lock) return;
    // Inside the submit gesture: allow the reply to be read aloud (AVP-133), and
    // cut the previous reply if it is still playing.
    prepareAudio();
    stopSpeaking();
    setPending({ text, state: "sending" });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TURN_TIMEOUT_MS);
    try {
      const res = await fetch(`${API_URL}/api/v1/sessions/${id}/turns`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ text }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const code = await errorCode(res);
        if (code === "TIME_LIMIT_REACHED") {
          setLock("timeUp");
          setPending({ text, state: "failed", error: vi.workspace.errors.timeUp });
          return;
        }
        if (code === "SESSION_FINISHED") {
          setLock("finished");
          setPending({ text, state: "failed", error: vi.workspace.errors.finished });
          return;
        }
        const msg =
          res.status === 413 || code === "TURN_TOO_LONG"
            ? vi.workspace.errors.tooLong
            : vi.workspace.errors.unavailable;
        setPending({ text, state: "failed", error: msg });
        return;
      }
      const patient = (await res.json()) as Turn;
      // Only now is the question saved: show it with the real reply.
      setTurns((cur) => [
        ...cur,
        { turn_idx: patient.turn_idx - 1, speaker: "student", text },
        patient,
      ]);
      setPending(null);
      void speakTurn(patient.turn_idx); // never throws; text is already shown
    } catch (e) {
      const timedOut = e instanceof DOMException && e.name === "AbortError";
      setPending({
        text,
        state: "failed",
        error: timedOut ? vi.workspace.errors.timeout : vi.workspace.errors.network,
      });
      // A timed-out request may still have been answered server-side: resync,
      // and drop the "not sent" bubble if the server did save it (no duplicate resend).
      if (timedOut) {
        const fresh = await reloadTurns();
        const lastStudent = fresh?.filter((t) => t.speaker === "student").at(-1);
        if (lastStudent?.text === text && fresh?.at(-1)?.speaker === "patient") setPending(null);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  // End the interview: the backend completes the session and queues the
  // evaluation (idempotent), then the debrief page polls for the result.
  async function handleFinish() {
    setFinishing(true);
    setFinishError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/sessions/${id}/finish`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error();
      shutdownVoice();
      setFinishOpen(false);
      goToDebrief();
    } catch {
      setFinishError(vi.session.finishError);
      setFinishing(false);
    }
  }

  async function handleExam(body: ExamActionRequest) {
    if (lock) return;
    setExamOpen(true);
    setExamLoading(true);
    setExamError(null);
    setExamResult(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/sessions/${id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      setExamResult((await res.json()) as ExamActionResponse);
      // The exam was recorded as transcript turns: reload the canonical transcript.
      await reloadTurns();
    } catch {
      setExamError(vi.exam.error);
    } finally {
      setExamLoading(false);
    }
  }

  const examineRegion = (region: ExamRegionId) => handleExam({ action: "examine_region", region });
  const observeChild = () => handleExam({ action: "observe_child" });

  // ----- non-ready states -----
  if (load !== "ready" || !meta) {
    return (
      <PageShell width="narrow">
        <Tile className="flex flex-col items-start gap-5">
          {load === "loading" || load === "redirecting" ? (
            <p role="status" className="flex items-center gap-3 text-ink">
              <span
                className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-primary motion-reduce:animate-none"
                aria-hidden="true"
              />
              {load === "loading" ? vi.workspace.loading : vi.workspace.redirecting}
            </p>
          ) : (
            <>
              <p role="alert" className="text-lg font-semibold leading-snug text-ink">
                {load === "notFound" ? vi.workspace.notFound : vi.workspace.loadError}
              </p>
              <div className="flex flex-wrap gap-3">
                {load === "error" && (
                  <Button
                    variant="primary"
                    onClick={() => {
                      setLoad("loading");
                      setReloadKey((k) => k + 1);
                    }}
                  >
                    {vi.workspace.retryLoad}
                  </Button>
                )}
                <Link
                  href="/setup"
                  className={buttonClass({ variant: load === "error" ? "secondary" : "primary" })}
                >
                  {vi.workspace.backToSetup}
                </Link>
              </div>
            </>
          )}
        </Tile>
      </PageShell>
    );
  }

  const exam = meta.mode === "exam";
  const modeLabel = exam ? vi.session.mode.exam : vi.session.mode.guided;
  const startedAtMs = Date.parse(guide?.started_at ?? meta.created_at);
  const voiceBusy = voice.status === "processing" || voice.status === "recording";
  const lockedReason =
    lock === "timeUp"
      ? vi.workspace.inputDisabledTimeUp
      : lock === "finished"
        ? vi.workspace.errors.finished
        : null;

  return (
    <main id="main" className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
      {/* Top bar: who the patient is, the mode, the clock, and the way out */}
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-tile bg-surface px-5 py-4 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-lg font-bold tracking-tight text-ink sm:text-xl">
            {vi.session.patientName}
          </h1>
          <Badge tone={exam ? "info" : "primary"}>
            <span className="sr-only">{vi.session.modeLabel}: </span>
            {modeLabel}
          </Badge>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 min-[400px]:grid-cols-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-3">
          <div className="min-[400px]:col-span-2 sm:contents">
            <SessionTimer
              startedAtMs={startedAtMs}
              offsetMs={clockOffset}
              limitS={exam ? (guide?.time_limit_s ?? null) : null}
              onExpire={() => setLock("timeUp")}
            />
          </div>
          <Button variant="ghost" onClick={() => setOnboardingOpen(true)}>
            {vi.workspace.help}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setFinishError(null);
              setFinishOpen(true);
            }}
          >
            {vi.session.finish}
          </Button>
        </div>
      </header>

      {lock === "timeUp" && (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-warning/30 bg-warning-soft px-5 py-4 text-ink"
        >
          <div className="flex items-start gap-3">
            <svg
              viewBox="0 0 20 20"
              className="mt-0.5 h-5 w-5 shrink-0 text-warning"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M10 6v4.5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <div>
              <p className="font-bold text-warning">{vi.workspace.timer.timeUpTitle}</p>
              <p className="text-sm">{vi.workspace.timer.timeUpBody}</p>
            </div>
          </div>
          <Button variant="primary" onClick={() => setFinishOpen(true)}>
            {vi.session.finish}
          </Button>
        </div>
      )}

      {/* < 1024 px: one column, avatar -> monitor -> chat (-> checklist).
          >= 1024 px: patient column left (5/12), chat column right (7/12). */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
        <section
          aria-label={vi.workspace.regions.patient}
          className="flex min-w-0 flex-col gap-4 lg:col-span-5 lg:col-start-1 lg:row-start-1"
        >
          <AvatarCanvas
            onExamineRegion={examineRegion}
            onObserve={observeChild}
            busy={examLoading || !!lock}
          />
          <VitalsMonitor sessionId={id} disabled={!!lock} />
        </section>

        <section
          aria-label={vi.workspace.regions.chat}
          className="flex h-[75vh] min-h-[26rem] min-w-0 flex-col overflow-hidden rounded-tile bg-surface lg:sticky lg:top-4 lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-1 lg:h-[calc(100vh-10rem)]"
        >
          <TranscriptBox
            turns={turns}
            pending={pending}
            waiting={voice.status === "processing"}
            onResend={() => pending && void sendTurn(pending.text)}
            onDiscard={() => setPending(null)}
          />
          <div className="border-t border-line">
            {!lock && (
              <PushToTalk
                status={voice.status}
                error={voice.error}
                notice={voice.notice}
                micState={voice.micState}
                gaveUp={voice.gaveUp}
                disabled={pending?.state === "sending"}
                onStart={() => void voice.start()}
                onStop={voice.stop}
                onRetry={voice.retryConnection}
              />
            )}
            <ChatInput
              onSend={(t) => void sendTurn(t)}
              busy={pending?.state === "sending" || voiceBusy}
              lockedReason={lockedReason}
              inputRef={inputRef}
            />
          </div>
        </section>

        {/* Guided mode only; exam mode gets no checklist from the API either. */}
        {!exam && (
          <div className="min-w-0 lg:col-span-5 lg:col-start-1 lg:row-start-2">
            <GuidedChecklist
              sessionId={id}
              items={guide?.checklist_enabled ? guide.items : []}
              state={guideState}
              onRetry={() => void loadGuide()}
            />
          </div>
        )}
      </div>

      <ExamFindingPanel
        open={examOpen}
        result={examResult}
        loading={examLoading}
        error={examError}
        onClose={() => setExamOpen(false)}
      />
      <FinishDialog
        open={finishOpen}
        turnCount={turns.length}
        finishing={finishing}
        error={finishError}
        onConfirm={() => void handleFinish()}
        onCancel={() => setFinishOpen(false)}
      />
      <OnboardingOverlay open={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
    </main>
  );
}
