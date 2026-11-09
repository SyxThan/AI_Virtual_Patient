---
name: avatar-3d
description: Use when building, debugging, or extending the 3D avatar, Three.js canvas, raycasting examination, or basic lip-sync in the Clinical Workspace (`apps/web/src/components/avatar/`).
---

# Avatar 3D, Raycasting & Lip-Sync Skill

Guidance for implementing the Three.js 3D avatar (Mother holding child) and interactive physical examination via raycasting in the Clinical Workspace.

## Stack & Conventions
- **Engine:** Three.js (`three`, `@types/three`).
- **Integration:** React client component loaded via `dynamic(() => import(...), { ssr: false })` to prevent SSR window errors.
- **Model Format:** `.glb` / `.gltf` loaded via `GLTFLoader`. When 3D assets are pending, provide a stylized low-poly procedural rig fallback with matching mesh colliders.
- **Coordinate Space:** Normalized units, centered at `(0, 0, 0)`, camera at `(0, 1.2, 2.5)` with `OrbitControls` limited to front and side view (preventing flipping behind the wall).

## Directory Structure
```
apps/web/src/components/avatar/
  AvatarCanvas.tsx        # Main Three.js Canvas container (SSR disabled)
  ModelLoader.ts          # GLTFLoader with caching and procedural fallback
  RaycastExam.tsx         # Raycasting event handler for physical exam regions
  LipSyncController.ts    # Audio amplitude to mouth blend-shape / jaw bone mapping
  AnatomyColliders.ts     # Definition of exam target meshes
```

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

