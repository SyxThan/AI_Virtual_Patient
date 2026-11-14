"use client";

import dynamic from "next/dynamic";
import vi from "../../../messages/vi.json";
import { EXAM_REGIONS, type ExamRegionId } from "./AnatomyColliders";
import type { AvatarSceneProps } from "./AvatarScene";
import Badge from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import Tile from "@/components/ui/Tile";

// Three.js needs window/WebGL: never render it on the server (avatar-3d skill).
const AvatarScene = dynamic<AvatarSceneProps>(() => import("./AvatarScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-ink-muted" role="status">
      {vi.avatar.loading}
    </div>
  ),
});

/**
 * Avatar panel. Regions can be examined by clicking the 3D model (raycasting)
 * or with the plain buttons below it, so the exam also works by keyboard and
 * with assistive technology (TASK-S12-04). `busy` blocks both paths.
 */
export default function AvatarCanvas({
  onExamineRegion,
  onObserve,
  busy = false,
}: {
  onExamineRegion?: (regionId: ExamRegionId) => void;
  onObserve?: () => void;
  busy?: boolean;
}) {
  const btn = buttonClass({ variant: "secondary" });
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
        <Badge tone="neutral">{vi.avatar.illustrative}</Badge>
      </div>
      {/* Frame only: the 3D scene itself is rebuilt separately. */}
      <div className="h-64 w-full min-w-0 overflow-hidden rounded-card border border-line bg-canvas sm:h-72">
        <AvatarScene onExamineRegion={busy ? undefined : onExamineRegion} />
      </div>
      <div className="flex flex-col gap-3">
        <p className="text-sm leading-relaxed text-ink-muted">
          {vi.exam.hintClick} {vi.avatar.hint}
        </p>
        {(onExamineRegion || onObserve) && (
          <div role="group" aria-label={vi.a11y.examButtons} className="flex flex-wrap gap-2">
            {onExamineRegion &&
              EXAM_REGIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={busy}
                  onClick={() => onExamineRegion(r)}
                  className={btn}
                >
                  {vi.exam.regions[r]}
                </button>
              ))}
            {onObserve && (
              <button type="button" onClick={onObserve} disabled={busy} className={btn}>
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
        )}
      </div>
    </Tile>
  );
}
