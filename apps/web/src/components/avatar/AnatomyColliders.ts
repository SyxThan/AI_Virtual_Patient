import * as THREE from "three";

/**
 * Procedural low-poly "mother holding child" rig (fallback while no .glb asset
 * exists — see the avatar-3d skill) plus the HFMD exam colliders.
 *
 * Purely ILLUSTRATIVE geometry: it carries no clinical information. Exam findings
 * always come from the case JSON via the backend, never from this mesh.
 */

/** UI exam regions. The backend maps them onto the case's `exam[].region`. */
export const EXAM_REGIONS = ["palm_hands", "feet", "mouth_throat", "buttocks_knees"] as const;
export type ExamRegionId = (typeof EXAM_REGIONS)[number];

export const COLLIDER_GROUP_NAME = "ExamColliders";

export type AvatarRig = {
  root: THREE.Group;
  colliders: THREE.Group;
  /** Child's mouth mesh; lip-sync scales it on Y (Slice 5-03). */
  jaw: THREE.Mesh;
  dispose: () => void;
};

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
  return m;
}

function collider(regionId: ExamRegionId, radius: number, pos: [number, number, number]) {
  // Invisible to the eye but still hit by the raycaster (opacity 0, visible = true).
  // Hover raises opacity a little so the student sees what they are about to examine.
  const material = new THREE.MeshBasicMaterial({
    color: "#22c55e",
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), material);
  m.position.set(...pos);
  m.userData.regionId = regionId;
  m.name = `collider:${regionId}`;
  return m;
}

export function buildProceduralRig(): AvatarRig {
  const root = new THREE.Group();
  root.name = "AvatarRoot";

  // --- Mother ---
  const mother = new THREE.Group();
  mother.add(mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.75, 8), COLORS.dress, [0, 1.12, 0]));
  mother.add(mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.8, 8), COLORS.dress, [0, 0.4, 0]));
  mother.add(mesh(new THREE.SphereGeometry(0.14, 12, 10), COLORS.skinMother, [0, 1.66, 0]));
  mother.add(mesh(new THREE.SphereGeometry(0.15, 12, 10), COLORS.hair, [0, 1.71, -0.03]));
  // Forearm cradling the child.
  const forearm = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.56, 8), COLORS.skinMother, [0, 0.96, 0.3]);
  forearm.rotation.z = Math.PI / 2;
  mother.add(forearm);
  // Upper arms.
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
  const jaw = mesh(new THREE.BoxGeometry(0.045, 0.014, 0.02), COLORS.mouth, [-0.24, -0.015, 0.093]);
  jaw.name = "ChildMouth";
  child.add(jaw);
  // Hands.
  child.add(mesh(new THREE.SphereGeometry(0.026, 10, 8), COLORS.skinChild, [-0.06, 0.06, 0.1]));
  child.add(mesh(new THREE.SphereGeometry(0.026, 10, 8), COLORS.skinChild, [-0.02, 0.07, -0.09]));
  // Legs + feet.
  for (const z of [0.045, -0.045]) {
    const leg = mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.16, 8), COLORS.skinChild, [0.22, -0.01, z]);
    leg.rotation.z = Math.PI / 2;
    child.add(leg);
    child.add(mesh(new THREE.BoxGeometry(0.04, 0.035, 0.03), COLORS.skinChild, [0.31, -0.01, z]));
  }

  // Exam colliders (children of the child so they follow it).
  const colliders = new THREE.Group();
  colliders.name = COLLIDER_GROUP_NAME;
  colliders.add(collider("mouth_throat", 0.05, [-0.24, -0.01, 0.09]));
  colliders.add(collider("palm_hands", 0.05, [-0.06, 0.06, 0.1]));
  colliders.add(collider("palm_hands", 0.05, [-0.02, 0.07, -0.09]));
  colliders.add(collider("feet", 0.05, [0.31, -0.01, 0.045]));
  colliders.add(collider("feet", 0.05, [0.31, -0.01, -0.045]));
  colliders.add(collider("buttocks_knees", 0.075, [0.15, -0.03, 0]));
  child.add(colliders);
  root.add(child);

  const dispose = () => {
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        materials.forEach((m) => m.dispose());
      }
    });
  };

  return { root, colliders, jaw, dispose };
}
