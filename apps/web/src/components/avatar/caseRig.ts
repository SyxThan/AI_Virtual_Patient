import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MORPH, UNLABELLED_PARTS, blinkAt, jawFromLevel, nextBlinkDelay } from "./avatarContract";
import {
  breathWeight,
  checkSceneMeta,
  colliderExtrasOf,
  lookAxisAngle,
  orbitLimitsFor,
  regionOrder,
  revealTargets,
  skinLayout,
  vec3,
  type CaseSceneConfig,
  type ColliderExtras,
  type Vec3,
} from "./caseScene";
import { createCaseSkinUniforms, patchCaseSkin } from "./caseSkin";
import { AvatarContractError, type FrameInput, type SceneRig } from "./sceneRig";

/**
 * Turns a parsed avp-case-scene/1 model into a SceneRig (docs/specs/avatar-asset.md,
 * "avp-case-scene/1"). Relies only on the contract: scene extras (contract,
 * caseId, regions, skinMaterial), the speaker node (`extras.role = "speaker"`,
 * `faceForward`) with its `head` bone, `jawOpen`/`eyeBlink_*` morphs, collider
 * extras (`regionId`, `atlasCell`, `boxes`, `viewDir`) and `landmark_*` empties.
 * Anything else that is off throws AvatarContractError: the stage then offers
 * the exam buttons only (no procedural stand-in for these cases).
 *
 * `allowed` = the case catalog's exam region ids: a collider the catalog does not
 * offer is ignored, so every 3D click maps onto a backend hotspot.
 */

const HOVER_EMISSIVE = new THREE.Color("#ffc75a");
const HOVER_INTENSITY = 0.3;
const GHOST_COLOR = new THREE.Color("#ffc75a");
const PULSE_MATERIALS = new Set(["screen_line", "display"]);

type Lit = THREE.MeshStandardMaterial;

function isLit(m: THREE.Material): m is Lit {
  return (m as Lit).isMeshStandardMaterial === true;
}

const v3 = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2]);

export function prepareCaseRig(gltf: GLTF, config: CaseSceneConfig, allowed: readonly string[]): SceneRig {
  const root = gltf.scene;
  const ownedMaterials = new Set<THREE.Material>();
  let meta: ReturnType<typeof checkSceneMeta>;
  try {
    meta = checkSceneMeta(root.userData, config.caseId);
  } catch (err) {
    disposeTree(root, ownedMaterials);
    throw new AvatarContractError((err as Error).message);
  }

  const colliderNodes = new Map<string, THREE.Object3D[]>();
  const extras = new Map<string, ColliderExtras>();
  const colliderSet = new Set<THREE.Object3D>();
  const pickables: THREE.Mesh[] = [];
  const morphMeshes: THREE.Mesh[] = [];
  const breathMeshes: THREE.Mesh[] = [];
  const pulse: { mesh: THREE.Mesh; base: number }[] = [];
  const baseEmissive = new Map<THREE.Mesh, { color: THREE.Color; intensity: number }>();
  const landmarks: Record<string, Vec3> = {};
  const skinMeshes: THREE.Mesh[] = [];
  let speaker: THREE.Object3D | null = null;

  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (o.parent && colliderSet.has(o.parent)) {
      colliderSet.add(o); // pieces of a multi-part collider
      o.visible = false;
      return;
    }
    const ex = o.name.startsWith("collider_") || o.userData.collider === true ? colliderExtrasOf(o.name, o.userData) : null;
    if (ex) {
      // Hidden, but the raycaster still hits it (three.js ignores `visible` when raycasting).
      o.visible = false;
      o.userData.regionId = ex.regionId;
      colliderSet.add(o);
      colliderNodes.set(ex.regionId, [...(colliderNodes.get(ex.regionId) ?? []), o]);
      const prev = extras.get(ex.regionId);
      extras.set(ex.regionId, prev ? { ...prev, boxes: [...prev.boxes, ...ex.boxes] } : ex);
      return;
    }
    if (o.userData.role === "speaker" && !speaker) speaker = o;
    if (typeof o.userData.landmark === "string") {
      const p = o.getWorldPosition(new THREE.Vector3());
      landmarks[o.userData.landmark] = [p.x, p.y, p.z];
    }
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const original = mesh.material;
    if (original.name === meta.skinMaterial && isLit(original)) {
      skinMeshes.push(mesh);
      ownedMaterials.add(original);
    } else {
      // Per-mesh clone so hovering one part never lights up others that share its colour.
      const own = original.clone();
      ownedMaterials.add(own);
      mesh.material = own;
      if (isLit(own)) baseEmissive.set(mesh, { color: own.emissive.clone(), intensity: own.emissiveIntensity });
      if (isLit(own) && PULSE_MATERIALS.has(own.name)) pulse.push({ mesh, base: own.emissiveIntensity });
      if (own.name === "glass") mesh.castShadow = false;
    }
    // GLTFLoader makes one Mesh per primitive: every one of them gets the morphs.
    const dict = mesh.morphTargetDictionary;
    if (dict && MORPH.jaw in dict) morphMeshes.push(mesh);
    if (dict && config.breathing && config.breathing.morph in dict) breathMeshes.push(mesh);
    pickables.push(mesh);
  });

  const speakerNode = speaker as THREE.Object3D | null;
  let head: THREE.Bone | null = null;
  let spine: THREE.Bone | null = null;
  const findBones = (from: THREE.Object3D) =>
    from.traverse((o) => {
      if (!(o as THREE.Bone).isBone) return;
      if (o.name === "head" && !head) head = o as THREE.Bone;
      if (o.name === "spine" && !spine) spine = o as THREE.Bone;
    });
  if (speakerNode) findBones(speakerNode);
  if (!head) findBones(root);
  const headBone = head as THREE.Bone | null;
  const spineBone = spine as THREE.Bone | null;

  const order = regionOrder(meta.regions, allowed, new Set(colliderNodes.keys()));
  const missing: string[] = [];
  if (!speakerNode) missing.push("speaker (extras.role)");
  if (!headBone) missing.push("bone head");
  if (morphMeshes.length === 0) missing.push(`morph ${MORPH.jaw}`);
  if (skinMeshes.length === 0) missing.push(`material ${meta.skinMaterial}`);
  if (order.length === 0) missing.push("a collider for a catalog region");
  if (missing.length || !headBone || !speakerNode) {
    disposeTree(root, ownedMaterials);
    throw new AvatarContractError(`${config.caseId}.glb breaks the asset contract: ${missing.join(", ")}`);
  }

  // Colliders of regions the case does not offer stay out of picking entirely.
  const colliders: THREE.Object3D[] = [];
  const ghostMaterials = new Map<THREE.Object3D, THREE.MeshBasicMaterial>();
  for (const id of order) {
    for (const c of colliderNodes.get(id) ?? []) {
      colliders.push(c);
      const ghost = new THREE.MeshBasicMaterial({ color: GHOST_COLOR, transparent: true, opacity: 0.16, depthWrite: false });
      ownedMaterials.add(ghost);
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          ownedMaterials.add(m.material as THREE.Material);
          m.material = ghost;
          m.castShadow = false;
          m.receiveShadow = false;
        }
      });
      ghostMaterials.set(c, ghost);
    }
  }

  const layout = skinLayout(order, extras, config.overlays, landmarks);
  const uniforms = createCaseSkinUniforms(layout);
  const firstSkin = skinMeshes[0].material as Lit;
  const skinMaterial = firstSkin.clone();
  patchCaseSkin(skinMaterial, uniforms);
  ownedMaterials.add(skinMaterial);
  for (const m of skinMeshes) m.material = skinMaterial; // one program, one set of uniforms

  root.updateMatrixWorld(true);
  const regionBoxes = new Map<string, THREE.Box3>();
  const childBox = new THREE.Box3();
  for (const id of order) {
    const box = new THREE.Box3();
    for (const c of colliderNodes.get(id) ?? []) box.expandByObject(c);
    regionBoxes.set(id, box);
    childBox.union(box);
  }
  const sceneBox = new THREE.Box3().setFromObject(root);
  const viewDirs = new Map<string, THREE.Vector3>();
  for (const id of order) {
    const d = extras.get(id)?.viewDir;
    if (d) viewDirs.set(id, v3(d));
  }

  // ---- camera presets: authored home/exam, a talk view built from the speaker's face ----
  const faceForward = v3(vec3(speakerNode.userData.faceForward) ?? [0, 0, 1]).normalize();
  const headWorld = headBone.getWorldPosition(new THREE.Vector3());
  const views: NonNullable<SceneRig["views"]> = {};
  if (config.camera.home) views.overview = { position: v3(config.camera.home.pos), target: v3(config.camera.home.target) };
  if (config.camera.exam) views.exam = { position: v3(config.camera.exam.pos), target: v3(config.camera.exam.target) };
  {
    // In front of the face, from the learner's side (+Z); works for a seated or a lying speaker.
    const dir = faceForward.clone().add(new THREE.Vector3(0.32, 0.1, 1).normalize());
    if (dir.z < 0.35) dir.z = 0.35;
    dir.normalize();
    const target = headWorld.clone().add(new THREE.Vector3(0, -0.12, 0));
    views.talk = { target, position: target.clone().addScaledVector(dir, 1.7) };
  }
  const orbitDirs: Vec3[] = [...viewDirs.values()].map((d) => [d.x, d.y, d.z] as const);
  for (const v of Object.values(views)) {
    const d = v.position.clone().sub(v.target);
    orbitDirs.push([d.x, d.y, d.z]);
  }

  // ---- animation state ----
  const restHeadWorld = headBone.getWorldQuaternion(new THREE.Quaternion());
  const headPos = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const lookQ = new THREE.Quaternion();
  const goalQ = new THREE.Quaternion();
  const parentQ = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  let nextBlink = 1.2;
  let blinkStart = -1;
  const reveal = new Array<number>(order.length).fill(0);
  let revealTarget = new Array<number>(order.length).fill(0);

  const setMorph = (meshes: THREE.Mesh[], name: string, value: number) => {
    for (const m of meshes) {
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
    setMorph(morphMeshes, MORPH.jaw, jawFromLevel(mouth));

    if (blinkStart < 0 && t > nextBlink) blinkStart = t;
    let blink = 0;
    if (blinkStart >= 0) {
      blink = blinkAt(t - blinkStart);
      if (t - blinkStart > 0.16) {
        blinkStart = -1;
        nextBlink = t + nextBlinkDelay();
      }
    }
    setMorph(morphMeshes, MORPH.blinkL, blink);
    setMorph(morphMeshes, MORPH.blinkR, blink);

    if (spineBone) spineBone.scale.setScalar(motion ? 1 + 0.008 * Math.sin(t * 1.6) : 1);
    if (config.breathing && breathMeshes.length) {
      const b = config.breathing;
      setMorph(breathMeshes, b.morph, motion ? breathWeight(t, b.rate, b.amplitude) : 0);
    }

    // Head turns toward its target, at most 35° around the rest face axis (any posture).
    headBone.getWorldPosition(headPos);
    toTarget.copy(lookAt).sub(headPos);
    const look = lookAxisAngle([faceForward.x, faceForward.y, faceForward.z], [toTarget.x, toTarget.y, toTarget.z]);
    if (look.angle === 0) lookQ.identity();
    else lookQ.setFromAxisAngle(axis.set(look.axis[0], look.axis[1], look.axis[2]), look.angle);
    goalQ.copy(lookQ).multiply(restHeadWorld);
    if (headBone.parent) headBone.parent.getWorldQuaternion(parentQ);
    else parentQ.identity();
    goalQ.premultiply(parentQ.invert());
    if (motion) headBone.quaternion.slerp(goalQ, 1 - Math.exp(-dt * 5));
    else headBone.quaternion.copy(goalQ);

    // Illustrative layers ease in over ~0.8 s (instant without motion).
    const step = motion ? Math.min(1, dt * 1.3) : 1;
    for (let r = 0; r < reveal.length; r++) {
      const d = revealTarget[r] - reveal[r];
      reveal[r] += Math.sign(d) * Math.min(Math.abs(d), step);
      uniforms.uExam.value[r] = reveal[r];
    }
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
    regionIds: order,
    colliders,
    pickables,
    labelOwner: (obj) => {
      let o: THREE.Object3D | null = obj;
      while (o && o !== root) {
        // Only `label` is ever shown; `info` holds authoring notes.
        if (typeof o.userData.label === "string") return UNLABELLED_PARTS.has(o.name) ? null : o;
        o = o.parent;
      }
      return null;
    },
    regionBox: (id) => regionBoxes.get(id) ?? childBox,
    childBox,
    sceneBox,
    headPosition: (out) => headBone.getWorldPosition(out),
    views,
    regionViewDir: (id) => viewDirs.get(id) ?? null,
    orbit: orbitLimitsFor(orbitDirs),
    setRegionHover: (id) => {
      const slot = id ? order.indexOf(id) : -1;
      uniforms.uHover.value = slot;
      // A region on clothing (atlasCell -1) has no skin to light up: ghost its collider instead.
      for (const [c] of ghostMaterials) {
        const region = c.userData.regionId as string;
        const on = slot >= 0 && region === id && (extras.get(region)?.atlasCell ?? -1) < 0;
        if (c.visible !== on) c.traverse((o) => (o.visible = on));
      }
    },
    setPartHover: (owner) => {
      if (owner === glowing) return;
      if (glowing) setGlow(glowing, false);
      glowing = owner;
      if (owner) setGlow(owner, true);
    },
    setFindings: (findings) => {
      revealTarget = revealTargets(order, findings).slice(0, order.length);
    },
    update,
    dispose: () => disposeTree(root, ownedMaterials),
  };
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
