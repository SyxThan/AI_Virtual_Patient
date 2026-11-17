"use client";

import { createContext, useContext } from "react";
import vi from "../../../messages/vi.json";
import { EXAM_REGIONS } from "@/components/avatar/avatarContract";
import { HFMD_CASE_ID } from "@/components/avatar/caseScene";
import { examModeOf, type CaseSummary } from "@/lib/caseSummary";
import { LABEL_TO_TARGET, labelTable, type ExamTarget } from "./examTurns";

/**
 * The exam regions of the session's case (AVP-150). The 3D HFMD scene has its
 * four colliders plus "observe the child"; another 3D case (AVP-160) and a 2D
 * case have the hotspots of their `catalog.exam_regions`. Workspace parts (exam record, result card, transcript)
 * read labels from here instead of assuming the HFMD regions.
 */
export type ExamRegionSet = {
  mode: "3d" | "2d";
  /** Body regions in shortcut order (keys 1..n). */
  ids: readonly ExamTarget[];
  /** Every target listed in the exam record ("observe_child" only in 3D). */
  targets: readonly ExamTarget[];
  /** Display label, sentence case. */
  labelOf: (target: ExamTarget) => string;
  /** Backend transcript label (lowercase) -> target. */
  labelToTarget: Readonly<Record<string, ExamTarget>>;
  /** 2D hotspot positions (0..1 of the image); empty in 3D. */
  points: readonly { id: string; label: string; x: number; y: number }[];
  /** 2D illustration (local public path) or null. */
  image: string | null;
};

const HFMD_LABELS = vi.exam.regions as Record<string, string>;

export const HFMD_REGIONS: ExamRegionSet = {
  mode: "3d",
  ids: EXAM_REGIONS,
  targets: [...EXAM_REGIONS, "observe_child"],
  labelOf: (t) => HFMD_LABELS[t] ?? t,
  labelToTarget: LABEL_TO_TARGET,
  points: [],
  image: null,
};

/** Region set of a 2D case; hotspots without a position are still listed (no point on the image). */
export function regionsFromCase(c: CaseSummary | null): ExamRegionSet {
  const regions = c?.catalog?.exam_regions ?? [];
  const labels = Object.fromEntries(regions.map((r) => [r.id, r.label]));
  const cover = c?.catalog?.cover;
  return {
    mode: "2d",
    ids: regions.map((r) => r.id),
    targets: regions.map((r) => r.id),
    labelOf: (t) => labels[t] ?? t,
    labelToTarget: labelTable(regions),
    points: regions.flatMap((r) =>
      r.x != null && r.y != null ? [{ id: r.id, label: r.label, x: r.x, y: r.y }] : [],
    ),
    image: cover && cover.startsWith("/") && !cover.startsWith("//") ? cover : null,
  };
}

/**
 * Region set of a 3D case other than HFMD (avp-case-scene/1, AVP-160): every
 * `catalog.exam_regions` entry, in catalog order (colliders first, then exam-bar
 * only entries such as vitals), labelled from the catalog. Which ones get a 3D
 * marker is decided by the scene (a collider with that id); no "observe".
 */
export function regionsFrom3dCase(c: CaseSummary): ExamRegionSet {
  const regions = c.catalog?.exam_regions ?? [];
  const labels = Object.fromEntries(regions.map((r) => [r.id, r.label]));
  const ids = regions.map((r) => r.id);
  return {
    mode: "3d",
    ids,
    targets: ids,
    labelOf: (t) => labels[t] ?? t,
    labelToTarget: labelTable(regions),
    points: [],
    image: null,
  };
}

/** Exam regions of a session's case: HFMD keeps its Slice 16 set, other 3D cases use the catalog. */
export function regionsOfCase(c: CaseSummary | null | undefined): ExamRegionSet {
  if (c && examModeOf(c) === "3d") return c.id === HFMD_CASE_ID ? HFMD_REGIONS : regionsFrom3dCase(c);
  return regionsFromCase(c ?? null);
}

export const ExamRegionsContext = createContext<ExamRegionSet>(HFMD_REGIONS);

export function useExamRegions(): ExamRegionSet {
  return useContext(ExamRegionsContext);
}
