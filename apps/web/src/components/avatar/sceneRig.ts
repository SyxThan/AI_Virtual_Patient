import type * as THREE from "three";
import type { RegionFindings, ViewId } from "./avatarContract";
import type { OrbitLimits } from "./caseScene";

/** Per-frame inputs a rig animates from. */
export type FrameInput = {
  t: number;
  dt: number;
  /** Patient voice level 0..1 (lip-sync). */
  mouth: number;
  /** World point the speaker looks at (learner's camera, or the patient during an exam). */
  lookAt: THREE.Vector3;
  /** false under prefers-reduced-motion: no breathing, instant head moves. */
  motion: boolean;
};

/**
 * What AvatarScene needs from a scene, whether it came from mother_child.glb
 * (clinicRig.ts), an avp-case-scene/1 model (caseRig.ts) or the procedural
 * HFMD fallback (AnatomyColliders.ts). Region ids are the case's exam hotspot
 * ids (HFMD: the 4 Slice 16 regions).
 */
export type SceneRig = {
  source: "model" | "procedural";
  root: THREE.Object3D;
  /** Region ids that have a collider in this scene, in marker order. */
  regionIds: readonly string[];
  /** Hidden raycast targets; each carries `userData.regionId`. */
  colliders: THREE.Object3D[];
  /** Meshes that can show a hover label (owner found via `labelOwner`). */
  pickables: THREE.Object3D[];
  /** Nearest ancestor with a learner-facing label, or null. */
  labelOwner: (obj: THREE.Object3D) => THREE.Object3D | null;
  regionBox: (id: string) => THREE.Box3;
  /** Box around the patient's exam regions (exam view framing). */
  childBox: THREE.Box3;
  /** Box around the whole set (overview framing). */
  sceneBox: THREE.Box3;
  /** Current world position of the speaker's head. */
  headPosition: (out: THREE.Vector3) => THREE.Vector3;
  /** Camera presets authored with the scene (avp-case-scene/1); computed from boxes when absent. */
  views?: Partial<Record<ViewId, { position: THREE.Vector3; target: THREE.Vector3 }>>;
  /** Camera direction (unit, from target) authored for a region; null = default. */
  regionViewDir?: (id: string) => THREE.Vector3 | null;
  /** OrbitControls limits; Slice 16 limits when absent. */
  orbit?: OrbitLimits;
  setRegionHover: (id: string | null) => void;
  setPartHover: (owner: THREE.Object3D | null) => void;
  setFindings: (findings: RegionFindings) => void;
  update: (frame: FrameInput) => void;
  dispose: () => void;
};

/** Thrown when a model does not satisfy docs/specs/avatar-asset.md; triggers the fallback. */
export class AvatarContractError extends Error {}
