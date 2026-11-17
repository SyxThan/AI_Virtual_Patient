"use client";

import { useEffect, useState } from "react";
import { MODEL_URL } from "./avatarContract";
import { parseCaseScene, sceneUrlFor, type CaseSceneConfig, type StageSource } from "./caseScene";

/**
 * Fetch + cache of `/models/<caseId>.scene.json` (avp-case-scene/1), shared by
 * the setup preload and the workspace stage. No three.js import. A failure
 * clears the cache so a later mount retries.
 */

const cache = new Map<string, Promise<CaseSceneConfig>>();

export function loadCaseScene(caseId: string): Promise<CaseSceneConfig> {
  let p = cache.get(caseId);
  if (!p) {
    p = fetch(sceneUrlFor(caseId))
      .then((res) => {
        if (!res.ok) throw new Error(`scene.json HTTP ${res.status}`);
        return res.json() as Promise<unknown>;
      })
      .then((raw) => parseCaseScene(raw, caseId));
    p.catch(() => cache.delete(caseId));
    cache.set(caseId, p);
  }
  return p;
}

/** Model URL of a stage: mother_child.glb for HFMD, else the one its scene.json names. */
export async function modelUrlOf(source: StageSource): Promise<string> {
  return source.kind === "hfmd" ? MODEL_URL : (await loadCaseScene(source.caseId)).model;
}

export type CaseSceneLoad = { status: "loading" } | { status: "ok"; config: CaseSceneConfig } | { status: "failed" };

/** Scene config of a case stage; `null` caseId (HFMD) stays "loading" and is never used. */
export function useCaseScene(caseId: string | null): CaseSceneLoad {
  const [found, setFound] = useState<{ id: string; load: CaseSceneLoad } | null>(null);
  useEffect(() => {
    if (!caseId) return;
    let alive = true;
    loadCaseScene(caseId).then(
      (config) => alive && setFound({ id: caseId, load: { status: "ok", config } }),
      (err: unknown) => {
        console.warn("[avatar] case scene unavailable, using the exam buttons:", err);
        if (alive) setFound({ id: caseId, load: { status: "failed" } });
      },
    );
    return () => {
      alive = false;
    };
  }, [caseId]);
  return found && found.id === caseId ? found.load : { status: "loading" };
}
