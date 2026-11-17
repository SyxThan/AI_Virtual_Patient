import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  CHILD_SKIN_MATERIAL,
  EXAM_REGIONS,
  MORPH,
  REGION_CELL,
  UNLABELLED_PARTS,
  blinkAt,
  headAngles,
  isExamRegion,
  jawFromLevel,
  lesionTargets,
  nextBlinkDelay,
  regionIdOf,
  type ExamRegionId,
} from "./avatarContract";
import { createSkinUniforms, patchChildSkin } from "./lesionSkin";
import { AvatarContractError, type FrameInput, type SceneRig } from "./sceneRig";

/**
 * Turns a parsed mother_child.glb into a SceneRig, enforcing the parts of
 * docs/specs/avatar-asset.md the code relies on. A file that breaks the
 * contract throws AvatarContractError and AvatarScene falls back to the
 * procedural rig (contract §9).
 */

const HOVER_EMISSIVE = new THREE.Color("#ffc75a");
const HOVER_INTENSITY = 0.3;
const PULSE_MATERIALS = new Set(["screen_line", "display"]);

type Lit = THREE.MeshStandardMaterial;

function isLit(m: THREE.Material): m is Lit {
  return (m as Lit).isMeshStandardMaterial === true;
}

export function prepareClinicRig(gltf: GLTF): SceneRig {
  const root = gltf.scene;
  const colliders: THREE.Object3D[] = [];
  const colliderSet = new Set<THREE.Object3D>();
  const byRegion = new Map<ExamRegionId, THREE.Object3D[]>();
  const pickables: THREE.Mesh[] = [];
  const morphMeshes: THREE.Mesh[] = [];
  const pulse: { mesh: THREE.Mesh; base: number }[] = [];
  const ownedMaterials = new Set<THREE.Material>();
  const baseEmissive = new Map<THREE.Mesh, { color: THREE.Color; intensity: number }>();
  const uniforms = createSkinUniforms();
  let skinMaterial: Lit | null = null;
  let headBone: THREE.Bone | null = null;
  let spineBone: THREE.Bone | null = null;

  root.traverse((o) => {
    if (o.parent && colliderSet.has(o.parent)) {
      colliderSet.add(o); // pieces of a multi-part collider
      o.visible = false;
      return;
    }
    const region = regionIdOf(o.name, o.userData);
    if (region) {
      // Hidden, but the raycaster still hits it (three.js ignores `visible` when raycasting).
      o.visible = false;
      o.userData.regionId = region;
      colliders.push(o);
      colliderSet.add(o);
      byRegion.set(region, [...(byRegion.get(region) ?? []), o]);
      return;
    }
    if ((o as THREE.Bone).isBone) {
      if (o.name === "head") headBone = o as THREE.Bone;
      if (o.name === "spine") spineBone = o as THREE.Bone;
    }
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const original = mesh.material;
    if (original.name === CHILD_SKIN_MATERIAL && isLit(original)) {
      // One patched clone shared by every child-skin mesh: one shader program, one set of uniforms.
      if (!skinMaterial) {
        skinMaterial = original.clone();
        patchChildSkin(skinMaterial, uniforms);
        ownedMaterials.add(skinMaterial);
      }
      mesh.material = skinMaterial;
    } else {
      // Per-mesh clone so hovering one part never lights up others that share its colour.
      const own = original.clone();
      ownedMaterials.add(own);
      mesh.material = own;
      if (isLit(own)) baseEmissive.set(mesh, { color: own.emissive.clone(), intensity: own.emissiveIntensity });
      if (isLit(own) && PULSE_MATERIALS.has(own.name)) pulse.push({ mesh, base: own.emissiveIntensity });
      if (own.name === "glass") mesh.castShadow = false;
    }
    // GLTFLoader makes one Mesh per primitive: every one of them gets the morphs (contract §3.1).
    if (mesh.morphTargetDictionary && MORPH.jaw in mesh.morphTargetDictionary) morphMeshes.push(mesh);
    pickables.push(mesh);
  });

  const head = headBone as THREE.Bone | null;
  const spine = spineBone as THREE.Bone | null;
  const missing: string[] = [];
  if (!head) missing.push("bone head");
  if (morphMeshes.length === 0) missing.push(`morph ${MORPH.jaw}`);
  if (!skinMaterial) missing.push(`material ${CHILD_SKIN_MATERIAL}`);
  for (const id of EXAM_REGIONS) if (!byRegion.has(id)) missing.push(`collider_${id}`);
  if (missing.length || !head) {
    disposeTree(root, ownedMaterials);
    throw new AvatarContractError(`mother_child.glb breaks the asset contract: ${missing.join(", ")}`);
  }

  root.updateMatrixWorld(true);
  const regionBoxes = new Map<string, THREE.Box3>();
  const childBox = new THREE.Box3();
  for (const id of EXAM_REGIONS) {
    const box = new THREE.Box3();
    for (const c of byRegion.get(id) ?? []) box.expandByObject(c);
    regionBoxes.set(id, box);
    childBox.union(box);
    uniforms.uBoxMin.value[REGION_CELL[id]].copy(box.min);
    uniforms.uBoxMax.value[REGION_CELL[id]].copy(box.max);
  }
  const sceneBox = new THREE.Box3().setFromObject(root);

  // ---- animation state ----
  const restHead = head.quaternion.clone();
  const headWorld = new THREE.Vector3();
  const parentQ = new THREE.Quaternion();
  const offsetQ = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, "YXZ");
  let yaw = 0;
  let pitch = 0;
  let nextBlink = 1.2;
  let blinkStart = -1;
  const reveal = new THREE.Vector4();
  const revealTarget = new THREE.Vector4();

  const setMorph = (name: string, value: number) => {
    for (const m of morphMeshes) {
      const i = m.morphTargetDictionary?.[name];
      if (i !== undefined && m.morphTargetInfluences) m.morphTargetInfluences[i] = value;
    }
  };

  let glowing: THREE.Object3D | null = null;
  const setGlow = (owner: THREE.Object3D, on: boolean) => {
    owner.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const base = baseEmissive.get(mesh);
      if (!base || !isLit(mesh.material as THREE.Material)) return;
      const mat = mesh.material as Lit;
      mat.emissive.copy(on ? HOVER_EMISSIVE : base.color);
      mat.emissiveIntensity = on ? HOVER_INTENSITY : base.intensity;
      mesh.userData.avpGlow = on;
    });
  };

  const update = ({ t, dt, mouth, lookAt, motion }: FrameInput) => {
    setMorph(MORPH.jaw, jawFromLevel(mouth));

    if (blinkStart < 0 && t > nextBlink) blinkStart = t;
    let blink = 0;
    if (blinkStart >= 0) {
      blink = blinkAt(t - blinkStart);
      if (t - blinkStart > 0.16) {
        blinkStart = -1;
        nextBlink = t + nextBlinkDelay();
      }
    }
    setMorph(MORPH.blinkL, blink);
    setMorph(MORPH.blinkR, blink);

    if (spine) spine.scale.setScalar(motion ? 1 + 0.008 * Math.sin(t * 1.6) : 1);

    // Head follows its target in world space, clamped, then converted to the bone's parent space.
    head.getWorldPosition(headWorld);
    const target = headAngles(headWorld, lookAt);
    const k = motion ? 1 - Math.exp(-dt * 4) : 1;
    yaw += (target.yaw - yaw) * k;
    pitch += (target.pitch - pitch) * k;
    // A small nod while talking reads as speech even without visemes.
    const nod = motion ? mouth * 0.05 * Math.sin(t * 9) : 0;
    offsetQ.setFromEuler(euler.set(pitch + nod, yaw, 0));
    if (head.parent) head.parent.getWorldQuaternion(parentQ);
    else parentQ.identity();
    head.quaternion.copy(parentQ).invert().multiply(offsetQ).multiply(parentQ).multiply(restHead);

    // Lesion reveal eases in over ~0.8 s (instant without motion).
    const step = motion ? Math.min(1, dt * 1.3) : 1;
    reveal.x += clampStep(revealTarget.x - reveal.x, step);
    reveal.y += clampStep(revealTarget.y - reveal.y, step);
    reveal.z += clampStep(revealTarget.z - reveal.z, step);
    reveal.w += clampStep(revealTarget.w - reveal.w, step);
    uniforms.uReveal.value.copy(reveal);
    uniforms.uTime.value = t;

    const glow = motion ? 0.78 + 0.22 * Math.sin(t * 5) : 1;
    for (const p of pulse) {
      if (p.mesh.userData.avpGlow) continue;
      (p.mesh.material as Lit).emissiveIntensity = p.base * glow;
    }
  };

  return {
    source: "model",
    root,
    regionIds: EXAM_REGIONS,
    colliders,
    pickables,
    labelOwner: (obj) => {
      let o: THREE.Object3D | null = obj;
      while (o && o !== root) {
        if (typeof o.userData.label === "string") return UNLABELLED_PARTS.has(o.name) ? null : o;
        o = o.parent;
      }
      return null;
    },
    regionBox: (id) => regionBoxes.get(id) ?? childBox,
    childBox,
    sceneBox,
    headPosition: (out) => head.getWorldPosition(out),
    setRegionHover: (id) => {
      uniforms.uHover.value = id && isExamRegion(id) ? REGION_CELL[id] : -1;
    },
    setPartHover: (owner) => {
      if (owner === glowing) return;
      if (glowing) setGlow(glowing, false);
      glowing = owner;
      if (owner) setGlow(owner, true);
    },
    setFindings: (findings) => {
      revealTarget.fromArray(lesionTargets(findings));
    },
    update,
    dispose: () => disposeTree(root, ownedMaterials),
  };
}

function clampStep(delta: number, step: number): number {
  return Math.sign(delta) * Math.min(Math.abs(delta), step);
}

function disposeTree(root: THREE.Object3D, materials: Set<THREE.Material>) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => m.dispose());
  });
  materials.forEach((m) => m.dispose());
}
