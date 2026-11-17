"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import vi from "../../../../messages/vi.json";
import {
  VIEWS,
  isExamRegion,
  parseFindings,
  type ExamRegionId,
  type RegionFindings,
} from "@/components/avatar/avatarContract";
import ClinicStage, { type StageController } from "@/components/avatar/ClinicStage";
import ExamResultCard, { type ExamActionResponse, type ExamCardState } from "@/components/avatar/ExamResultCard";
import { patientLipSync } from "@/components/avatar/LipSyncController";
import Exam2DStage, { type Stage2DController } from "@/components/exam2d/Exam2DStage";
import GuidedChecklist, { useGuideTicks, type GuideItem } from "@/components/guide/GuidedChecklist";
import OnboardingOverlay, { onboardingSeen } from "@/components/onboarding/OnboardingOverlay";
import Button, { buttonClass } from "@/components/ui/Button";
import PageShell from "@/components/ui/PageShell";
import Tile from "@/components/ui/Tile";
import ChatInput from "@/components/workspace/ChatInput";
import CockpitFrame from "@/components/workspace/CockpitFrame";
import ExamRecord from "@/components/workspace/ExamRecord";
import FinishDialog from "@/components/workspace/FinishDialog";
import SessionSidebar, { type SidebarTab } from "@/components/workspace/SessionSidebar";
import SessionTimer from "@/components/workspace/SessionTimer";
import SessionTopBar from "@/components/workspace/SessionTopBar";
import StageCaption from "@/components/workspace/StageCaption";
import TranscriptBox, { type PendingTurn, type Turn } from "@/components/workspace/TranscriptBox";
import VoiceDock from "@/components/workspace/VoiceDock";
import { ExamRegionsContext, HFMD_REGIONS, regionsFromCase } from "@/components/workspace/examRegions";
import { examTargetOf, lastPatientLine, latestFindings, type ExamTarget } from "@/components/workspace/examTurns";
import {
  useVoiceSession,
  type LockReason,
  type VoiceTranscript,
} from "@/hooks/useVoiceSession";
import type { components } from "@/lib/api-client/schema";
import { examModeOf, useSessionCase } from "@/lib/caseSummary";
import { API_URL, authHeaders, fmt, whenAuthReady } from "@/lib/sessionAuth";

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

/** The mother counts as replying until her voice has been quiet this long (no flicker between words). */
const REPLY_HOLD_MS = 700;

function isTypingTarget(el: EventTarget | null): boolean {
  return (
    el instanceof HTMLElement &&
    (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")
  );
}

/** Exam findings kept for this tab (sessionStorage may be blocked: then none). */
function readFindings(key: string): RegionFindings {
  try {
    return parseFindings(window.sessionStorage.getItem(key));
  } catch {
    return {};
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

  // Exam result card on the stage (replaces the old modal) and its announcement.
  const [card, setCard] = useState<ExamCardState | null>(null);
  const [cardPinned, setCardPinned] = useState(false);
  const [examLoading, setExamLoading] = useState(false);
  const [examAnnounce, setExamAnnounce] = useState("");
  const [tab, setTab] = useState<SidebarTab>("chat");
  const [replying, setReplying] = useState(false);
  const replyTimer = useRef<number | undefined>(undefined);
  const stageRef = useRef<StageController | null>(null);
  const stage2dRef = useRef<Stage2DController | null>(null);
  // AVP-150: the case decides the stage. 3D (mother and child) only when its
  // catalog says so; any other case gets the 2D illustration with its hotspots.
  const sessionCase = useSessionCase(id);
  const regions = useMemo(
    () => (sessionCase && examModeOf(sessionCase) === "3d" ? HFMD_REGIONS : regionsFromCase(sessionCase ?? null)),
    [sessionCase],
  );
  const is3d = regions.mode === "3d";
  const regionLabel = (target: ExamTarget) => regions.labelOf(target).toLowerCase();
  const { ticks, toggle: toggleTick } = useGuideTicks(id);
  // Regions examined in this session -> `documented` (drives the avatar's region
  // status and illustrative lesion layer). Per-viewer convenience only: kept in
  // sessionStorage so a reload keeps it; the transcript stays the source of truth.
  const [examFindings, setExamFindings] = useState<Record<string, boolean>>({});

  const inputRef = useRef<HTMLInputElement>(null);

  const findingsKey = `avp.exam-findings.${id}`;
  const recordFinding = useCallback(
    (region: string, documented: boolean) => {
      setExamFindings((cur) => {
        const next = { ...cur, [region]: documented };
        try {
          window.sessionStorage.setItem(findingsKey, JSON.stringify(next));
        } catch {
          // storage blocked: the in-memory state still works
        }
        return next;
      });
    },
    [findingsKey],
  );

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
  // guide (timer start, limit, checklist).
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
        setExamFindings(readFindings(`avp.exam-findings.${id}`));
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

  async function handleExam(body: ExamActionRequest, target: ExamTarget) {
    if (lock) return;
    setExamLoading(true);
    setCardPinned(false);
    setCard({ source: "live", target, loading: true, error: null, result: null });
    setExamAnnounce(fmt(vi.cockpit.announce.examLoading, { region: regionLabel(target) }));
    try {
      const res = await fetch(`${API_URL}/api/v1/sessions/${id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const result = (await res.json()) as ExamActionResponse;
      setCard({ source: "live", target, loading: false, error: null, result });
      setExamAnnounce(
        fmt(vi.cockpit.announce.exam, {
          region: regionLabel(target),
          finding: result.documented ? (result.finding ?? "") : vi.exam.unknown,
        }),
      );
      if (result.action === "examine_region" && result.region) recordFinding(result.region, result.documented);
      // The exam was recorded as transcript turns: reload the canonical transcript.
      await reloadTurns();
    } catch {
      setCard({ source: "live", target, loading: false, error: vi.exam.error, result: null });
      setExamAnnounce(vi.exam.error);
    } finally {
      setExamLoading(false);
    }
  }

  const examineRegion = (region: string) => handleExam({ action: "examine_region", region }, region);
  const observeChild = () => handleExam({ action: "observe_child" }, "observe_child");

  const closeCard = useCallback(() => {
    setCard(null);
    setCardPinned(false);
  }, []);

  /** Fly the camera to a region (or the whole child) without examining it. */
  const goTo = useCallback((target: ExamTarget) => {
    if (target === "observe_child") stageRef.current?.focusChild();
    else if (isExamRegion(target)) stageRef.current?.focusRegion(target);
    else stage2dRef.current?.focusRegion(target); // 2D: focus the hotspot
  }, []);

  /** Reopen a past exam from the transcript or the exam record. */
  const openRecorded = useCallback(
    (target: ExamTarget, finding: string | null) => {
      goTo(target);
      setCardPinned(false);
      setCard({
        source: "transcript",
        target,
        finding,
        documented: target === "observe_child" ? undefined : examFindings[target],
      });
    },
    [goTo, examFindings],
  );

  // The mother's voice (lip-sync level) drives the "replying" state, held a
  // little after she falls silent so the button does not flicker between words.
  const onSpeakingChange = useCallback((speaking: boolean) => {
    window.clearTimeout(replyTimer.current);
    if (speaking) setReplying(true);
    else replyTimer.current = window.setTimeout(() => setReplying(false), REPLY_HOLD_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(replyTimer.current), []);

  const focusInput = useCallback(() => inputRef.current?.focus(), []);

  // ----- keyboard shortcuts (never while typing or while a dialog is open) -----
  const shortcuts = useRef<{
    enabled: boolean;
    canTalk: boolean;
    ids: readonly string[];
    examine: (region: string) => void;
    talk: (down: boolean) => void;
    escape: () => boolean;
  }>({ enabled: false, canTalk: false, ids: [], examine: () => {}, talk: () => {}, escape: () => false });
  const spaceHeld = useRef(false);
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const k = shortcuts.current;
      if (!k.enabled || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === "Escape") {
        if (k.escape()) e.preventDefault();
        return;
      }
      if (e.key === " ") {
        // The push-to-talk button handles its own Space; elsewhere Space means "talk".
        if ((e.target as Element | null)?.closest?.("[data-ptt]")) return;
        e.preventDefault();
        if (!e.repeat && k.canTalk && !spaceHeld.current) {
          spaceHeld.current = true;
          k.talk(true);
        }
        return;
      }
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= k.ids.length) {
        e.preventDefault();
        k.examine(k.ids[n - 1]);
      } else if (key === "q" || key === "w" || key === "e") {
        e.preventDefault();
        stageRef.current?.setView(VIEWS["qwe".indexOf(key)]);
      } else if (key === "f") {
        e.preventDefault();
        stageRef.current?.toggleFullscreen();
      } else if (e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key !== " " || !spaceHeld.current) return;
      spaceHeld.current = false;
      e.preventDefault();
      shortcuts.current.talk(false);
    };
    const onBlur = () => {
      if (!spaceHeld.current) return;
      spaceHeld.current = false;
      shortcuts.current.talk(false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const recorded = useMemo(() => latestFindings(turns, regions.labelToTarget), [turns, regions]);
  const lastReply = useMemo(() => lastPatientLine(turns), [turns]);

  // Latest values for the window key handlers (refreshed after every render).
  useEffect(() => {
    shortcuts.current = {
      enabled: load === "ready" && !finishOpen && !onboardingOpen,
      canTalk:
        !lock &&
        pending?.state !== "sending" &&
        !replying &&
        !voice.gaveUp &&
        voice.micState !== "denied" &&
        voice.micState !== "unsupported" &&
        voice.status !== "processing" &&
        voice.status !== "connecting" &&
        voice.status !== "reconnecting",
      ids: regions.ids,
      examine: (region) => {
        if (examLoading || lock) return;
        if (isExamRegion(region)) stageRef.current?.focusRegion(region);
        stageRef.current?.noteInteraction();
        void examineRegion(region);
      },
      talk: (down) => {
        if (down) void voice.start();
        else voice.stop();
      },
      escape: () => {
        if (!card) return false;
        closeCard();
        return true;
      },
    };
  });

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
                  href="/cases"
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
  const startedAtMs = Date.parse(guide?.started_at ?? meta.created_at);
  const voiceBusy = voice.status === "processing" || voice.status === "recording";
  const lockedReason =
    lock === "timeUp"
      ? vi.workspace.inputDisabledTimeUp
      : lock === "finished"
        ? vi.workspace.errors.finished
        : null;

  const examined = new Set<string>(regions.ids.filter((r) => r in recorded || r in examFindings));
  const sending = pending?.state === "sending";
  const guideItems = !exam && guide?.checklist_enabled ? guide.items : [];
  const ticked = guideItems.filter((i) => ticks.has(i.criterion_id)).length;
  const voiceDock = (
    <VoiceDock
      status={voice.status}
      micState={voice.micState}
      gaveUp={voice.gaveUp}
      error={voice.error}
      notice={voice.notice}
      replying={replying}
      disabled={sending}
      lockedReason={lockedReason}
      micLevel={voice.micLevel}
      onStart={() => void voice.start()}
      onStop={voice.stop}
      onRetry={voice.retryConnection}
      onTypeInstead={focusInput}
    />
  );
  const cardNode = card && (
    <ExamResultCard state={card} pinned={cardPinned} onPin={setCardPinned} onClose={closeCard} />
  );

  return (
    <ExamRegionsContext.Provider value={regions}>
      <CockpitFrame
        topBar={
          <SessionTopBar
            exam={exam}
            timer={
              <SessionTimer
                startedAtMs={startedAtMs}
                offsetMs={clockOffset}
                limitS={exam ? (guide?.time_limit_s ?? null) : null}
                onExpire={() => setLock("timeUp")}
              />
            }
            onHelp={() => setOnboardingOpen(true)}
            onFinish={() => {
              setFinishError(null);
              setFinishOpen(true);
            }}
          />
        }
        banner={
          lock === "timeUp" && (
            <div
              role="alert"
              className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-card border border-warning/30 bg-warning-soft px-4 py-2.5 text-ink"
            >
              <p className="text-sm">
                <span className="font-bold text-warning">{vi.workspace.timer.timeUpTitle}.</span>{" "}
                {vi.workspace.timer.timeUpBody}
              </p>
              <Button variant="primary" onClick={() => setFinishOpen(true)}>
                {vi.session.finish}
              </Button>
            </div>
          )
        }
        stage={
          sessionCase === undefined ? (
            // The case decides 3D or 2D: hold an empty stage for that one request.
            <div
              aria-busy="true"
              className="h-[45dvh] animate-pulse rounded-tile bg-sand-soft motion-reduce:animate-none md:h-full"
            />
          ) : !is3d ? (
            <Exam2DStage
              controllerRef={stage2dRef}
              examined={examined}
              busy={examLoading || !!lock}
              onExamineRegion={examineRegion}
              onSpeakingChange={onSpeakingChange}
              card={cardNode}
              caption={<StageCaption text={lastReply?.text ?? null} />}
              voice={voiceDock}
            />
          ) : (
          <ClinicStage
            controllerRef={stageRef}
            findings={examFindings as RegionFindings}
            examined={examined as ReadonlySet<ExamRegionId>}
            busy={examLoading || !!lock}
            onExamineRegion={examineRegion}
            onObserve={observeChild}
            onSpeakingChange={onSpeakingChange}
            card={cardNode}
            cardAnchor={card ? (card.target === "observe_child" ? "child" : isExamRegion(card.target) ? card.target : null) : null}
            caption={<StageCaption text={lastReply?.text ?? null} />}
            voice={voiceDock}
          />
          )
        }
        renderSidebar={(collapseButton) => (
          <SessionSidebar
            tab={tab}
            onTab={setTab}
            chatCount={turns.filter((t) => t.speaker !== "system" && !examTargetOf(t.text, regions.labelToTarget)).length}
            examDone={examined.size}
            examTotal={regions.ids.length}
            headerAction={collapseButton}
            chat={
              <TranscriptBox
                turns={turns}
                pending={pending}
                waiting={voice.status === "processing"}
                onResend={() => pending && void sendTurn(pending.text)}
                onDiscard={() => setPending(null)}
                onOpenExam={openRecorded}
              />
            }
            record={<ExamRecord findings={recorded} onOpen={openRecorded} onGoTo={goTo} />}
            composer={
              <ChatInput
                onSend={(t) => void sendTurn(t)}
                busy={sending || voiceBusy}
                lockedReason={lockedReason}
                inputRef={inputRef}
              />
            }
            drawer={
              // Guided mode only; exam mode gets no checklist from the API either.
              !exam && (
                <GuidedChecklist
                  sessionId={id}
                  items={guideItems}
                  state={guideState}
                  ticks={ticks}
                  onToggle={toggleTick}
                  onRetry={() => void loadGuide()}
                />
              )
            }
          />
        )}
      />

      {/* One polite announcement per new reply and per exam result (the log itself stays quiet). */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {lastReply ? fmt(vi.cockpit.announce.reply, { text: lastReply.text }) : ""}
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {examAnnounce}
      </div>

      <FinishDialog
        open={finishOpen}
        turnCount={turns.length}
        unexamined={regions.ids.length - examined.size}
        regionTotal={regions.ids.length}
        unticked={guideItems.length > 0 ? { n: guideItems.length - ticked, total: guideItems.length } : null}
        finishing={finishing}
        error={finishError}
        onConfirm={() => void handleFinish()}
        onCancel={() => setFinishOpen(false)}
      />
      <OnboardingOverlay open={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
    </ExamRegionsContext.Provider>
  );
}
