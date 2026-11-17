/**
 * Pure (three.js-free) constants and helpers for the clinic avatar, mirroring
 * docs/specs/avatar-asset.md. Kept free of `three` and React so it runs under
 * `node --test` without a bundler (see avatarContract.test.ts).
 *
 * The model carries NO clinical information: findings always come from the
 * case JSON through the backend (Hard Rule 1).
 */

/** UI exam regions. The backend maps them onto the case's `exam[].region`. */
export const EXAM_REGIONS = ["palm_hands", "feet", "mouth_throat", "buttocks_knees"] as const;
export type ExamRegionId = (typeof EXAM_REGIONS)[number];

/** Region -> cell index in the `child_skin` UV atlas (contract §5) and shader slot. */
export const REGION_CELL: Record<ExamRegionId, number> = {
  palm_hands: 0,
  feet: 1,
  mouth_throat: 2,
  buttocks_knees: 3,
};

export const MODEL_URL = "/models/mother_child.glb";
export const DRACO_DECODER_PATH = "/draco/";

/** Morph targets on `Mother_Head` (contract §3.1). Exact case. */
export const MORPH = { jaw: "jawOpen", blinkL: "eyeBlink_L", blinkR: "eyeBlink_R" } as const;
export const CHILD_SKIN_MATERIAL = "child_skin";
export const COLLIDER_PREFIX = "collider_";

/** Large structural meshes that get no hover label (noise, not "things"). */
export const UNLABELLED_PARTS = new Set(["Floor", "Wall_Back", "Wall_Left", "Room"]);

/** Head turn limits in radians (contract §3.2: yaw ±40°, pitch −17°…+20°). */
export const HEAD_LIMITS = { yaw: (40 * Math.PI) / 180, pitchUp: (-17 * Math.PI) / 180, pitchDown: (20 * Math.PI) / 180 };

export function isExamRegion(value: unknown): value is ExamRegionId {
  return typeof value === "string" && (EXAM_REGIONS as readonly string[]).includes(value);
}

/**
 * Region id of a collider node: `extras.regionId` first, then the node name
 * suffix (contract §4). Returns null for anything that is not a valid collider.
 */
export function regionIdOf(name: string, userData: Record<string, unknown> | undefined): ExamRegionId | null {
  const fromExtras = userData?.regionId;
  if (isExamRegion(fromExtras)) return fromExtras;
  if (!name.startsWith(COLLIDER_PREFIX)) return null;
  const suffix = name.slice(COLLIDER_PREFIX.length);
  return isExamRegion(suffix) ? suffix : null;
}

/**
 * Yaw/pitch (radians) for a head at `from` looking at `to`, character facing +Z,
 * clamped to HEAD_LIMITS. Positive pitch = looking down.
 */
export function headAngles(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
): { yaw: number; pitch: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const yaw = clamp(Math.atan2(dx, dz), -HEAD_LIMITS.yaw, HEAD_LIMITS.yaw);
  const pitch = clamp(-Math.atan2(dy, Math.hypot(dx, dz)), HEAD_LIMITS.pitchUp, HEAD_LIMITS.pitchDown);
  return { yaw, pitch };
}

/** Blink envelope: 0 (open) -> 1 (closed) -> 0 over `duration` seconds. */
export function blinkAt(elapsed: number, duration = 0.16): number {
  if (elapsed < 0 || elapsed > duration) return 0;
  return Math.sin((elapsed / duration) * Math.PI);
}

/** Seconds until the next blink: 2.5–5.5 s, with an occasional quick double blink. */
export function nextBlinkDelay(random: () => number = Math.random): number {
  const r = random();
  return r < 0.12 ? 0.25 : 2.5 + r * 3;
}

/** Mouth-open level (0..1) -> `jawOpen` influence; capped so the jaw never looks dislocated. */
export function jawFromLevel(level: number): number {
  return clamp(level, 0, 1) * 0.85;
}

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Exam findings shown on the avatar: region -> `documented` from the backend.
 * Only `true` (the case documents a finding there) reveals the illustrative
 * lesion layer; `false` (unknown) never paints anything (Hard Rule 1).
 */
export type RegionFindings = Partial<Record<ExamRegionId, boolean>>;

/** Lesion-layer targets per atlas cell (0 or 1) for a findings map. */
export function lesionTargets(findings: RegionFindings): [number, number, number, number] {
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (const id of EXAM_REGIONS) if (findings[id] === true) out[REGION_CELL[id]] = 1;
  return out;
}

/** Parse persisted findings defensively (sessionStorage may hold anything). */
export function parseFindings(raw: string | null): RegionFindings {
  if (!raw) return {};
  try {
    const obj: unknown = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return {};
    const out: RegionFindings = {};
    for (const [k, v] of Object.entries(obj)) if (isExamRegion(k) && typeof v === "boolean") out[k] = v;
    return out;
  } catch {
    return {};
  }
}

/** Camera presets the learner can switch between. */
export const VIEWS = ["overview", "talk", "exam"] as const;
export type ViewId = (typeof VIEWS)[number];

/**
 * Distance multiplier so a framing built for a 16:10 stage still fits a
 * narrower one (phones, the 5/12 workspace column).
 */
export function aspectDistanceFactor(aspect: number, designAspect = 1.6): number {
  if (!(aspect > 0)) return 1;
  return aspect >= designAspect ? 1 : Math.pow(designAspect / aspect, 0.85);
}
