"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import vi from "../../../messages/vi.json";
import { EXAM_REGIONS, VIEWS, type ExamRegionId, type RegionFindings, type ViewId } from "./avatarContract";
import type { AvatarSceneApi, AvatarSceneProps, HoverTarget, SceneStatus } from "./AvatarScene";
import { prefetchModelBytes } from "./modelBytes";
import Badge from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { FOCUS_RING } from "@/components/ui/focus";
import Tile from "@/components/ui/Tile";

// Three.js needs window/WebGL: never render it on the server (avatar-3d skill).
const AvatarScene = dynamic<AvatarSceneProps>(() => import("./AvatarScene"), { ssr: false });

const WHEEL_HINT_MS = 1600;
const NO_FINDINGS: RegionFindings = {};

/**
 * Avatar tile of the Clinical Workspace: the 3D clinic room plus its controls.
 *
 * Regions can be examined by clicking the child on the 3D model (raycasting)
 * or with the region buttons below it, so the exam also works by keyboard,
 * with assistive technology, and without WebGL (TASK-S12-04). The buttons and
 * the model are linked both ways: hovering a button lights the region on the
 * child, and each button shows whether that region was already examined.
 * `busy` blocks both exam paths.
 */
export default function AvatarCanvas({
  onExamineRegion,
  onObserve,
  findings = NO_FINDINGS,
  busy = false,
}: {
  onExamineRegion?: (regionId: ExamRegionId) => void;
  onObserve?: () => void;
  /** Region -> `documented` for regions examined in this session. */
  findings?: RegionFindings;
  busy?: boolean;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AvatarSceneApi | null>(null);
  const wheelTimer = useRef<number | undefined>(undefined);

  const [status, setStatus] = useState<SceneStatus>({ phase: "loading", progress: 0 });
  const [view, setView] = useState<ViewId>("talk");
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const [buttonHover, setButtonHover] = useState<ExamRegionId | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [wheelHint, setWheelHint] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // Start the model download now, in parallel with the three.js chunk.
  useEffect(() => {
    prefetchModelBytes().catch(() => undefined); // the scene falls back on its own
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      window.clearTimeout(wheelTimer.current);
    };
  }, []);

  const onReady = useCallback((api: AvatarSceneApi | null) => {
    apiRef.current = api;
  }, []);
  const onWheelPassThrough = useCallback(() => {
    setWheelHint(true);
    window.clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(() => setWheelHint(false), WHEEL_HINT_MS);
  }, []);

  const canExamine = !!onExamineRegion && !busy;
  const examine = (region: ExamRegionId) => {
    if (!onExamineRegion || busy) return;
    apiRef.current?.focusRegion(region);
    onExamineRegion(region);
  };
  const chooseView = (next: ViewId) => {
    setView(next);
    apiRef.current?.setView(next);
  };
  const toggleFullscreen = () => {
    const stage = stageRef.current;
    if (!stage) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stage.requestFullscreen?.().catch(() => undefined);
  };

  const ready = status.phase === "ready";
  const unsupported = status.phase === "unsupported";
  const anyLesion = EXAM_REGIONS.some((r) => findings[r] === true) && ready && status.source === "model";
  const tooltipText = hover
    ? hover.kind === "region"
      ? `${vi.exam.regions[hover.region]}${canExamine ? `: ${vi.avatar.clickToExamine.toLowerCase()}` : ""}`
      : hover.label
    : "";

  return (
    <Tile
      as="section"
      compact
      aria-labelledby="avatar-title"
      className="flex min-w-0 flex-col gap-4 overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="avatar-title" className="text-base font-bold text-ink">
          {vi.avatar.title}
        </h2>
        <div className="flex items-center gap-2">
          {speaking && (
            <Badge tone="primary" aria-hidden="true">
              <SpeakingBars />
              {vi.avatar.speaking}
            </Badge>
          )}
          <Badge tone="neutral">{vi.avatar.illustrative}</Badge>
        </div>
      </div>

      <div
        ref={stageRef}
        className="relative aspect-[4/3] w-full min-w-0 overflow-hidden rounded-card border border-line bg-gradient-to-b from-sand-soft to-canvas [&:fullscreen]:aspect-auto [&:fullscreen]:rounded-none [&:fullscreen]:border-0"
      >
        <p className="sr-only">{vi.avatar.sceneLabel}</p>
        {!unsupported && (
          <AvatarScene
            onExamineRegion={canExamine ? examine : undefined}
            findings={findings}
            hoverRegion={buttonHover}
            tooltipRef={tooltipRef}
            onHoverChange={setHover}
            onStatus={setStatus}
            onSpeakingChange={setSpeaking}
            onWheelPassThrough={onWheelPassThrough}
            onReady={onReady}
          />
        )}

        {/* Floating label; AvatarScene moves it next to the pointer. */}
        <div
          ref={tooltipRef}
          aria-hidden="true"
          className={`pointer-events-none absolute left-0 top-0 z-10 max-w-[14rem] rounded-control bg-ink px-2.5 py-1 text-xs font-semibold text-white shadow-lg transition-opacity duration-150 ${
            hover ? "opacity-100" : "opacity-0"
          }`}
        >
          {tooltipText}
        </div>

        {/* Camera presets + fullscreen. Native buttons: keyboard reachable, never color-only. */}
        {ready && (
          <div className="absolute inset-x-2 top-2 z-10 flex items-start justify-between gap-2">
            <div
              role="group"
              aria-label={vi.avatar.views.label}
              className="flex rounded-full bg-surface/90 p-1 shadow-sm backdrop-blur"
            >
              {VIEWS.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => chooseView(v)}
                  className={`h-8 rounded-full px-3 text-xs font-semibold transition-colors sm:text-sm ${FOCUS_RING} ${
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
              aria-label={fullscreen ? vi.avatar.exitFullscreen : vi.avatar.fullscreen}
              title={fullscreen ? vi.avatar.exitFullscreen : vi.avatar.fullscreen}
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface/90 text-ink shadow-sm backdrop-blur hover:bg-surface ${FOCUS_RING}`}
            >
              <FullscreenIcon exit={fullscreen} />
            </button>
          </div>
        )}

        {status.phase === "loading" && (
          <div role="status" className="absolute inset-0 grid place-items-center p-6 text-center">
            <div className="w-full max-w-56">
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

        {/* Bottom notes: lesion disclaimer, fallback model, wheel hint. */}
        <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 flex flex-col items-start gap-1.5">
          {anyLesion && (
            <span className="rounded-full bg-warning-soft/95 px-2.5 py-1 text-xs font-semibold text-warning shadow-sm">
              {vi.avatar.lesionNote}
            </span>
          )}
          {ready && status.source === "procedural" && (
            <span className="rounded-full bg-surface/90 px-2.5 py-1 text-xs text-ink-muted shadow-sm">
              {vi.avatar.fallbackModel}
            </span>
          )}
        </div>
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 bottom-10 z-10 flex justify-center transition-opacity duration-200 ${
            wheelHint ? "opacity-100" : "opacity-0"
          }`}
        >
          <span className="rounded-full bg-ink/85 px-3 py-1.5 text-xs font-semibold text-white">
            {vi.avatar.wheelHint}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm leading-relaxed text-ink-muted">
          {vi.exam.hintClick} {vi.avatar.hint}
        </p>
        {onExamineRegion && (
          <div role="group" aria-label={vi.a11y.examButtons} className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
            {EXAM_REGIONS.map((r) => {
              const done = r in findings;
              return (
                <button
                  key={r}
                  type="button"
                  disabled={busy}
                  onClick={() => examine(r)}
                  onPointerEnter={() => setButtonHover(r)}
                  onPointerLeave={() => setButtonHover(null)}
                  onFocus={() => setButtonHover(r)}
                  onBlur={() => setButtonHover(null)}
                  className={buttonClass({
                    variant: "secondary",
                    className: `justify-between text-left ${done ? "border-success/40 bg-success-soft/50" : ""}`,
                  })}
                >
                  <span className="truncate">{vi.exam.regions[r]}</span>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold ${
                      done ? "text-success" : "text-ink-muted"
                    }`}
                  >
                    {done && (
                      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
                        <path d="M2.5 6.5l2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                    {done ? vi.avatar.examined : vi.avatar.notExamined}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {onObserve && (
          <button type="button" onClick={onObserve} disabled={busy} className={buttonClass({ variant: "secondary" })}>
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
        )}
      </div>
    </Tile>
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
