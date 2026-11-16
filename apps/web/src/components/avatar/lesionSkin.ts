import * as THREE from "three";

/**
 * Shader patch for the child's `child_skin` material (contract §5–6).
 *
 * - Hover: the region under the pointer (or the focused exam button) glows warm.
 * - Lesion layer: an ILLUSTRATIVE procedural pattern, never a clinical image.
 *   A region shows it only after it was examined AND the case documents a
 *   finding there (`documented === true` from the backend, Hard Rule 1).
 *   `uReveal[i]` animates 0 -> 1 so spots grow in instead of popping.
 *   TODO(clinician): replace the pattern with reviewed lesion textures.
 *
 * The region of a fragment is its UV atlas cell, cut by the world-space box of
 * that region's collider so e.g. the atlas "legs" cell only paints the knees.
 */

export type SkinUniforms = {
  uHover: THREE.IUniform<number>;
  uReveal: THREE.IUniform<THREE.Vector4>;
  uTime: THREE.IUniform<number>;
  uBoxMin: THREE.IUniform<THREE.Vector3[]>;
  uBoxMax: THREE.IUniform<THREE.Vector3[]>;
};

export function createSkinUniforms(): SkinUniforms {
  return {
    uHover: { value: -1 },
    uReveal: { value: new THREE.Vector4(0, 0, 0, 0) },
    uTime: { value: 0 },
    // Empty boxes (min > max) paint nothing until the colliders are measured.
    uBoxMin: { value: [0, 1, 2, 3].map(() => new THREE.Vector3(1e9, 1e9, 1e9)) },
    uBoxMax: { value: [0, 1, 2, 3].map(() => new THREE.Vector3(-1e9, -1e9, -1e9)) },
  };
}

const FRAGMENT_HEADER = /* glsl */ `
uniform float uHover;
uniform vec4 uReveal;
uniform float uTime;
uniform vec3 uBoxMin[4];
uniform vec3 uBoxMax[4];
varying vec3 vSkinWorld;
float avpHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// UV atlas 3 x 2, origin top-left: row 0 = hands | feet | head ; row 1 = knees | - | arms
float avpRegion(vec2 uv) {
  float c = floor(clamp(uv.x, 0.0, 0.999) * 3.0);
  float r = floor(clamp(uv.y, 0.0, 0.999) * 2.0);
  if (r < 0.5) return c;
  return c < 0.5 ? 3.0 : -1.0;
}
bool avpInBox(int i) {
  vec3 lo = uBoxMin[i] - 0.006;
  vec3 hi = uBoxMax[i] + 0.006;
  return all(greaterThanEqual(vSkinWorld, lo)) && all(lessThanEqual(vSkinWorld, hi));
}
`;

const FRAGMENT_BODY = /* glsl */ `
{
  float avpReg = avpRegion(vUv);
  int avpI = int(avpReg + 0.5);
  if (avpReg > -0.5 && avpInBox(avpI)) {
    float reveal = avpI == 0 ? uReveal.x : avpI == 1 ? uReveal.y : avpI == 2 ? uReveal.z : uReveal.w;
    if (reveal > 0.001) {
      // Illustrative only: red macules, some with a pale vesicle centre.
      vec2 g = vSkinWorld.xy * 70.0 + vSkinWorld.z * 29.0;
      vec2 cell = floor(g);
      vec2 f = fract(g) - 0.5;
      float seed = avpHash(cell);
      float present = step(1.0 - 0.5 * reveal, seed);
      float d = length(f - (vec2(avpHash(cell + 3.1), avpHash(cell + 7.7)) - 0.5) * 0.4);
      float grow = smoothstep(0.0, 1.0, reveal);
      float macule = present * (1.0 - smoothstep(0.2 * grow, 0.32 * grow, d));
      float vesicle = present * step(0.5, avpHash(cell + 1.3)) * (1.0 - smoothstep(0.07 * grow, 0.12 * grow, d));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.2, 0.22), macule * 0.9);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.99, 0.95, 0.88), vesicle);
    }
    if (abs(avpReg - uHover) < 0.1)
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.82, 0.36), 0.38 + 0.12 * sin(uTime * 6.0));
  }
}
`;

/** Patch a (cloned) `child_skin` material in place. Uniforms are shared across its meshes. */
export function patchChildSkin(material: THREE.MeshStandardMaterial, uniforms: SkinUniforms): void {
  material.defines = { ...(material.defines ?? {}), USE_UV: "" };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSkinWorld;")
      .replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvSkinWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_HEADER}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${FRAGMENT_BODY}`);
  };
  // Distinct program cache key: the patched shader must not be shared with plain materials.
  material.customProgramCacheKey = () => "avp-child-skin-v1";
  material.needsUpdate = true;
}
