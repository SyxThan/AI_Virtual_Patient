"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import vi from "../../../messages/vi.json";
import { EXAM_REGIONS, VIEWS, type AnchorId, type ExamRegionId, type RegionFindings, type ViewId } from "./avatarContract";
import type { AvatarSceneApi, AvatarSceneProps, HoverTarget, SceneStatus } from "./AvatarScene";
import { prefetchModelBytes } from "./modelBytes";
import { FOCUS_RING } from "@/components/ui/focus";
import { fmt } from "@/lib/sessionAuth";

// Three.js needs window/WebGL: never render it on the server (avatar-3d skill).
const AvatarScene = dynamic<AvatarSceneProps>(() => import("./AvatarScene"), { ssr: false });

const NO_FINDINGS: RegionFindings = {};
const HINT_SEEN_KEY = "avp_stage_hint_seen_v1";

/** What the page (keyboard shortcuts, exam record, transcript) can do to the stage. */
export type StageController = {
  setView: (view: ViewId) => void;
  focusRegion: (region: ExamRegionId) => void;
  focusChild: () => void;
  zoom: (direction: 1 | -1) => void;
  reset: () => void;
  toggleFullscreen: () => void;
  /** First use of a control: hides the first-run hint. */
  noteInteraction: () => void;
};

function hintSeen(): boolean {
  try {
    return localStorage.getItem(HINT_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The 3D stage of the Clinical Workspace: the clinic room filling its column,
 * with floating controls (views, fullscreen, zoom, reset), exam markers that
 * follow the child's body, the exam bar and a slot for the voice dock.
 *
 * Every exam can be done three ways: a click on the child (raycasting), a click
 * on a marker (exam view), or the exam bar, which is also the keyboard and
 * screen-reader path (markers are pointer shortcuts and stay out of the tab
 * order). Without WebGL only the exam bar remains, which is enough.
 */
export default function ClinicStage({
  controllerRef,
  findings = NO_FINDINGS,
  examined,
  busy = false,
  onExamineRegion,
  onObserve,
  onSpeakingChange,
  card,
  cardAnchor,
  caption,
  voice,
}: {
  controllerRef: Ref<StageController | null>;
  /** Region -> `documented` (lesion layer). */
  findings?: RegionFindings;
  /** Regions with a recorded exam (marker and chip state). */
  examined: ReadonlySet<ExamRegionId>;
  busy?: boolean;
  onExamineRegion: (region: ExamRegionId) => void;
  onObserve: () => void;
  onSpeakingChange?: (speaking: boolean) => void;
  /** Exam result card; positioned beside `cardAnchor` by the scene. */
  card?: ReactNode;
  cardAnchor?: AnchorId | null;
  caption?: ReactNode;
  voice?: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AvatarSceneApi | null>(null);

  const [status, setStatus] = useState<SceneStatus>({ phase: "loading", progress: 0 });
  const [view, setView] = useState<ViewId>("talk");
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const [barHover, setBarHover] = useState<ExamRegionId | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // Start the model download now, in parallel with the three.js chunk.
  useEffect(() => {
    prefetchModelBytes().catch(() => undefined); // the scene falls back on its own
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const ready = status.phase === "ready";
  const unsupported = status.phase === "unsupported";

  // First-run hint: once the scene is ready, until the first interaction.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled && !hintSeen()) setShowHint(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  const noteInteraction = useCallback(() => {
    setShowHint(false);
    try {
      localStorage.setItem(HINT_SEEN_KEY, "1");
    } catch {
      /* the hint simply shows again next time */
    }
  }, []);

  const chooseView = useCallback(
    (next: ViewId) => {
      setView(next);
      apiRef.current?.setView(next);
      noteInteraction();
    },
    [noteInteraction],
  );
  const toggleFullscreen = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.requestFullscreen?.().catch(() => undefined);
  }, []);

  useImperativeHandle(
    controllerRef,
    () => ({
      setView: chooseView,
      focusRegion: (region) => {
        setView("exam");
        apiRef.current?.focusRegion(region);
      },
      focusChild: () => {
        setView("exam");
        apiRef.current?.focusChild();
      },
      zoom: (d) => {
        apiRef.current?.zoom(d);
        noteInteraction();
      },
      reset: () => {
        apiRef.current?.setView(view);
        noteInteraction();
      },
      toggleFullscreen,
      noteInteraction,
    }),
    [chooseView, toggleFullscreen, noteInteraction, view],
  );

  const onReady = useCallback((api: AvatarSceneApi | null) => {
    apiRef.current = api;
  }, []);
  const onSpeaking = useCallback(
    (s: boolean) => {
      setSpeaking(s);
      onSpeakingChange?.(s);
    },
    [onSpeakingChange],
  );

  const examine = (region: ExamRegionId) => {
    if (busy) return;
    setView("exam");
    apiRef.current?.focusRegion(region);
    noteInteraction();
    onExamineRegion(region);
  };
  const observe = () => {
    if (busy) return;
    setView("exam");
    apiRef.current?.focusChild();
    noteInteraction();
    onObserve();
  };

  const litRegion = hover?.kind === "region" ? hover.region : barHover;
  const markersOn = ready && view === "exam";
  const tooltipText = hover
    ? hover.kind === "region"
      ? `${vi.exam.regions[hover.region]}${busy ? "" : `: ${vi.avatar.clickToExamine.toLowerCase()}`}`
      : hover.label
    : "";

  return (
    <div
      ref={rootRef}
      aria-label={vi.cockpit.stageLabel}
      role="region"
      className="relative flex min-h-0 min-w-0 flex-col md:h-full md:overflow-hidden md:rounded-tile md:ring-1 md:ring-line/70 [&:fullscreen]:h-full [&:fullscreen]:rounded-none [&:fullscreen]:bg-canvas"
    >
      {/* ------------------------------------------------------------ canvas box */}
      <div className="relative h-[45dvh] shrink-0 overflow-hidden rounded-tile bg-gradient-to-b from-sand-soft to-canvas ring-1 ring-line/70 md:h-full md:rounded-none md:ring-0 [:fullscreen_&]:h-full">
        <p className="sr-only">{vi.avatar.sceneLabel}</p>
        {!unsupported && (
          <AvatarScene
            onExamineRegion={busy ? undefined : examine}
            findings={findings}
            hoverRegion={barHover}
            tooltipRef={tooltipRef}
            overlayRef={overlayRef}
            onHoverChange={setHover}
            onStatus={setStatus}
            onSpeakingChange={onSpeaking}
            onFirstInteraction={noteInteraction}
            onReady={onReady}
          />
        )}

        {/* Things that follow 3D points. Only `transform` is written per frame. */}
        <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-10">
          {EXAM_REGIONS.map((r) => {
            const done = examined.has(r);
            const lit = litRegion === r;
            return (
              <button
                key={r}
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                data-anchor={r}
                data-opens-exam=""
                onClick={() => examine(r)}
                onPointerEnter={() => setBarHover(r)}
                onPointerLeave={() => setBarHover(null)}
                disabled={busy}
                className={`group absolute left-0 top-0 grid h-11 w-11 place-items-center rounded-full transition-opacity duration-[var(--dur-base)] data-[on-stage=false]:pointer-events-none data-[on-stage=false]:opacity-0 ${
                  markersOn ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
                }`}
              >
                {!done && (
                  <span
                    aria-hidden="true"
                    className="absolute h-7 w-7 rounded-full bg-glow/60 motion-safe:animate-ping"
                  />
                )}
                <span
                  className={`relative grid h-6 w-6 place-items-center rounded-full shadow-md ring-2 transition-transform duration-[var(--dur-fast)] ${
                    done ? "bg-success text-white ring-white" : "bg-primary ring-white"
                  } ${lit ? "scale-125" : ""}`}
                >
                  {done ? <CheckIcon /> : <span className="h-2 w-2 rounded-full bg-white" />}
                </span>
                <span
                  className={`pointer-events-none absolute bottom-full mb-1 whitespace-nowrap rounded-control bg-ink px-2 py-1 text-xs font-semibold text-white shadow-lg transition-opacity duration-[var(--dur-fast)] ${
                    lit ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                >
                  {fmt(vi.cockpit.markerTitle, { region: vi.exam.regions[r] })}
                </span>
              </button>
            );
          })}

          {/* "Mẹ đang nói" floats above the mother's head. */}
          <span
            data-anchor="head"
            aria-hidden="true"
            className={`absolute left-0 top-0 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-white shadow-lg transition-opacity duration-[var(--dur-base)] data-[on-stage=false]:opacity-0 ${
              ready && speaking ? "opacity-100" : "opacity-0"
            }`}
          >
            <SpeakingBars />
            {vi.avatar.speaking}
          </span>

          {card && cardAnchor && (
            <div
              key={cardAnchor}
              data-anchor={cardAnchor}
              data-anchor-kind="card"
              data-floating="false"
              className="absolute left-0 top-0 z-20 w-80 max-w-[calc(100%-24px)] data-[floating=false]:inset-x-3 data-[floating=false]:bottom-3 data-[floating=false]:top-auto data-[floating=false]:w-auto data-[floating=false]:max-w-none"
            >
              {card}
            </div>
          )}
        </div>

        {/* Pointer tooltip; AvatarScene moves it next to the cursor. */}
        <div
          ref={tooltipRef}
          aria-hidden="true"
          className={`pointer-events-none absolute left-0 top-0 z-20 max-w-[14rem] rounded-control bg-ink px-2.5 py-1 text-xs font-semibold text-white shadow-lg transition-opacity duration-150 ${
            hover ? "opacity-100" : "opacity-0"
          }`}
        >
          {tooltipText}
        </div>

        {/* Top: views (left), fullscreen (right). */}
        {ready && (
          <div className="absolute inset-x-3 top-3 z-20 flex items-start justify-between gap-2">
            <div
              role="group"
              aria-label={vi.avatar.views.label}
              className="flex rounded-full bg-surface/90 p-1 shadow-sm ring-1 ring-line/60 backdrop-blur"
            >
              {VIEWS.map((v, i) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  aria-keyshortcuts={["Q", "W", "E"][i]}
                  onClick={() => chooseView(v)}
                  className={`h-9 whitespace-nowrap rounded-full px-2.5 text-sm font-semibold transition-colors sm:px-3.5 ${FOCUS_RING} ${
                    view === v ? "bg-primary text-white" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {vi.avatar.views[v]}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-keyshortcuts="F"
              aria-label={fullscreen ? vi.avatar.exitFullscreen : vi.avatar.fullscreen}
              title={fullscreen ? vi.avatar.exitFullscreen : vi.avatar.fullscreen}
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface/90 text-ink shadow-sm ring-1 ring-line/60 backdrop-blur hover:bg-surface ${FOCUS_RING}`}
            >
              <FullscreenIcon exit={fullscreen} />
            </button>
          </div>
        )}

        {/* First-run hint: one line, gone after the first interaction. */}
        {showHint && (
          <div className="pointer-events-none absolute inset-x-3 top-16 z-20 flex justify-center">
            <p className="pointer-events-auto flex items-center gap-2 rounded-full bg-ink/85 py-1 pl-4 pr-1 text-sm text-white shadow-lg backdrop-blur motion-safe:animate-[fade-in_var(--dur-base)_var(--ease-out)_both]">
              <span>{vi.cockpit.firstHint}</span>
              <button
                type="button"
                onClick={noteInteraction}
                className="min-h-9 shrink-0 whitespace-nowrap rounded-full px-3 text-sm font-semibold text-glow hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-glow"
              >
                {vi.cockpit.dismissHint}
              </button>
            </p>
          </div>
        )}

        {status.phase === "loading" && (
          <div role="status" className="absolute inset-0 grid place-items-center p-6 text-center">
            <div className="w-full max-w-64">
              <p className="text-sm text-ink-muted">
                {vi.avatar.loadingProgress.replace("{pct}", String(Math.round(status.progress * 100)))}
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${Math.max(6, status.progress * 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}
        {unsupported && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <p className="max-w-xs text-sm leading-relaxed text-ink-muted">{vi.avatar.unsupported}</p>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------ dock
          >= md: floats over the bottom of the canvas. < md: below it, in flow. */}
      <div className="pointer-events-none z-20 flex flex-col gap-2 pt-3 md:absolute md:inset-x-0 md:bottom-0 md:bg-gradient-to-t md:from-canvas/85 md:via-canvas/40 md:to-transparent md:px-4 md:pb-4 md:pt-10">
        <div className="flex items-end justify-between gap-3">
          {/* Always visible; wording kept verbatim (draft, awaiting clinician review). */}
          <p className="pointer-events-auto flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs leading-snug text-ink-muted">
            <span className="font-semibold text-ink">{vi.avatar.illustrative}</span>
            <span aria-hidden="true">·</span>
            <span className="text-warning">{vi.avatar.lesionNote}</span>
            {ready && status.source === "procedural" && (
              <>
                <span aria-hidden="true">·</span>
                <span>{vi.avatar.fallbackModel}</span>
              </>
            )}
          </p>
          {ready && (
            <div className="pointer-events-auto hidden shrink-0 flex-col gap-1.5 md:flex">
              <StageIconButton label={vi.cockpit.zoomIn} onClick={() => controllerZoom(apiRef, 1, noteInteraction)}>
                <path d="M10 5v10M5 10h10" />
              </StageIconButton>
              <StageIconButton label={vi.cockpit.zoomOut} onClick={() => controllerZoom(apiRef, -1, noteInteraction)}>
                <path d="M5 10h10" />
              </StageIconButton>
              <StageIconButton
                label={vi.cockpit.resetView}
                onClick={() => {
                  apiRef.current?.setView(view);
                  noteInteraction();
                }}
              >
                <path d="M4.5 9.5a5.5 5.5 0 1 1 1.6 4.3M4.5 15v-4h4" />
              </StageIconButton>
            </div>
          )}
        </div>

        {caption}

        <div
          role="group"
          aria-label={vi.cockpit.examBar}
          className="pointer-events-auto -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 md:flex-wrap md:justify-center md:overflow-visible"
        >
          {EXAM_REGIONS.map((r, i) => {
            const done = examined.has(r);
            return (
              <button
                key={r}
                type="button"
                data-opens-exam=""
                disabled={busy}
                aria-keyshortcuts={String(i + 1)}
                aria-describedby={undefined}
                onClick={() => examine(r)}
                onPointerEnter={() => setBarHover(r)}
                onPointerLeave={() => setBarHover(null)}
                onFocus={() => setBarHover(r)}
                onBlur={() => setBarHover(null)}
                className={`inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-full px-3.5 text-sm font-semibold shadow-sm ring-1 backdrop-blur transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING} ${
                  done
                    ? "bg-success-soft/95 text-success ring-success/30"
                    : "bg-surface/95 text-ink ring-line-strong/60 hover:bg-surface"
                } ${barHover === r ? "ring-2 ring-primary" : ""}`}
              >
                {done ? <CheckIcon /> : <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />}
                {vi.exam.regions[r]}
                <span className="sr-only">: {done ? vi.avatar.examined : vi.avatar.notExamined}</span>
                <kbd
                  aria-hidden="true"
                  className="hidden rounded border border-current/25 px-1 text-[0.7rem] font-semibold opacity-60 min-[1600px]:inline"
                >
                  {i + 1}
                </kbd>
              </button>
            );
          })}
          <button
            type="button"
            data-opens-exam=""
            disabled={busy}
            onClick={observe}
            className={`inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-full bg-surface/95 px-3.5 text-sm font-semibold text-ink shadow-sm ring-1 ring-line-strong/60 backdrop-blur hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" aria-hidden="true">
              <path
                d="M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            {vi.exam.observe}
          </button>
        </div>

        {voice}
      </div>
    </div>
  );
}

function controllerZoom(apiRef: { current: AvatarSceneApi | null }, d: 1 | -1, note: () => void) {
  apiRef.current?.zoom(d);
  note();
}

function StageIconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-11 w-11 place-items-center rounded-full bg-surface/90 text-ink shadow-sm ring-1 ring-line/60 backdrop-blur hover:bg-surface ${FOCUS_RING}`}
    >
      <svg
        viewBox="0 0 20 20"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 shrink-0" fill="none" aria-hidden="true">
      <path d="M2.5 6.5l2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SpeakingBars() {
  return (
    <span className="inline-flex h-3 items-end gap-0.5" aria-hidden="true">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="w-0.5 animate-pulse rounded-full bg-current motion-reduce:animate-none"
          style={{ height: delay === 150 ? "100%" : "60%", animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

function FullscreenIcon({ exit }: { exit: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d={
          exit
            ? "M7.5 3v4.5H3M12.5 3v4.5H17M7.5 17v-4.5H3M12.5 17v-4.5H17"
            : "M3 7.5V3h4.5M17 7.5V3h-4.5M3 12.5V17h4.5M17 12.5V17h-4.5"
        }
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
