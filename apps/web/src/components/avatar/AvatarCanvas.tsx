"use client";

import dynamic from "next/dynamic";
import vi from "../../../messages/vi.json";
import type { ExamRegionId } from "./AnatomyColliders";
import type { AvatarSceneProps } from "./AvatarScene";

// Three.js needs window/WebGL: never render it on the server (avatar-3d skill).
const AvatarScene = dynamic<AvatarSceneProps>(() => import("./AvatarScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-gray-500">
      {vi.avatar.loading}
    </div>
  ),
});

export default function AvatarCanvas({
  onExamineRegion,
  onObserve,
  busy = false,
}: {
  onExamineRegion?: (regionId: ExamRegionId) => void;
  onObserve?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
      <div className="flex items-center justify-between px-3 pt-2">
        <h2 className="text-sm font-medium">{vi.avatar.title}</h2>
        <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600">
          {vi.avatar.illustrative}
        </span>
      </div>
      <div className="h-72">
        <AvatarScene onExamineRegion={onExamineRegion} />
      </div>
      <div className="flex flex-col gap-2 px-3 pb-3">
        <p className="text-[11px] text-gray-500">
          {vi.exam.hintClick} {vi.avatar.hint}
        </p>
        {onObserve && (
          <button
            type="button"
            onClick={onObserve}
            disabled={busy}
            className="w-fit rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs disabled:opacity-50"
          >
            👁 {vi.exam.observe}
          </button>
        )}
      </div>
    </div>
  );
}
