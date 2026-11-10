"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildProceduralRig } from "./AnatomyColliders";

/**
 * Three.js scene for the Clinical Workspace avatar. Client-only: it is always
 * loaded through AvatarCanvas (dynamic import, ssr: false), and touches
 * window/document only inside the effect.
 */
export default function AvatarScene() {
  const containerRef = useRef<HTMLDivElement>(null);

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

    scene.add(new THREE.HemisphereLight("#ffffff", "#8899aa", 1.6));
    const key = new THREE.DirectionalLight("#ffffff", 1.4);
    key.position.set(1.5, 2.5, 2);
    scene.add(key);

    const rig = buildProceduralRig();
    scene.add(rig.root);

    // Front/side views only: no orbiting behind the avatar, no flipping under it.
    const controls = new OrbitControls(camera, renderer.domElement);
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
      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      rig.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full touch-none" />;
}
