"use client";

import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import vi from "../../../messages/vi.json";
import { patientLipSync } from "@/components/avatar/LipSyncController";
import { FOCUS_RING } from "@/components/ui/focus";
import { useExamRegions } from "@/components/workspace/examRegions";
import type { ExamTarget } from "@/components/workspace/examTurns";
import { fmt } from "@/lib/sessionAuth";
import { STAGE_TRANSITION_NAME } from "@/lib/stageTransition";

/** Same speaking thresholds as the 3D scene (AvatarScene). */
const SPEAK_ON = 0.09;
const SPEAK_OFF = 0.04;

export type Stage2DController = { focusRegion: (id: ExamTarget) => void };

/**
 * Exam stage for a case without a 3D model (AVP-150 / TASK-S20-05): the case's
 * illustration with its `catalog.exam_regions` hotspots, placed by percentage so
 * they stay on the same body part at any size. A hotspot (or the chip bar below,
 * or keys 1..n) calls the same `POST /sessions/{id}/actions` as the 3D scene, so
 * findings come verbatim from the case's `exam[]` and the Evaluator sees one kind
 * of exam record. Hotspots without a position are offered in the chip bar only.
 */
export default function Exam2DStage({
  controllerRef,
  examined,
  busy,
  onExamineRegion,
  onSpeakingChange,
  card,
  caption,
  voice,
}: {
  controllerRef?: Ref<Stage2DController | null>;
  examined: ReadonlySet<ExamTarget>;
  busy: boolean;
  onExamineRegion: (id: ExamTarget) => void;
  onSpeakingChange?: (speaking: boolean) => void;
  card?: ReactNode;
  caption?: ReactNode;
  voice?: ReactNode;
}) {
  const regions = useExamRegions();
  const pointRefs = useRef(new Map<string, HTMLButtonElement>());
  const chipRefs = useRef(new Map<string, HTMLButtonElement>());
  const [speaking, setSpeaking] = useState(false);
  // Width / height of the illustration; portrait until the image reports its size.
  const [ratio, setRatio] = useState(3 / 4);

  useImperativeHandle(controllerRef, () => ({
    focusRegion: (id) => (pointRefs.current.get(id) ?? chipRefs.current.get(id))?.focus(),
  }));

  // No avatar here, but the patient's voice still drives the "replying" state.
  // The loop pauses while the tab is hidden (requestAnimationFrame does not run).
  const onSpeakingRef = useRef(onSpeakingChange);
  useEffect(() => {
    onSpeakingRef.current = onSpeakingChange;
  });
  useEffect(() => {
    let raf = 0;
    let on = false;
    const tick = () => {
      const level = patientLipSync.level();
      if (!on && level > SPEAK_ON) on = true;
      else if (on && level < SPEAK_OFF) on = false;
      else {
        raf = requestAnimationFrame(tick);
        return;
      }
      setSpeaking(on);
      onSpeakingRef.current?.(on);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const examine = (id: ExamTarget) => {
    if (!busy) onExamineRegion(id);
  };

  return (
    <div
      aria-label={vi.cockpit.stageLabel}
      role="region"
      className="relative flex min-h-0 min-w-0 flex-col md:h-full md:overflow-hidden md:rounded-tile md:ring-1 md:ring-line/70"
    >
      {/* Shares `patient-stage` with the setup cover (lib/stageTransition.ts). */}
      <div
        data-stage-transition
        style={{ viewTransitionName: STAGE_TRANSITION_NAME }}
        className="relative h-[45dvh] shrink-0 overflow-hidden rounded-tile bg-gradient-to-b from-sand-soft to-canvas ring-1 ring-line/70 md:h-full md:rounded-none md:ring-0"
      >
        {/* Size container: the figure is the largest box of the image's ratio that fits. */}
        <div className="absolute inset-3 grid place-items-center [container-type:size] md:bottom-48">
        {regions.image ? (
          // The figure has exactly the image's aspect ratio, so % positions land on the same spot at any size.
          <figure
            className="relative"
            aria-label={vi.exam2d.stageLabel}
            style={{ aspectRatio: ratio, width: `min(100cqw, calc(100cqh * ${ratio}))` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- local illustration (often SVG), sized by its frame */}
            <img
              src={regions.image}
              alt=""
              draggable={false}
              onLoad={(e) => {
                const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                if (w > 0 && h > 0) setRatio(w / h);
              }}
              className="absolute inset-0 h-full w-full select-none rounded-card"
            />
            {regions.points.map((p, i) => {
              const done = examined.has(p.id);
              return (
                <button
                  key={p.id}
                  ref={(el) => {
                    if (el) pointRefs.current.set(p.id, el);
                    else pointRefs.current.delete(p.id);
                  }}
                  type="button"
                  data-opens-exam=""
                  disabled={busy}
                  onClick={() => examine(p.id)}
                  aria-label={`${fmt(vi.exam2d.pointLabel, { region: p.label.toLowerCase() })}${done ? ` (${vi.exam2d.examined})` : ""}`}
                  aria-keyshortcuts={i < 9 ? String(regions.ids.indexOf(p.id) + 1) : undefined}
                  title={p.label}
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                  className={`group absolute grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full disabled:cursor-not-allowed ${FOCUS_RING}`}
                >
                  <span
                    aria-hidden="true"
                    className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold shadow-md ring-2 transition-transform duration-150 group-hover:scale-110 motion-reduce:transition-none ${
                      done ? "bg-success text-white ring-white" : "bg-primary text-white ring-white"
                    }`}
                  >
                    {done ? "✓" : regions.ids.indexOf(p.id) + 1}
                  </span>
                </button>
              );
            })}
          </figure>
        ) : (
          <p className="max-w-xs text-center text-sm leading-relaxed text-ink-muted">{vi.exam2d.noImage}</p>
        )}
        </div>

        <span
          aria-hidden="true"
          className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-white shadow-lg transition-opacity duration-[var(--dur-base)] ${
            speaking ? "opacity-100" : "opacity-0"
          }`}
        >
          {vi.avatar.speaking}
        </span>

        {card && <div className="absolute inset-x-3 bottom-3 z-20 md:inset-x-auto md:right-3 md:top-3 md:bottom-auto md:w-80">{card}</div>}
      </div>

      {/* Dock: >= md floats over the bottom of the stage, < md sits below it. */}
      <div className="pointer-events-none z-20 flex flex-col gap-2 pt-3 md:absolute md:inset-x-0 md:bottom-0 md:bg-gradient-to-t md:from-canvas/90 md:via-canvas/50 md:to-transparent md:px-4 md:pb-4 md:pt-10">
        <p className="pointer-events-auto text-xs leading-snug text-ink-muted">
          <span className="font-semibold text-ink">{vi.avatar.illustrative}</span> · {vi.exam2d.hint}
        </p>

        {caption}

        <div
          role="group"
          aria-label={vi.exam2d.listLabel}
          className="pointer-events-auto -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 md:flex-wrap md:justify-center md:overflow-visible"
        >
          {regions.ids.map((id, i) => {
            const done = examined.has(id);
            return (
              <button
                key={id}
                ref={(el) => {
                  if (el) chipRefs.current.set(id, el);
                  else chipRefs.current.delete(id);
                }}
                type="button"
                data-opens-exam=""
                disabled={busy}
                aria-keyshortcuts={i < 9 ? String(i + 1) : undefined}
                onClick={() => examine(id)}
                className={`inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-full px-3.5 text-sm font-semibold shadow-sm ring-1 backdrop-blur transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING} ${
                  done ? "bg-success-soft/95 text-success ring-success/30" : "bg-surface/95 text-ink ring-line-strong/60 hover:bg-surface"
                }`}
              >
                <span className="grid h-5 w-5 place-items-center rounded-full bg-primary/10 text-xs" aria-hidden="true">
                  {done ? "✓" : i + 1}
                </span>
                {regions.labelOf(id)}
                <span className="sr-only">: {done ? vi.avatar.examined : vi.avatar.notExamined}</span>
              </button>
            );
          })}
        </div>

        {voice}
      </div>
    </div>
  );
}
