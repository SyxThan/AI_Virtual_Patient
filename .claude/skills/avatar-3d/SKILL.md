---
name: avatar-3d
description: Use when building, debugging, or extending the 3D avatar, Three.js canvas, raycasting examination, or basic lip-sync in the Clinical Workspace (`apps/web/src/components/avatar/`).
---

# Avatar 3D, Raycasting & Lip-Sync Skill

Guidance for implementing the Three.js 3D avatar (Mother holding child) and interactive physical examination via raycasting in the Clinical Workspace.

## Stack & Conventions
- **Engine:** Three.js (`three`, `@types/three`).
- **Integration:** React client component loaded via `dynamic(() => import(...), { ssr: false })` to prevent SSR window errors.
- **Model:** `apps/web/public/models/mother_child.glb` (Draco; decoder self-hosted in `public/draco/`). The asset contract is `docs/specs/avatar-asset.md`; code relies ONLY on what it lists. Blender source + build/validate scripts: `assets/avatar/`.
- **Coordinate Space:** metres, origin between the mother's feet on the floor, +Y up, characters face +Z. Room walls at −Z and −X: camera views always look from the front-right (`cameraViews.ts`), OrbitControls azimuth/polar limits keep it out of the walls.
- **Fallback:** a file that breaks the contract or fails to load falls back to the procedural rig (`AnatomyColliders.ts`) with the same 4 colliders; no WebGL shows a notice and the exam buttons still work.

## Directory Structure
```
apps/web/src/components/avatar/
  AvatarCanvas.tsx        # Tile UI: stage, view presets, tooltip, region buttons (main chunk, no three import)
  AvatarScene.tsx         # three.js scene: renderer, picking, camera flights, render loop (dynamic, ssr:false)
  avatarContract.ts       # Pure constants/helpers from the contract (tested with node --test)
  modelBytes.ts           # One cached .glb download + progress; no three import (prefetch from AvatarCanvas)
  ModelLoader.ts          # GLTFLoader + DRACOLoader parse
  clinicRig.ts            # Contract checks, colliders, morphs, head look-at, blink, breathing
  lesionSkin.ts           # child_skin shader patch: region hover + ILLUSTRATIVE lesion reveal
  cameraViews.ts          # Framings computed from model boxes + eased camera flight
  sceneRig.ts             # SceneRig interface shared by model and fallback
  AnatomyColliders.ts     # Procedural fallback rig
  LipSyncController.ts    # Audio amplitude -> mouth level (drives jawOpen)
  ExamFindingPanel.tsx    # Finding modal (text verbatim from case JSON via backend)
```

## Safety rules specific to the avatar
- The model carries no clinical data. Lesions are an illustrative procedural pattern, shown only for regions examined AND `documented === true`; never for unknown regions (Hard Rule 1). Label it "minh hoạ, chờ bác sĩ duyệt".
- Part `info` strings in the .glb contain authoring notes: show only `label` to learners.

## Raycasting Anatomy Regions (HFMD Specific)
The 4 primary examination regions for Hand, Foot, and Mouth Disease:
1. `palm_hands`: Lòng bàn tay (tổn thương dạng bóng nước, sẩn hồng ban).
2. `feet`: Lòng bàn chân và gót chân.
3. `mouth_throat`: Vòm họng, niêm mạc má, lưỡi (vết loét chợt đỏ, đau khi nuốt).
4. `buttocks_knees`: Vùng mông và đầu gối (sẩn đỏ đặc trưng ở trẻ nhỏ).

```typescript
// Sample Raycasting Handler
export function handlePointerDown(
  event: MouseEvent,
  camera: THREE.Camera,
  scene: THREE.Scene,
  onExamineRegion: (regionId: string) => void
) {
  const mouse = new THREE.Vector2(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);

  const colliders = scene.getObjectByName("ExamColliders")?.children || [];
  const intersects = raycaster.intersectObjects(colliders, true);

  if (intersects.length > 0) {
    const target = intersects[0].object;
    const regionId = target.userData?.regionId;
    if (regionId) {
      onExamineRegion(regionId);
    }
  }
}
```

## Lip-Sync Animation
- Read audio playback using HTML5 `AudioContext` and `AnalyserNode`.
- Calculate RMS volume per frame in `requestAnimationFrame`.
- Modulate the `morphTargetInfluences` for mouth open (`jawOpen` or `mouthOpen`) between `0.0` and `1.0`.

## Common Pitfalls
1. **SSR Hydration Failure:** Always wrap Three.js components with Next.js dynamic import `{ ssr: false }`.
2. **Memory Leaks:** Always dispose geometries, materials, and textures in `useEffect` cleanup return function.
3. **Raycast Misses:** Ensure collider meshes have `visible = true` (can set `material.transparent = true` and `material.opacity = 0` to keep them invisible to the eye but detectable by raycaster).

