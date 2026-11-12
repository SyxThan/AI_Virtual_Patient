"use client";

import dynamic from "next/dynamic";
import vi from "../../../messages/vi.json";
import { EXAM_REGIONS, type ExamRegionId } from "./AnatomyColliders";
import type { AvatarSceneProps } from "./AvatarScene";
import { FOCUS_RING } from "@/components/ui/focus";

// Three.js needs window/WebGL: never render it on the server (avatar-3d skill).
const AvatarScene = dynamic<AvatarSceneProps>(() => import("./AvatarScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-gray-600" role="status">
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
  const btn = `rounded-md border border-gray-400 bg-white px-2.5 py-1.5 text-xs text-gray-900 hover:bg-gray-100 disabled:opacity-50 ${FOCUS_RING}`;
  return (
    <section
      aria-labelledby="avatar-title"
      className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-2">
        <h2 id="avatar-title" className="text-sm font-medium text-gray-900">
          {vi.avatar.title}
        </h2>
        <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-700">
          {vi.avatar.illustrative}
        </span>
      </div>
      <div className="h-64 w-full min-w-0 sm:h-72">
        <AvatarScene onExamineRegion={busy ? undefined : onExamineRegion} />
      </div>
      <div className="flex flex-col gap-2 px-3 pb-3">
        <p className="text-xs text-gray-700">
          {vi.exam.hintClick} {vi.avatar.hint}
        </p>
        {(onExamineRegion || onObserve) && (
          <div role="group" aria-label={vi.a11y.examButtons} className="flex flex-wrap gap-1.5">
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
                <span aria-hidden="true">👁 </span>
                {vi.exam.observe}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
