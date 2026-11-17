"use client";

import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildProceduralRig } from "./AnatomyColliders";
import { patientLipSync } from "./LipSyncController";
import { loadClinicModel, onModelProgress } from "./ModelLoader";
import { clamp, easeInOutCubic, placeBeside, type RegionFindings, type ViewId } from "./avatarContract";
import { CameraFlight, partView, presetView, regionView, type CameraView } from "./cameraViews";
import type { CaseSceneConfig } from "./caseScene";
import { prepareCaseRig } from "./caseRig";
import { prepareClinicRig } from "./clinicRig";
import type { SceneRig } from "./sceneRig";

export type HoverTarget = { kind: "region"; region: string } | { kind: "part"; label: string };

export type SceneStatus =
  | { phase: "loading"; progress: number }
  | { phase: "ready"; source: SceneRig["source"]; regions: readonly string[] }
  | { phase: "unsupported" }
  /** avp-case-scene/1 model missing or off-contract: the stage offers the exam buttons only. */
  | { phase: "failed" };

/**
 * Which scene to build. Omitted: the Slice 16 HFMD scene (mother_child.glb,
 * procedural fallback). `case`: an avp-case-scene/1 model; `regions` are the
 * case catalog's exam region ids (colliders outside it are ignored).
 */
export type AvatarSceneSource = { kind: "case"; config: CaseSceneConfig; regions: readonly string[] };

export type AvatarSceneApi = {
  setView: (view: ViewId) => void;
  focusRegion: (region: string) => void;
  /** Exam framing on the whole child, the mother glancing at it ("observe"). */
  focusChild: () => void;
  /** Dolly in (+1) or out (-1) one step toward the orbit target. */
  zoom: (direction: 1 | -1) => void;
};

export type AvatarSceneProps = {
  /** Scene to build; HFMD (Slice 16) when omitted. Read once on mount. */
  source?: AvatarSceneSource;
  /** Called when the student clicks (not drags) an exam region. Omit to disable exams. */
  onExamineRegion?: (regionId: string) => void;
  /** Region -> `documented` for regions already examined (drives the lesion layer). */
  findings: RegionFindings;
  /** Region highlighted from outside the canvas (exam buttons). */
  hoverRegion: string | null;
  /** Floating label element owned by the parent; the scene only moves it. */
  tooltipRef: RefObject<HTMLDivElement | null>;
  onHoverChange: (target: HoverTarget | null) => void;
  onStatus: (status: SceneStatus) => void;
  onSpeakingChange: (speaking: boolean) => void;
  /** First drag, wheel or pinch on the canvas (hides the first-run hint). */
  onFirstInteraction: () => void;
  onReady: (api: AvatarSceneApi | null) => void;
  /**
   * Layer over the canvas whose `[data-anchor]` children follow 3D points:
   * markers are centred on their point, `data-anchor-kind="card"` elements sit
   * beside it (docked by CSS when the stage is narrower than CARD_MIN_STAGE).
   * Only `transform` is written, so overlays never trigger layout of the page.
   */
  overlayRef: RefObject<HTMLElement | null>;
};

const CLICK_TOLERANCE_PX = 5; // more movement than this = an orbit drag, not a click
const SPEAK_ON = 0.09;
const SPEAK_OFF = 0.04;
const LOOK_AT_CHILD_SECONDS = 3.5;
const VIEW_FLIGHT_S = 0.5;
const ZOOM_STEP = 0.8;
/** Below this stage width the result card docks instead of following its marker. */
export const CARD_MIN_STAGE = 640;
const HEAD_BADGE_LIFT = 0.24; // metres above the head anchor

/**
 * Three.js scene for the Clinical Workspace stage: the clinic room with the mother
 * holding the child (mother_child.glb, docs/specs/avatar-asset.md), or the
 * procedural fallback; or, for another case, its avp-case-scene/1 model. Client-only: loaded through AvatarCanvas with
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    function regionOf(o: THREE.Object3D | null): string | null {
      for (let n = o; n; n = n.parent) if (n.userData.regionId) return n.userData.regionId as string;
      return null;
    }
    const flight = new CameraFlight();
    controls.addEventListener("start", () => flight.cancel()); // the learner takes over

    // ---------------------------------------------------------------- rig
    let rig: SceneRig | null = null;
    let disposed = false;
    let lookAtChildUntil = -1;
    const childLookPoint = new THREE.Vector3();

    const current = (): CameraView => ({ position: camera.position.clone(), target: controls.target.clone() });
    const aspect = () => camera.aspect;
    const flyTo = (to: CameraView, seconds = VIEW_FLIGHT_S) => {
      if (reducedMotion.matches) {
        flight.cancel();
        camera.position.copy(to.position);
        controls.target.copy(to.target);
        return;
      }
      flight.start(current(), to, seconds);
    };
    const glanceAt = (point: THREE.Vector3) => {
      // The mother glances down at her child while it is examined.
      childLookPoint.copy(point);
      lookAtChildUntil = clock.elapsed + LOOK_AT_CHILD_SECONDS;
    };
    const api = {
      setView: (view: ViewId) => {
        if (rig) flyTo(presetView(view, rig, aspect()));
      },
      focusRegion: (region: string) => {
        // Exam-bar-only hotspots (e.g. vitals) have no collider: nothing to fly to.
        if (!rig || !rig.regionIds.includes(region)) return;
        flyTo(regionView(region, rig, aspect()), 0.6);
        glanceAt(rig.regionBox(region).getCenter(new THREE.Vector3()));
      },
      focusChild: () => {
        if (!rig) return;
        flyTo(presetView("exam", rig, aspect()));
        glanceAt(rig.childBox.getCenter(new THREE.Vector3()));
      },
      zoom: (direction: 1 | -1) => {
        const offset = camera.position.clone().sub(controls.target);
        const len = clamp(
          offset.length() * (direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP),
          controls.minDistance,
          controls.maxDistance,
        );
        flyTo(
          { target: controls.target.clone(), position: controls.target.clone().addScaledVector(offset.normalize(), len) },
          0.25,
        );
      },
    } satisfies AvatarSceneApi;

    // 3D points the HTML overlays follow. A region anchor sits on its
    // collider's surface on the camera side, not at the box centre (for "both
    // hands" the centre would float in the air between them).
    const anchors = new Map<string, THREE.Vector3>();
    const computeAnchors = (r: SceneRig) => {
      anchors.clear();
      r.root.updateMatrixWorld(true);
      const front = new THREE.Vector3(0.3, 0.2, 1).normalize();
      const v = new THREE.Vector3();
      for (const collider of r.colliders) {
        const region = regionOf(collider);
        if (!region || anchors.has(region)) continue;
        const box = r.regionBox(region);
        const size = box.getSize(new THREE.Vector3()).length();
        const aim = box.getCenter(new THREE.Vector3()).addScaledVector(r.regionViewDir?.(region) ?? front, size);
        const best = new THREE.Vector3();
        let bestD = Infinity;
        // Every collider of this region (a region may be split across meshes).
        for (const c of r.colliders) {
          if (regionOf(c) !== region) continue;
          c.traverse((o) => {
            const mesh = o as THREE.Mesh;
            const pos = mesh.isMesh ? mesh.geometry.getAttribute("position") : null;
            if (!pos) return;
            for (let i = 0; i < pos.count; i++) {
              v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
              const d = v.distanceToSquared(aim);
              if (d < bestD) {
                bestD = d;
                best.copy(v);
              }
            }
          });
        }
        anchors.set(region, bestD < Infinity ? best : box.getCenter(new THREE.Vector3()));
      }
      anchors.set("child", r.childBox.getCenter(new THREE.Vector3()));
    };

    const attach = (next: SceneRig) => {
      if (disposed) {
        next.dispose();
        return;
      }
      rig = next;
      rigRef.current = next;
      scene.add(next.root);
      if (next.orbit) {
        // Scene-authored camera directions (avp-case-scene/1) must stay reachable.
        controls.minAzimuthAngle = next.orbit.minAzimuth;
        controls.maxAzimuthAngle = next.orbit.maxAzimuth;
        controls.minPolarAngle = next.orbit.minPolar;
        controls.maxPolarAngle = next.orbit.maxPolar;
      }
      computeAnchors(next);
      next.setFindings(p().findings);
      renderer.shadowMap.needsUpdate = true;
      // Establishing shot: the whole room, then glide in to the conversation framing.
      const overview = presetView("overview", next, aspect());
      camera.position.copy(overview.position);
      controls.target.copy(overview.target);
      controls.update();
      flyTo(presetView("talk", next, aspect()), 1.6);
      p().onStatus({ phase: "ready", source: next.source, regions: next.regionIds });
      p().onReady(api);
    };

    const source = p().source;
    const stopProgress = onModelProgress((f) => {
      if (!rig) p().onStatus({ phase: "loading", progress: f });
    }, source?.config.model);
    if (!source) {
      loadClinicModel()
        .then((gltf) => attach(prepareClinicRig(gltf)))
        .catch((err: unknown) => {
          // Network error, decoder failure or a file that breaks the contract (§9).
          console.warn("[avatar] using the procedural fallback:", err);
          attach(buildProceduralRig());
        });
    } else {
      loadClinicModel(source.config.model)
        .then((gltf) => attach(prepareCaseRig(gltf, source.config, source.regions)))
        .catch((err: unknown) => {
          // No procedural stand-in for these cases: the exam buttons stay usable.
          console.warn("[avatar] case model unavailable, using the exam buttons:", err);
          if (!disposed) p().onStatus({ phase: "failed" });
        });
    }

    // ---------------------------------------------------------------- picking
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let pointerRegion: string | null = null;
    let pointerOwner: THREE.Object3D | null = null;
    let lastHoverKey = "";
    let pendingMove: PointerEvent | null = null;

    type Hit =
      | { kind: "region"; region: string }
      | { kind: "part"; owner: THREE.Object3D; label: string };


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

    let interacted = false;
    const firstInteraction = () => {
      if (interacted) return;
      interacted = true;
      p().onFirstInteraction();
    };
    let downAt: { x: number; y: number } | null = null;
    const onPointerDown = (ev: PointerEvent) => {
      downAt = { x: ev.clientX, y: ev.clientY };
      firstInteraction();
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

    // The workspace page never scrolls, so the plain wheel (and a pinch, via
    // OrbitControls) zooms the stage directly.
    canvas.addEventListener("wheel", firstInteraction, { passive: true });

    // ---------------------------------------------------------------- sizing & visibility
    const stage = { w: 0, h: 0 };
    let framed = false;
    const resize = () => {
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      if (w === stage.w && h === stage.h) return;
      stage.w = w;
      stage.h = h;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // setSize clears the canvas: draw now, not on the next frame, so dragging
      // the column divider or resizing the window never flashes an empty stage.
      if (framed) {
        placeOverlays();
        renderer.render(scene, camera);
      }
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

    // ---------------------------------------------------------------- overlays
    const projected = new THREE.Vector3();
    const headPoint = new THREE.Vector3();
    function placeOverlays() {
      const layer = p().overlayRef.current;
      if (!layer || !rig) return;
      const els = layer.querySelectorAll<HTMLElement>("[data-anchor]");
      if (els.length === 0) return;
      // Read every size first, then write: no layout thrash.
      const sizes = Array.from(els, (el) => [el.offsetWidth, el.offsetHeight] as const);
      rig.headPosition(headPoint);
      headPoint.y += HEAD_BADGE_LIFT;
      els.forEach((el, i) => {
        const id = el.dataset.anchor;
        const point = id === "head" ? headPoint : id ? anchors.get(id) : undefined;
        if (!point) return;
        projected.copy(point).project(camera);
        const onStage = projected.z < 1 && Math.abs(projected.x) <= 1.02 && Math.abs(projected.y) <= 1.02;
        const sx = (projected.x * 0.5 + 0.5) * stage.w;
        const sy = (-projected.y * 0.5 + 0.5) * stage.h;
        const [w, h] = sizes[i];
        let transform = "";
        if (el.dataset.anchorKind === "card") {
          const floating = stage.w >= CARD_MIN_STAGE ? "true" : "false";
          if (el.dataset.floating !== floating) el.dataset.floating = floating;
          if (floating === "true") {
            const pos = placeBeside(sx, sy, w, h, stage.w, stage.h);
            transform = `translate3d(${Math.round(pos.x)}px, ${Math.round(pos.y)}px, 0)`;
          }
        } else {
          transform = `translate3d(${Math.round(sx - w / 2)}px, ${Math.round(sy - h / 2)}px, 0)`;
          const shown = onStage ? "true" : "false";
          if (el.dataset.onStage !== shown) el.dataset.onStage = shown;
        }
        if (el.style.transform !== transform) el.style.transform = transform;
      });
    }

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
      placeOverlays();
      renderer.render(scene, camera);
      framed = true;
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
      canvas.removeEventListener("wheel", firstInteraction);
      controls.dispose();
      rig?.dispose();
      rigRef.current = null;
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0 touch-none" />;
}
