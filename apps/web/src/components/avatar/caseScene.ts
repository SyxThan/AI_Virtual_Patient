/**
 * Pure (three.js-free) helpers for the `avp-case-scene/1` contract
 * (docs/specs/avatar-asset.md, "avp-case-scene/1"): any case other than HFMD
 * that ships `public/models/<caseId>.glb` + `<caseId>.scene.json`.
 * Kept free of `three`, React and JSON imports so it runs under `node --test`
 * (see caseScene.test.ts).
 *
 * Neither file carries findings, labels or clinical text: findings always come
 * from `POST /sessions/{id}/actions` (verbatim case `exam[]`, Hard Rule 1). The
 * overlays below are ILLUSTRATIVE procedural layers, shown only for a region
 * that was examined AND returned a documented finding.
 */

export const CASE_SCENE_CONTRACT = "avp-case-scene/1";
/** The Slice 16 case: keeps mother_child.glb, its 4 regions and "observe the child". */
export const HFMD_CASE_ID = "case-01-hfmd";

/** Shader array sizes (same as the reference demo). */
export const MAX_REG = 8;
export const MAX_BOX = 16;
export const MAX_OV = 12;

/** Overlay type -> shader code. */
export const OVERLAY_TYPES = { petechiae: 1, vesicles: 2, focus: 3, edge: 4, tint: 5 } as const;
export type OverlayType = keyof typeof OVERLAY_TYPES;

export type Vec3 = readonly [number, number, number];

/** Which 3D scene a stage shows. */
export type StageSource = { kind: "hfmd" } | { kind: "case"; caseId: string };

export function stageSourceOf(caseId: string): StageSource {
  return caseId === HFMD_CASE_ID ? { kind: "hfmd" } : { kind: "case", caseId };
}

export function sceneUrlFor(caseId: string): string {
  return `/models/${encodeURIComponent(caseId)}.scene.json`;
}

export type SceneOverlay = {
  type: OverlayType;
  landmark: string | null;
  p1: number;
  p2: number;
  axis: Vec3;
  normal: Vec3;
  dash: number;
  /** `#rrggbb`. */
  color: string;
  strength: number;
};

export type SceneCameraView = { pos: Vec3; target: Vec3 };

export type CaseSceneConfig = {
  caseId: string;
  /** Local public path of the .glb. */
  model: string;
  /** Who speaks, e.g. "Mẹ" (badge "<label> đang nói"). May be empty. */
  speakerLabel: string;
  draft: boolean;
  camera: { home: SceneCameraView | null; exam: SceneCameraView | null };
  breathing: { morph: string; rate: number; amplitude: number } | null;
  /** Region id -> illustrative overlays. */
  overlays: Readonly<Record<string, readonly SceneOverlay[]>>;
};

export class CaseSceneError extends Error {}

const ID_RE = /^[a-z0-9_]{1,64}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const MODEL_RE = /^\/models\/[A-Za-z0-9._-]+\.glb$/;
const LANDMARK_RE = /^[A-Za-z0-9_]{1,64}$/;

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function vec3(v: unknown): Vec3 | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  if (!v.every((x) => typeof x === "number" && Number.isFinite(x))) return null;
  return [v[0], v[1], v[2]];
}

function unit(v: Vec3 | null, fallback: Vec3): Vec3 {
  if (!v) return fallback;
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 1e-6 ? [v[0] / l, v[1] / l, v[2] / l] : fallback;
}

function cameraView(v: unknown): SceneCameraView | null {
  if (!isObj(v)) return null;
  const pos = vec3(v.pos);
  const target = vec3(v.target);
  return pos && target ? { pos, target } : null;
}

/** One overlay object from scene.json; null when its type is unknown. */
export function parseOverlay(raw: unknown): SceneOverlay | null {
  if (!isObj(raw) || typeof raw.type !== "string" || !(raw.type in OVERLAY_TYPES)) return null;
  const type = raw.type as OverlayType;
  const landmark = typeof raw.landmark === "string" && LANDMARK_RE.test(raw.landmark) ? raw.landmark : null;
  // focus/edge are drawn around a landmark: without one there is nothing to place.
  if ((type === "focus" || type === "edge") && !landmark) return null;
  return {
    type,
    landmark,
    p1: num(raw.p1, 0),
    p2: num(raw.p2, 0),
    axis: unit(vec3(raw.axis), [1, 0, 0]),
    normal: unit(vec3(raw.normal), [0, 1, 0]),
    dash: Math.max(0, num(raw.dash, 0)),
    color: typeof raw.color === "string" && COLOR_RE.test(raw.color) ? raw.color : "#c0303a",
    strength: Math.min(1, Math.max(0, num(raw.strength, 1))),
  };
}

/**
 * Validates `/models/<caseId>.scene.json`. Throws CaseSceneError when the file
 * is for another contract or another case, or names a non-local model.
 */
export function parseCaseScene(raw: unknown, caseId: string): CaseSceneConfig {
  if (!isObj(raw)) throw new CaseSceneError("scene.json is not an object");
  if (raw.contract !== CASE_SCENE_CONTRACT) throw new CaseSceneError(`unexpected contract ${String(raw.contract)}`);
  if (raw.caseId !== caseId) throw new CaseSceneError(`scene.json is for ${String(raw.caseId)}, not ${caseId}`);
  const model = typeof raw.model === "string" && MODEL_RE.test(raw.model) ? raw.model : null;
  if (!model) throw new CaseSceneError("scene.json model must be a local /models/*.glb path");
  const camera = isObj(raw.camera) ? raw.camera : {};
  let breathing: CaseSceneConfig["breathing"] = null;
  if (isObj(raw.breathing) && typeof raw.breathing.morph === "string" && raw.breathing.morph) {
    const rate = num(raw.breathing.rate, 0);
    // Only morph, rate and amplitude drive the animation; any note is never shown.
    if (rate > 0 && rate <= 120) {
      breathing = {
        morph: raw.breathing.morph,
        rate,
        amplitude: Math.min(1, Math.max(0, num(raw.breathing.amplitude, 1))),
      };
    }
  }
  const overlays: Record<string, SceneOverlay[]> = {};
  for (const r of Array.isArray(raw.regions) ? raw.regions : []) {
    if (!isObj(r) || typeof r.id !== "string" || !ID_RE.test(r.id)) continue;
    const list = Array.isArray(r.overlays) ? r.overlays : [];
    overlays[r.id] = list.map(parseOverlay).filter((o): o is SceneOverlay => o !== null);
  }
  return {
    caseId,
    model,
    speakerLabel: typeof raw.speakerLabel === "string" ? raw.speakerLabel.trim().slice(0, 40) : "",
    draft: raw.draft !== false,
    camera: { home: cameraView(camera.home), exam: cameraView(camera.exam) },
    breathing,
    overlays,
  };
}

/** Scene extras of the .glb (`gltf.scene.userData`): contract and case must match. */
export function checkSceneMeta(
  userData: Record<string, unknown> | undefined,
  caseId: string,
): { regions: string[]; skinMaterial: string } {
  if (userData?.contract !== CASE_SCENE_CONTRACT) {
    throw new CaseSceneError(`model contract ${String(userData?.contract)} is not ${CASE_SCENE_CONTRACT}`);
  }
  if (userData.caseId !== caseId) throw new CaseSceneError(`model is for ${String(userData.caseId)}, not ${caseId}`);
  const regions = Array.isArray(userData.regions)
    ? userData.regions.filter((r): r is string => typeof r === "string" && ID_RE.test(r))
    : [];
  const skinMaterial = typeof userData.skinMaterial === "string" && userData.skinMaterial ? userData.skinMaterial : "patient_skin";
  return { regions, skinMaterial };
}

export type ColliderExtras = {
  regionId: string;
  /** UV atlas cell 0..5 of the skin material, -1 when the region is on clothing. */
  atlasCell: number;
  /** World AABBs `[minX,minY,minZ,maxX,maxY,maxZ]`. */
  boxes: readonly (readonly [number, number, number, number, number, number])[];
  viewDir: Vec3 | null;
};

/** Collider extras of a node, or null when it is not a collider. */
export function colliderExtrasOf(name: string, userData: Record<string, unknown> | undefined): ColliderExtras | null {
  const fromExtras = typeof userData?.regionId === "string" ? userData.regionId : null;
  const fromName = name.startsWith("collider_") ? name.slice("collider_".length) : null;
  const regionId = fromExtras ?? fromName;
  if (!regionId || !ID_RE.test(regionId)) return null;
  const cell = Math.trunc(num(userData?.atlasCell, -1));
  const boxes: [number, number, number, number, number, number][] = [];
  for (const b of Array.isArray(userData?.boxes) ? userData.boxes : []) {
    if (Array.isArray(b) && b.length === 6 && b.every((x) => typeof x === "number" && Number.isFinite(x))) {
      boxes.push([b[0], b[1], b[2], b[3], b[4], b[5]]);
    }
  }
  const dir = vec3(userData?.viewDir);
  return {
    regionId,
    atlasCell: cell >= 0 && cell <= 5 ? cell : -1,
    boxes,
    viewDir: dir ? unit(dir, [0, 0, 1]) : null,
  };
}

/**
 * Region order for the shader and the markers: the scene's own `regions`
 * order, kept only for ids the case catalog offers and that have a collider.
 * At most MAX_REG.
 */
export function regionOrder(
  sceneRegions: readonly string[],
  allowed: readonly string[],
  withCollider: ReadonlySet<string>,
): string[] {
  const ok = new Set(allowed);
  const out: string[] = [];
  for (const id of [...sceneRegions, ...withCollider]) {
    if (out.length >= MAX_REG) break;
    if (ok.has(id) && withCollider.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

export type SkinBox = { min: Vec3; max: Vec3; region: number };
export type SkinOverlay = {
  code: number;
  region: number;
  p1: number;
  p2: number;
  centre: Vec3;
  strength: number;
  axis: Vec3;
  dash: number;
  normal: Vec3;
  color: string;
};
export type SkinLayout = { cells: number[]; boxes: SkinBox[]; overlays: SkinOverlay[] };

/** Shader layout (region cells, per-piece boxes, overlays) for the regions in `order`. */
export function skinLayout(
  order: readonly string[],
  extras: ReadonlyMap<string, ColliderExtras>,
  overlays: Readonly<Record<string, readonly SceneOverlay[]>>,
  landmarks: Readonly<Record<string, Vec3>>,
): SkinLayout {
  const cells = new Array<number>(MAX_REG).fill(-1);
  const boxes: SkinBox[] = [];
  const ovs: SkinOverlay[] = [];
  order.forEach((id, r) => {
    if (r >= MAX_REG) return;
    const ex = extras.get(id);
    cells[r] = ex?.atlasCell ?? -1;
    for (const b of ex?.boxes ?? []) {
      if (boxes.length >= MAX_BOX) break;
      boxes.push({ min: [b[0], b[1], b[2]], max: [b[3], b[4], b[5]], region: r });
    }
  });
  order.forEach((id, r) => {
    if (r >= MAX_REG) return;
    for (const ov of overlays[id] ?? []) {
      if (ovs.length >= MAX_OV) break;
      const centre = ov.landmark ? landmarks[ov.landmark] : undefined;
      if ((ov.type === "focus" || ov.type === "edge") && !centre) continue; // landmark missing in the model
      ovs.push({
        code: OVERLAY_TYPES[ov.type],
        region: r,
        p1: ov.p1,
        p2: ov.p2,
        centre: centre ?? [0, 0, 0],
        strength: ov.strength,
        axis: ov.axis,
        dash: ov.dash,
        normal: ov.normal,
        color: ov.color,
      });
    }
  });
  return { cells, boxes, overlays: ovs };
}

/**
 * Overlay targets per region slot: 1 only when the region was examined AND
 * the backend returned a documented finding (`true`); unknown never paints.
 */
export function revealTargets(order: readonly string[], findings: Readonly<Record<string, boolean | undefined>>): number[] {
  const out = new Array<number>(MAX_REG).fill(0);
  order.forEach((id, r) => {
    if (r < MAX_REG && findings[id] === true) out[r] = 1;
  });
  return out;
}

/** Breathing morph weight: inhale over the first 45% of each cycle, then rest. */
export function breathWeight(t: number, rate: number, amplitude: number): number {
  if (!(rate > 0)) return 0;
  const ph = (((t * rate) / 60) % 1 + 1) % 1;
  if (ph >= 0.45) return 0;
  return Math.pow(Math.sin(Math.PI * (ph / 0.45)), 2) * amplitude;
}

/** Max head turn around the speaker's rest face axis (contract: 35°). */
export const MAX_LOOK = (35 * Math.PI) / 180;

/**
 * Axis/angle turning the rest face direction `face` toward `to` (both world
 * space), clamped to `max`. Works for any posture (seated, lying down).
 */
export function lookAxisAngle(face: Vec3, to: Vec3, max = MAX_LOOK): { axis: Vec3; angle: number } {
  const f = unit(face, [0, 0, 1]);
  const d = unit(to, f);
  const dot = Math.min(1, Math.max(-1, f[0] * d[0] + f[1] * d[1] + f[2] * d[2]));
  const angle = Math.acos(dot);
  const c: Vec3 = [f[1] * d[2] - f[2] * d[1], f[2] * d[0] - f[0] * d[2], f[0] * d[1] - f[1] * d[0]];
  const l = Math.hypot(c[0], c[1], c[2]);
  if (angle < 1e-3 || l < 1e-6) return { axis: [0, 1, 0], angle: 0 };
  return { axis: [c[0] / l, c[1] / l, c[2] / l], angle: Math.min(angle, max) };
}

/** OrbitControls azimuth (from +Z toward +X) and polar (from +Y) of a view direction. */
export function sphericalOf(dir: Vec3): { azimuth: number; polar: number } {
  const [x, y, z] = unit(dir, [0, 0, 1]);
  return { azimuth: Math.atan2(x, z), polar: Math.acos(Math.min(1, Math.max(-1, y))) };
}

export type OrbitLimits = { minAzimuth: number; maxAzimuth: number; minPolar: number; maxPolar: number };
/** The Slice 16 limits: front-right only, never under the floor or through a wall. */
export const BASE_ORBIT: OrbitLimits = { minAzimuth: -0.35, maxAzimuth: 1.25, minPolar: Math.PI * 0.18, maxPolar: Math.PI * 0.52 };

/**
 * Widens the base limits just enough for the scene's own camera directions
 * (region `viewDir`, camera presets), so OrbitControls never snaps a flight
 * away from where the scene author pointed it. Never past ±80° or straight down.
 */
export function orbitLimitsFor(dirs: readonly Vec3[], base: OrbitLimits = BASE_ORBIT): OrbitLimits {
  const out = { ...base };
  const margin = 0.05;
  for (const d of dirs) {
    const { azimuth, polar } = sphericalOf(d);
    out.minAzimuth = Math.max(-1.4, Math.min(out.minAzimuth, azimuth - margin));
    out.maxAzimuth = Math.min(1.4, Math.max(out.maxAzimuth, azimuth + margin));
    out.minPolar = Math.max(0.12, Math.min(out.minPolar, polar - margin));
  }
  return out;
}

/** Persisted findings for any case (sessionStorage may hold anything): id -> documented. */
export function parseRegionFindings(raw: string | null): Record<string, boolean> {
  if (!raw) return {};
  try {
    const obj: unknown = JSON.parse(raw);
    if (!isObj(obj)) return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(obj)) if (ID_RE.test(k) && typeof v === "boolean") out[k] = v;
    return out;
  } catch {
    return {};
  }
}
