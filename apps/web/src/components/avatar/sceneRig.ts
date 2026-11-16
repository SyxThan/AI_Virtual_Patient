import type * as THREE from "three";
import type { ExamRegionId, RegionFindings } from "./avatarContract";

/** Per-frame inputs a rig animates from. */
export type FrameInput = {
  t: number;
  dt: number;
  /** Patient voice level 0..1 (lip-sync). */
  mouth: number;
  /** World point the mother looks at (learner's camera, or the child during an exam). */
  lookAt: THREE.Vector3;
  /** false under prefers-reduced-motion: no breathing, instant head moves. */
  motion: boolean;
};

/**
 * What AvatarScene needs from a scene, whether it came from mother_child.glb
 * (clinicRig.ts) or the procedural fallback (AnatomyColliders.ts).
 */
export type SceneRig = {
  source: "model" | "procedural";
  root: THREE.Object3D;
  /** Hidden raycast targets; each carries `userData.regionId`. */
  colliders: THREE.Object3D[];
  /** Meshes that can show a hover label (owner found via `labelOwner`). */
  pickables: THREE.Object3D[];
  /** Nearest ancestor with a learner-facing label, or null. */
  labelOwner: (obj: THREE.Object3D) => THREE.Object3D | null;
  regionBox: (id: ExamRegionId) => THREE.Box3;
  /** Box around the child's exam regions (exam view framing). */
  childBox: THREE.Box3;
  /** Box around the whole set (overview framing). */
  sceneBox: THREE.Box3;
  /** Current world position of the mother's head. */
  headPosition: (out: THREE.Vector3) => THREE.Vector3;
  setRegionHover: (id: ExamRegionId | null) => void;
  setPartHover: (owner: THREE.Object3D | null) => void;
  setFindings: (findings: RegionFindings) => void;
  update: (frame: FrameInput) => void;
  dispose: () => void;
};

/** Thrown when a model does not satisfy docs/specs/avatar-asset.md; triggers the fallback. */
export class AvatarContractError extends Error {}
