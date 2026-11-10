"use client";

import dynamic from "next/dynamic";
import vi from "../../../messages/vi.json";

// Three.js needs window/WebGL: never render it on the server (avatar-3d skill).
const AvatarScene = dynamic(() => import("./AvatarScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-gray-500">
      {vi.avatar.loading}
    </div>
  ),
});

export default function AvatarCanvas() {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
      <div className="flex items-center justify-between px-3 pt-2">
        <h2 className="text-sm font-medium">{vi.avatar.title}</h2>
        <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600">
          {vi.avatar.illustrative}
        </span>
      </div>
      <div className="h-72">
        <AvatarScene />
      </div>
      <p className="px-3 pb-2 text-[11px] text-gray-500">{vi.avatar.hint}</p>
    </div>
  );
}
