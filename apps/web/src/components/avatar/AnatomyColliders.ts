import * as THREE from "three";
import { jawScaleFor } from "./LipSyncController";
import type { ExamRegionId } from "./avatarContract";
import type { FrameInput, SceneRig } from "./sceneRig";

/**
 * Procedural low-poly "mother holding child" rig: the FALLBACK used when
 * mother_child.glb cannot be loaded or breaks the asset contract (contract §9).
 * It keeps the same four exam colliders, so the exam always works.
 *
 * Purely ILLUSTRATIVE geometry: it carries no clinical information. Exam findings
 * always come from the case JSON via the backend, never from this mesh.
 */

export { EXAM_REGIONS, type ExamRegionId } from "./avatarContract";

const HOVER_OPACITY = 0.28;

const COLORS = {
  skinMother: "#e8b796",
  skinChild: "#f2c6a5",
  dress: "#5b7fa6",
  hair: "#3b2a20",
  blanket: "#f4e3a1",
  mouth: "#8a2f35",
};

function mat(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true });
}

function mesh(geo: THREE.BufferGeometry, color: string, pos: [number, number, number]) {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(...pos);
  m.castShadow = true;
  return m;
}

function collider(regionId: ExamRegionId, radius: number, pos: [number, number, number]) {
  // Visible but fully transparent: hover raises the opacity a little so the
  // student sees what they are about to examine.
  const material = new THREE.MeshBasicMaterial({
    color: "#0a6e69",
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), material);
  m.position.set(...pos);
  m.userData.regionId = regionId;
  m.name = `collider_${regionId}`;
  return m;
}

export function buildProceduralRig(): SceneRig {
  const root = new THREE.Group();
  root.name = "AvatarRoot";

  // --- Mother ---
  const mother = new THREE.Group();
  mother.add(mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.75, 8), COLORS.dress, [0, 1.12, 0]));
  mother.add(mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.8, 8), COLORS.dress, [0, 0.4, 0]));
  mother.add(mesh(new THREE.SphereGeometry(0.14, 12, 10), COLORS.skinMother, [0, 1.66, 0]));
  mother.add(mesh(new THREE.SphereGeometry(0.15, 12, 10), COLORS.hair, [0, 1.71, -0.03]));
  const mouth = mesh(new THREE.BoxGeometry(0.06, 0.016, 0.02), COLORS.mouth, [0, 1.6, 0.132]);
  mouth.name = "MotherMouth";
  mother.add(mouth);
  const forearm = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.56, 8), COLORS.skinMother, [0, 0.96, 0.3]);
  forearm.rotation.z = Math.PI / 2;
  mother.add(forearm);
  for (const x of [-0.24, 0.24]) {
    const arm = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8), COLORS.dress, [x, 1.17, 0.12]);
    arm.rotation.x = -0.6;
    mother.add(arm);
  }
  root.add(mother);

  // --- Child (held horizontally in front of the chest) ---
  const child = new THREE.Group();
  child.position.set(0, 1.04, 0.32);
  const body = mesh(new THREE.CapsuleGeometry(0.085, 0.22, 4, 8), COLORS.blanket, [0.02, 0, 0]);
  body.rotation.z = Math.PI / 2;
  child.add(body);
  child.add(mesh(new THREE.SphereGeometry(0.1, 14, 12), COLORS.skinChild, [-0.24, 0.03, 0]));
  child.add(mesh(new THREE.SphereGeometry(0.026, 10, 8), COLORS.skinChild, [-0.06, 0.06, 0.1]));
  child.add(mesh(new THREE.SphereGeometry(0.026, 10, 8), COLORS.skinChild, [-0.02, 0.07, -0.09]));
  for (const z of [0.045, -0.045]) {
    const leg = mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.16, 8), COLORS.skinChild, [0.22, -0.01, z]);
    leg.rotation.z = Math.PI / 2;
    child.add(leg);
    child.add(mesh(new THREE.BoxGeometry(0.04, 0.035, 0.03), COLORS.skinChild, [0.31, -0.01, z]));
  }

  const colliders = [
    collider("mouth_throat", 0.05, [-0.24, -0.01, 0.09]),
    collider("palm_hands", 0.05, [-0.06, 0.06, 0.1]),
    collider("palm_hands", 0.05, [-0.02, 0.07, -0.09]),
    collider("feet", 0.05, [0.31, -0.01, 0.045]),
    collider("feet", 0.05, [0.31, -0.01, -0.045]),
    collider("buttocks_knees", 0.075, [0.15, -0.03, 0]),
  ];
  colliders.forEach((c) => child.add(c));
  root.add(child);
  root.updateMatrixWorld(true);

  const regionBox = (id: ExamRegionId) => {
    const box = new THREE.Box3();
    colliders.filter((c) => c.userData.regionId === id).forEach((c) => box.expandByObject(c));
    return box;
  };
  const childBox = new THREE.Box3().setFromObject(child);
  const sceneBox = new THREE.Box3().setFromObject(root);
  const headPos = new THREE.Vector3(0, 1.66, 0);

  const setRegionHover = (id: ExamRegionId | null) => {
    for (const c of colliders) {
      (c.material as THREE.MeshBasicMaterial).opacity = id && c.userData.regionId === id ? HOVER_OPACITY : 0;
    }
  };

  return {
    source: "procedural",
    root,
    colliders,
    pickables: [],
    labelOwner: () => null,
    regionBox,
    childBox,
    sceneBox,
    headPosition: (out) => out.copy(headPos),
    setRegionHover,
    setPartHover: () => undefined,
    setFindings: () => undefined, // no lesion layer on the fallback
    update: ({ mouth: level }: FrameInput) => {
      mouth.scale.y = jawScaleFor(level);
    },
    dispose: () => {
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.forEach((m) => m.dispose());
        }
      });
    },
  };
}
