import * as THREE from "three";
import { aspectDistanceFactor, clamp, type ViewId } from "./avatarContract";
import type { SceneRig } from "./sceneRig";

/**
 * Camera framings computed from the rig's own boxes, so they still fit when
 * the model changes or the stage has a different aspect ratio. Every view
 * looks from the front-right (+X, +Z): the room's walls are at −Z and −X,
 * so the camera never ends up behind a wall.
 */

export type CameraView = { position: THREE.Vector3; target: THREE.Vector3 };

const DIR = {
  overview: new THREE.Vector3(3.65, 1.7, 4.85).normalize(),
  talk: new THREE.Vector3(0.32, 0.1, 1).normalize(),
  exam: new THREE.Vector3(0.3, 0.22, 1).normalize(),
};

function place(target: THREE.Vector3, dir: THREE.Vector3, dist: number): CameraView {
  return { target, position: target.clone().addScaledVector(dir, dist) };
}

export function presetView(id: ViewId, rig: SceneRig, aspect: number): CameraView {
  const f = aspectDistanceFactor(aspect);
  const authored = rig.views?.[id];
  if (authored) {
    // Scene-authored preset (avp-case-scene/1): keep its direction, stretch the distance on narrow stages.
    const offset = authored.position.clone().sub(authored.target);
    return place(authored.target.clone(), offset.clone().normalize(), offset.length() * f);
  }
  if (id === "overview") {
    const box = rig.sceneBox;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    // Aim low (people sit on the bed); keep the whole diorama in frame.
    const target = new THREE.Vector3(center.x, box.min.y + size.y * 0.3, center.z);
    const radius = size.length() / 2;
    return place(target, DIR.overview, radius * 2 * f);
  }
  if (id === "talk") {
    // Mother's face high in frame, the child on her lap below it.
    const target = rig.headPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -0.24, 0.05));
    return place(target, DIR.talk, 2.05 * f);
  }
  const box = rig.childBox;
  const target = box.getCenter(new THREE.Vector3());
  const dist = clamp(box.getSize(new THREE.Vector3()).length() * 1.9, 0.9, 2.0);
  return place(target, DIR.exam, dist * f);
}

export function regionView(id: string, rig: SceneRig, aspect: number): CameraView {
  const box = rig.regionBox(id);
  const target = box.getCenter(new THREE.Vector3());
  const dir = rig.regionViewDir?.(id)?.clone() ?? new THREE.Vector3(0.3, id === "feet" ? 0.05 : 0.2, 1).normalize();
  const dist = Math.max(0.6, box.getSize(new THREE.Vector3()).length() * 2.2);
  return place(target, dir, dist * aspectDistanceFactor(aspect));
}

export function partView(owner: THREE.Object3D, from: CameraView, aspect: number): CameraView {
  const box = new THREE.Box3().setFromObject(owner);
  const target = box.getCenter(new THREE.Vector3());
  const dist = clamp(box.getSize(new THREE.Vector3()).length() * 1.7, 0.7, 6.5);
  const dir = from.position.clone().sub(from.target).normalize();
  if (dir.z < 0.35 || dir.x < -0.2) dir.set(0.4, 0.3, 0.85).normalize(); // never behind a wall
  return place(target, dir, dist * aspectDistanceFactor(aspect));
}

/** Eased camera flight between two views. */
export class CameraFlight {
  private from: CameraView | null = null;
  private to: CameraView | null = null;
  private t = 0;
  private duration = 1;

  start(from: CameraView, to: CameraView, seconds: number) {
    this.from = { position: from.position.clone(), target: from.target.clone() };
    this.to = to;
    this.t = 0;
    this.duration = Math.max(0.001, seconds);
  }

  cancel() {
    this.from = this.to = null;
  }

  get active() {
    return this.to !== null;
  }

  /** Advances the flight; writes into camera/target. Returns true while flying. */
  step(dt: number, ease: (t: number) => number, camera: THREE.Camera, target: THREE.Vector3): boolean {
    if (!this.from || !this.to) return false;
    this.t = Math.min(1, this.t + dt / this.duration);
    const k = ease(this.t);
    camera.position.lerpVectors(this.from.position, this.to.position, k);
    target.lerpVectors(this.from.target, this.to.target, k);
    if (this.t >= 1) this.cancel();
    return true;
  }
}
