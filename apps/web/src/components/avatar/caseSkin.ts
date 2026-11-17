import * as THREE from "three";
import { MAX_BOX, MAX_OV, MAX_REG, type SkinLayout } from "./caseScene";

/**
 * Shader patch for the `patient_skin` material of an avp-case-scene/1 model
 * (ported from the asset pack's reference demo, `patchSkin`).
 *
 * - A fragment belongs to region r when it lies in r's UV atlas cell (any cell
 *   when the region's `atlasCell` is -1) AND inside one of r's collider boxes.
 * - Hover: the hovered region glows warm.
 * - Overlays (petechiae, vesicles, focus, edge, tint) are ILLUSTRATIVE
 *   procedural layers, never clinical images. A region shows them only after
 *   it was examined AND the backend returned a documented finding
 *   (Hard Rule 1). `uExam[r]` eases 0 -> 1 so the layer fades in.
 *   TODO(clinician): replace with reviewed imagery per atlas cell.
 */

export type CaseSkinUniforms = {
  uHover: THREE.IUniform<number>;
  uTime: THREE.IUniform<number>;
  uExam: THREE.IUniform<number[]>;
  uCell: THREE.IUniform<number[]>;
  uBoxMin: THREE.IUniform<THREE.Vector4[]>;
  uBoxMax: THREE.IUniform<THREE.Vector3[]>;
  uOvA: THREE.IUniform<THREE.Vector4[]>;
  uOvB: THREE.IUniform<THREE.Vector4[]>;
  uOvC: THREE.IUniform<THREE.Vector4[]>;
  uOvD: THREE.IUniform<THREE.Vector3[]>;
  uOvCol: THREE.IUniform<THREE.Color[]>;
};

export function createCaseSkinUniforms(layout: SkinLayout): CaseSkinUniforms {
  const u: CaseSkinUniforms = {
    uHover: { value: -1 },
    uTime: { value: 0 },
    uExam: { value: new Array<number>(MAX_REG).fill(0) },
    uCell: { value: layout.cells.slice(0, MAX_REG) },
    // w = region slot; -1 = unused box.
    uBoxMin: { value: Array.from({ length: MAX_BOX }, () => new THREE.Vector4(1e9, 1e9, 1e9, -1)) },
    uBoxMax: { value: Array.from({ length: MAX_BOX }, () => new THREE.Vector3(-1e9, -1e9, -1e9)) },
    // type, region, p1, p2 (type 0 = unused)
    uOvA: { value: Array.from({ length: MAX_OV }, () => new THREE.Vector4(0, -1, 0, 0)) },
    // centre xyz, strength
    uOvB: { value: Array.from({ length: MAX_OV }, () => new THREE.Vector4()) },
    // axis xyz, dash
    uOvC: { value: Array.from({ length: MAX_OV }, () => new THREE.Vector4()) },
    // surface normal (edge)
    uOvD: { value: Array.from({ length: MAX_OV }, () => new THREE.Vector3(0, 1, 0)) },
    uOvCol: { value: Array.from({ length: MAX_OV }, () => new THREE.Color()) },
  };
  layout.boxes.slice(0, MAX_BOX).forEach((b, i) => {
    u.uBoxMin.value[i].set(b.min[0], b.min[1], b.min[2], b.region);
    u.uBoxMax.value[i].set(b.max[0], b.max[1], b.max[2]);
  });
  layout.overlays.slice(0, MAX_OV).forEach((o, i) => {
    u.uOvA.value[i].set(o.code, o.region, o.p1, o.p2);
    u.uOvB.value[i].set(o.centre[0], o.centre[1], o.centre[2], o.strength);
    u.uOvC.value[i].set(o.axis[0], o.axis[1], o.axis[2], o.dash);
    u.uOvD.value[i].set(o.normal[0], o.normal[1], o.normal[2]);
    u.uOvCol.value[i].set(o.color);
  });
  return u;
}

const HEADER = /* glsl */ `
#define AVP_MAX_REG ${MAX_REG}
#define AVP_MAX_BOX ${MAX_BOX}
#define AVP_MAX_OV ${MAX_OV}
uniform float uHover;
uniform float uTime;
uniform float uExam[AVP_MAX_REG];
uniform float uCell[AVP_MAX_REG];
uniform vec4 uBoxMin[AVP_MAX_BOX];
uniform vec3 uBoxMax[AVP_MAX_BOX];
uniform vec4 uOvA[AVP_MAX_OV];
uniform vec4 uOvB[AVP_MAX_OV];
uniform vec4 uOvC[AVP_MAX_OV];
uniform vec3 uOvD[AVP_MAX_OV];
uniform vec3 uOvCol[AVP_MAX_OV];
varying vec3 vAvpWorld;
float avpH21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// UV atlas 3 x 2, origin top-left: cell = column + 3 * row.
float avpCellOf(vec2 uv) { return floor(clamp(uv.x, 0.0, 0.999) * 3.0) + 3.0 * floor(clamp(uv.y, 0.0, 0.999) * 2.0); }
// bit r set = fragment lies in region r (its UV cell AND inside one of its collider boxes)
int avpRegionMask(float cell) {
  int m = 0;
  for (int i = 0; i < AVP_MAX_BOX; i++) {
    if (uBoxMin[i].w < -0.5) continue;
    int r = int(uBoxMin[i].w + 0.5);
    if (uCell[r] > -0.5 && abs(cell - uCell[r]) > 0.1) continue;
    vec3 lo = uBoxMin[i].xyz - 0.006;
    vec3 hi = uBoxMax[i] + 0.006;
    if (all(greaterThanEqual(vAvpWorld, lo)) && all(lessThanEqual(vAvpWorld, hi))) m |= 1 << r;
  }
  return m;
}
// Planar projection picked from the surface normal, so dots stay round on any limb orientation.
vec2 avpProj(vec3 p, vec3 n) { vec3 a = abs(n); return a.y > a.x && a.y > a.z ? p.xz : (a.x > a.z ? p.yz : p.xy); }
float avpDots(vec3 p, vec3 n, float scale, float density, float rad, float seed) {
  vec2 g = avpProj(p, n) * scale + seed;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float present = step(1.0 - density, avpH21(id));
  float d = length(f - (vec2(avpH21(id + 3.1), avpH21(id + 7.7)) - 0.5) * 0.5);
  return present * (1.0 - smoothstep(rad, rad + 0.06, d));
}
`;

const BODY = /* glsl */ `
{
  float avpCell = avpCellOf(vUv);
  int avpMask = avpRegionMask(avpCell);
  vec3 avpN = normalize(cross(dFdx(vAvpWorld), dFdy(vAvpWorld)));
  for (int k = 0; k < AVP_MAX_OV; k++) {
    if (uOvA[k].x < 0.5 || uOvA[k].y < -0.5) continue;
    int r = int(uOvA[k].y + 0.5);
    float shown = uExam[r];
    if (shown < 0.001 || ((avpMask >> r) & 1) == 0) continue;
    int t = int(uOvA[k].x + 0.5);
    vec3 col = uOvCol[k];
    float s = uOvB[k].w * shown;
    if (t == 1) {
      // petechiae: dense, tiny, flat red-purple dots
      float m = max(avpDots(vAvpWorld, avpN, uOvA[k].z, uOvA[k].w, 0.13, 0.0), avpDots(vAvpWorld, avpN, uOvA[k].z * 1.37, uOvA[k].w, 0.1, 5.3));
      diffuseColor.rgb = mix(diffuseColor.rgb, col, m * 0.85 * s);
    } else if (t == 2) {
      // macule + central vesicle (HFMD style)
      float m = avpDots(vAvpWorld, avpN, 70.0, 0.5, 0.2, 0.0);
      float v = avpDots(vAvpWorld, avpN, 70.0, 0.25, 0.07, 0.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, col, m * 0.9 * s);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.99, 0.95, 0.88), v * s);
    } else if (t == 3) {
      // focus: soft spot + pulsing ring around a landmark
      float d = distance(vAvpWorld, uOvB[k].xyz);
      float R = uOvA[k].z;
      float spot = 1.0 - smoothstep(0.0, R, d);
      float ring = 1.0 - smoothstep(0.0, uOvA[k].w, abs(d - R * (0.75 + 0.15 * sin(uTime * 3.0))));
      diffuseColor.rgb = mix(diffuseColor.rgb, col, clamp(spot * 0.45 + ring * 0.8, 0.0, 1.0) * s);
    } else if (t == 4) {
      // edge: (dashed) line through the landmark along an axis
      vec3 q = vAvpWorld - uOvB[k].xyz;
      vec3 ax = uOvC[k].xyz;
      vec3 nn = uOvD[k];
      float al = dot(q, ax);
      vec3 rr = q - al * ax;
      float perp = length(rr - dot(rr, nn) * nn);
      float band = (1.0 - smoothstep(uOvA[k].w * 0.6, uOvA[k].w, perp)) * step(abs(al), uOvA[k].z);
      float dash = uOvC[k].w > 0.0 ? step(0.45, fract(al * uOvC[k].w)) : 1.0;
      diffuseColor.rgb = mix(diffuseColor.rgb, col, band * dash * s);
    } else if (t == 5) {
      // tint (pallor, cyanosis, mottling...)
      diffuseColor.rgb = mix(diffuseColor.rgb, col, s);
    }
  }
  if (uHover > -0.5 && ((avpMask >> int(uHover + 0.5)) & 1) == 1)
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.8, 0.3), 0.4 + 0.15 * sin(uTime * 6.0));
}
`;

/** Patch a (cloned) `patient_skin` material in place. Uniforms are shared across its meshes. */
export function patchCaseSkin(material: THREE.MeshStandardMaterial, uniforms: CaseSkinUniforms): void {
  material.defines = { ...(material.defines ?? {}), USE_UV: "" };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vAvpWorld;")
      .replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvAvpWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${HEADER}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${BODY}`);
  };
  material.customProgramCacheKey = () => "avp-case-skin-v1";
  material.needsUpdate = true;
}
