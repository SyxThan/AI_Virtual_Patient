"use client";

import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildProceduralRig } from "./AnatomyColliders";
import { patientLipSync } from "./LipSyncController";
import { loadClinicModel, onModelProgress } from "./ModelLoader";
import { easeInOutCubic, type ExamRegionId, type RegionFindings, type ViewId } from "./avatarContract";
import { CameraFlight, partView, presetView, regionView, type CameraView } from "./cameraViews";
import { prepareClinicRig } from "./clinicRig";
import type { SceneRig } from "./sceneRig";

export type HoverTarget = { kind: "region"; region: ExamRegionId } | { kind: "part"; label: string };

export type SceneStatus =
  | { phase: "loading"; progress: number }
  | { phase: "ready"; source: SceneRig["source"] }
  | { phase: "unsupported" };

export type AvatarSceneApi = {
  setView: (view: ViewId) => void;
  focusRegion: (region: ExamRegionId) => void;
};

export type AvatarSceneProps = {
  /** Called when the student clicks (not drags) an exam region. Omit to disable exams. */
  onExamineRegion?: (regionId: ExamRegionId) => void;
  /** Region -> `documented` for regions already examined (drives the lesion layer). */
  findings: RegionFindings;
  /** Region highlighted from outside the canvas (exam buttons). */
  hoverRegion: ExamRegionId | null;
  /** Floating label element owned by the parent; the scene only moves it. */
  tooltipRef: RefObject<HTMLDivElement | null>;
  onHoverChange: (target: HoverTarget | null) => void;
  onStatus: (status: SceneStatus) => void;
  onSpeakingChange: (speaking: boolean) => void;
  /** The learner scrolled over the canvas without Ctrl: the page scrolls instead of zooming. */
  onWheelPassThrough: () => void;
  onReady: (api: AvatarSceneApi | null) => void;
};

const CLICK_TOLERANCE_PX = 5; // more movement than this = an orbit drag, not a click
const SPEAK_ON = 0.09;
const SPEAK_OFF = 0.04;
const LOOK_AT_CHILD_SECONDS = 3.5;

/**
 * Three.js scene for the Clinical Workspace: the clinic room with the mother
 * holding the child (mother_child.glb, docs/specs/avatar-asset.md), or the
 * procedural fallback. Client-only: loaded through AvatarCanvas with
 * `dynamic(..., { ssr: false })`; touches window/document only inside effects.
 *
 * Performance: one scene for the page, static shadow map (rendered once),
 * picking at most once per frame, the loop pauses while the canvas is off
 * screen, and pixel ratio/shadows drop automatically on slow devices.
 */
export default function AvatarScene(props: AvatarSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  const rigRef = useRef<SceneRig | null>(null);

  useEffect(() => {
    propsRef.current = props;
  });

  useEffect(() => {
    rigRef.current?.setFindings(props.findings);
  }, [props.findings]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const p = () => propsRef.current;

    // ---------------------------------------------------------------- renderer
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      p().onStatus({ phase: "unsupported" });
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false; // the room is static: render the shadow map on demand
    const canvas = renderer.domElement;
    canvas.style.display = "block";
    canvas.style.cursor = "grab";
    canvas.setAttribute("aria-hidden", "true");
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 60);
    camera.position.set(3.3, 2.5, 4.6);

    // Soft daylight: hemisphere fill + a warm key light from the window side.
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe6d8c4, 2.1));
    const sun = new THREE.DirectionalLight(0xfff1dd, 1.7);
    sun.position.set(-3.5, 5, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -3.5, right: 3.5, top: 3.5, bottom: -3.5, near: 0.5, far: 14 });
    scene.add(sun);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 0.4;
    controls.maxDistance = 10;
    controls.minPolarAngle = Math.PI * 0.18;
    controls.maxPolarAngle = Math.PI * 0.52; // never under the floor
    controls.minAzimuthAngle = -0.35; // never through the left wall...
    controls.maxAzimuthAngle = 1.25; // ...or round to the back wall
    controls.target.set(-0.35, 0.8, -0.25);

    const clock = { last: performance.now(), elapsed: 0 };
    const flight = new CameraFlight();
    controls.addEventListener("start", () => flight.cancel()); // the learner takes over

    // ---------------------------------------------------------------- rig
    let rig: SceneRig | null = null;
    let disposed = false;
    let lookAtChildUntil = -1;
    const childLookPoint = new THREE.Vector3();

    const current = (): CameraView => ({ position: camera.position.clone(), target: controls.target.clone() });
    const aspect = () => camera.aspect;
    const flyTo = (to: CameraView, seconds = 1.1) => {
      if (reducedMotion.matches) {
        flight.cancel();
        camera.position.copy(to.position);
        controls.target.copy(to.target);
        return;
      }
      flight.start(current(), to, seconds);
    };
    const api = {
      setView: (view: ViewId) => {
        if (rig) flyTo(presetView(view, rig, aspect()));
      },
      focusRegion: (region: ExamRegionId) => {
        if (!rig) return;
        flyTo(regionView(region, rig, aspect()));
        // The mother glances down at her child while it is examined.
        rig.regionBox(region).getCenter(childLookPoint);
        lookAtChildUntil = clock.elapsed + LOOK_AT_CHILD_SECONDS;
      },
    } satisfies AvatarSceneApi;

    const attach = (next: SceneRig) => {
      if (disposed) {
        next.dispose();
        return;
      }
      rig = next;
      rigRef.current = next;
      scene.add(next.root);
      next.setFindings(p().findings);
      renderer.shadowMap.needsUpdate = true;
      // Establishing shot: the whole room, then glide in to the conversation framing.
      const overview = presetView("overview", next, aspect());
      camera.position.copy(overview.position);
      controls.target.copy(overview.target);
      controls.update();
      flyTo(presetView("talk", next, aspect()), 1.8);
      p().onStatus({ phase: "ready", source: next.source });
      p().onReady(api);
    };

    const stopProgress = onModelProgress((f) => {
      if (!rig) p().onStatus({ phase: "loading", progress: f });
    });
    loadClinicModel()
      .then((gltf) => attach(prepareClinicRig(gltf)))
      .catch((err: unknown) => {
        // Network error, decoder failure or a file that breaks the contract (§9).
        console.warn("[avatar] using the procedural fallback:", err);
        attach(buildProceduralRig());
      });

    // ---------------------------------------------------------------- picking
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let pointerRegion: ExamRegionId | null = null;
    let pointerOwner: THREE.Object3D | null = null;
    let lastHoverKey = "";
    let pendingMove: PointerEvent | null = null;

    type Hit =
      | { kind: "region"; region: ExamRegionId }
      | { kind: "part"; owner: THREE.Object3D; label: string };

    const regionOf = (o: THREE.Object3D | null): ExamRegionId | null => {
      for (let n = o; n; n = n.parent) if (n.userData.regionId) return n.userData.regionId as ExamRegionId;
      return null;
    };

    const pick = (ev: PointerEvent): Hit | null => {
      if (!rig) return null;
      const rect = canvas.getBoundingClientRect();
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const regionHit = raycaster.intersectObjects(rig.colliders, true)[0];
      const partHit = rig.pickables.length ? raycaster.intersectObjects(rig.pickables, false)[0] : undefined;
      // A collider wraps its skin, so it is hit first unless something (the mother's arm) is in front.
      if (regionHit && (!partHit || regionHit.distance <= partHit.distance + 0.03)) {
        const region = regionOf(regionHit.object);
        if (region) return { kind: "region", region };
      }
      if (partHit) {
        const owner = rig.labelOwner(partHit.object);
        if (owner) return { kind: "part", owner, label: String(owner.userData.label) };
      }
      return null;
    };

    const applyHover = (hit: Hit | null, ev: PointerEvent | null) => {
      pointerRegion = hit?.kind === "region" ? hit.region : null;
      pointerOwner = hit?.kind === "part" ? hit.owner : null;
      rig?.setRegionHover(pointerRegion ?? p().hoverRegion);
      rig?.setPartHover(pointerOwner);
      canvas.style.cursor = hit ? "pointer" : "grab";
      const key = hit ? (hit.kind === "region" ? `r:${hit.region}` : `p:${hit.owner.uuid}`) : "";
      if (key !== lastHoverKey) {
        lastHoverKey = key;
        p().onHoverChange(
          hit ? (hit.kind === "region" ? { kind: "region", region: hit.region } : { kind: "part", label: hit.label }) : null,
        );
      }
      const tip = p().tooltipRef.current;
      if (tip && ev && hit) {
        const rect = container.getBoundingClientRect();
        const x = Math.min(ev.clientX - rect.left + 14, rect.width - tip.offsetWidth - 8);
        const y = Math.max(8, ev.clientY - rect.top - tip.offsetHeight - 10);
        tip.style.transform = `translate(${Math.max(8, x)}px, ${y}px)`;
      }
    };

    let downAt: { x: number; y: number } | null = null;
    const onPointerDown = (ev: PointerEvent) => {
      downAt = { x: ev.clientX, y: ev.clientY };
    };
    const onPointerUp = (ev: PointerEvent) => {
      if (!downAt) return;
      const moved = Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y);
      downAt = null;
      if (moved > CLICK_TOLERANCE_PX || !rig) return;
      const hit = pick(ev);
      if (hit?.kind === "region") {
        const onExamine = p().onExamineRegion;
        if (onExamine) {
          api.focusRegion(hit.region);
          onExamine(hit.region);
        }
      } else if (hit?.kind === "part") {
        flyTo(partView(hit.owner, current(), aspect()));
      }
    };
    const onPointerMove = (ev: PointerEvent) => {
      if (!downAt) pendingMove = ev; // picked once per frame in the loop
    };
    const onPointerLeave = () => {
      pendingMove = null;
      applyHover(null, null);
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);

    // Plain wheel scrolls the page (a workspace tile must not trap scrolling);
    // Ctrl/⌘ + wheel or fullscreen zooms. Capture phase on the container runs
    // before OrbitControls' own listener on the canvas.
    const onWheel = (ev: WheelEvent) => {
      if (ev.ctrlKey || ev.metaKey || document.fullscreenElement) return;
      ev.stopPropagation();
      p().onWheelPassThrough();
    };
    container.addEventListener("wheel", onWheel, { capture: true });

    // ---------------------------------------------------------------- sizing & visibility
    const resize = () => {
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    let onScreen = true;
    const visibility = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      renderer.setAnimationLoop(onScreen ? frame : null);
      clock.last = performance.now(); // no giant dt after a pause
    });
    visibility.observe(container);

    // ---------------------------------------------------------------- loop
    const lookAt = new THREE.Vector3();
    let speaking = false;
    // Adaptive quality: after the model is in, sample ~2 s of frames once.
    let sampleFrames = 0;
    let sampleTime = 0;
    let qualityChecked = false;

    function frame() {
      const now = performance.now();
      const dt = Math.min((now - clock.last) / 1000, 0.05);
      clock.last = now;
      clock.elapsed += dt;
      const t = clock.elapsed;
      const motion = !reducedMotion.matches;

      if (pendingMove) {
        applyHover(pick(pendingMove), pendingMove);
        pendingMove = null;
      } else if (!pointerRegion) {
        rig?.setRegionHover(p().hoverRegion);
      }

      flight.step(dt, easeInOutCubic, camera, controls.target);
      controls.update();

      const level = patientLipSync.level();
      if (!speaking && level > SPEAK_ON) {
        speaking = true;
        p().onSpeakingChange(true);
      } else if (speaking && level < SPEAK_OFF) {
        speaking = false;
        p().onSpeakingChange(false);
      }

      if (rig) {
        // The mother looks at the learner (the camera) except while her child is examined.
        lookAt.copy(t < lookAtChildUntil ? childLookPoint : camera.position);
        rig.update({ t, dt, mouth: level, lookAt, motion });

        if (!qualityChecked) {
          sampleFrames += 1;
          sampleTime += dt;
          if (sampleFrames >= 120) {
            qualityChecked = true;
            if (sampleTime / sampleFrames > 1 / 42) {
              renderer.setPixelRatio(1);
              sun.castShadow = false;
              resize();
            }
          }
        }
      }
      renderer.render(scene, camera);
    }
    renderer.setAnimationLoop(frame);

    return () => {
      disposed = true;
      stopProgress();
      p().onReady(null);
      renderer.setAnimationLoop(null);
      visibility.disconnect();
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      container.removeEventListener("wheel", onWheel, { capture: true });
      controls.dispose();
      rig?.dispose();
      rigRef.current = null;
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0 touch-none" />;
}
