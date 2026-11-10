"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildProceduralRig, type ExamRegionId } from "./AnatomyColliders";
import { jawScaleFor, patientLipSync } from "./LipSyncController";

export type AvatarSceneProps = {
  /** Called when the student clicks (not drags) an exam collider. */
  onExamineRegion?: (regionId: ExamRegionId) => void;
};

const CLICK_TOLERANCE_PX = 5; // more movement than this = an orbit drag, not a click
const HOVER_OPACITY = 0.28;

/**
 * Three.js scene for the Clinical Workspace avatar. Client-only: it is always
 * loaded through AvatarCanvas (dynamic import, ssr: false), and touches
 * window/document only inside the effect.
 */
export default function AvatarScene({ onExamineRegion }: AvatarSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onExamineRef = useRef(onExamineRegion);

  useEffect(() => {
    onExamineRef.current = onExamineRegion;
  }, [onExamineRegion]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f3f4f6");

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    camera.position.set(0, 1.2, 2.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    const canvas = renderer.domElement;

    scene.add(new THREE.HemisphereLight("#ffffff", "#8899aa", 1.6));
    const key = new THREE.DirectionalLight("#ffffff", 1.4);
    key.position.set(1.5, 2.5, 2);
    scene.add(key);

    const rig = buildProceduralRig();
    scene.add(rig.root);

    // Front/side views only: no orbiting behind the avatar, no flipping under it.
    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 1.1, 0.15);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minAzimuthAngle = -Math.PI / 2;
    controls.maxAzimuthAngle = Math.PI / 2;
    controls.minPolarAngle = Math.PI / 4;
    controls.maxPolarAngle = Math.PI / 1.8;
    controls.minDistance = 1.2;
    controls.maxDistance = 4;
    controls.update();

    // --- Raycasting exam (coordinates relative to the canvas, not the window) ---
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hovered: THREE.Mesh | null = null;

    const pick = (ev: PointerEvent): THREE.Mesh | null => {
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(rig.colliders.children, false)[0];
      return hit && hit.object instanceof THREE.Mesh ? hit.object : null;
    };

    const setHover = (next: THREE.Mesh | null) => {
      if (hovered === next) return;
      if (hovered) (hovered.material as THREE.MeshBasicMaterial).opacity = 0;
      hovered = next;
      if (hovered) (hovered.material as THREE.MeshBasicMaterial).opacity = HOVER_OPACITY;
      canvas.style.cursor = hovered ? "pointer" : "grab";
    };

    let downAt: { x: number; y: number } | null = null;
    const onPointerDown = (ev: PointerEvent) => {
      downAt = { x: ev.clientX, y: ev.clientY };
    };
    const onPointerUp = (ev: PointerEvent) => {
      if (!downAt) return;
      const moved = Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y);
      downAt = null;
      if (moved > CLICK_TOLERANCE_PX) return;
      const regionId = pick(ev)?.userData.regionId as ExamRegionId | undefined;
      if (regionId) onExamineRef.current?.(regionId);
    };
    const onPointerMove = (ev: PointerEvent) => {
      if (!downAt) setHover(pick(ev));
    };
    const onPointerLeave = () => setHover(null);

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.style.cursor = "grab";

    const resize = () => {
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    renderer.setAnimationLoop(() => {
      controls.update();
      // Lip-sync: closed (scale 1) unless patient audio is attached and playing.
      rig.jaw.scale.y = jawScaleFor(patientLipSync.level());
      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      controls.dispose();
      rig.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full touch-none" />;
}
