import * as THREE from "three";
import type { PerfSettings } from "./performanceTiers";

/** Dusty ash highlands — warm-gray, not cream. */
const HIGHLAND = { r: 0.74, g: 0.72, b: 0.68 };
/** Cool charcoal mare. */
const MARE = { r: 0.4, g: 0.41, b: 0.46 };
/** Soft pale ejecta crest. */
const RIM_CREST = { r: 0.9, g: 0.89, b: 0.86 };
/** Darker inner wall under the lip. */
const INNER_WALL = { r: 0.36, g: 0.35, b: 0.38 };
/** Deep bowl floor — cool charcoal so depth reads at a glance. */
const ABYSS = { r: 0.16, g: 0.16, b: 0.2 };
/** Mid-depth cavity — dusty slate. */
const CAVITY = { r: 0.3, g: 0.3, b: 0.34 };

/** ≈ MOON_RADIUS * 0.028 — blotch scale in unit-sphere space. */
const NOISE_FREQ = 8.6;

type MoonShaderUniforms = {
  uDetail: { value: number };
  uRim: { value: number };
  uBowlAo: { value: number };
};

const moonUniforms = new WeakMap<
  THREE.MeshStandardMaterial,
  MoonShaderUniforms
>();

function hash3(x: number, y: number, z: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function moonNoise(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);

  const n000 = hash3(ix, iy, iz);
  const n100 = hash3(ix + 1, iy, iz);
  const n010 = hash3(ix, iy + 1, iz);
  const n110 = hash3(ix + 1, iy + 1, iz);
  const n001 = hash3(ix, iy, iz + 1);
  const n101 = hash3(ix + 1, iy, iz + 1);
  const n011 = hash3(ix, iy + 1, iz + 1);
  const n111 = hash3(ix + 1, iy + 1, iz + 1);

  const x00 = THREE.MathUtils.lerp(n000, n100, u);
  const x10 = THREE.MathUtils.lerp(n010, n110, u);
  const x01 = THREE.MathUtils.lerp(n001, n101, u);
  const x11 = THREE.MathUtils.lerp(n011, n111, u);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(x00, x10, v),
    THREE.MathUtils.lerp(x01, x11, v),
    w,
  );
}

/**
 * Bake dusty mare/highland + depth / rim cues into a vertex color.
 * `elev` is radial height offset (negative = crater floor).
 */
export function writeMoonVertexColor(
  dir: THREE.Vector3,
  elev: number,
  slope: number,
  colors: Float32Array,
  offset: number,
): void {
  const blotch = moonNoise(
    dir.x * NOISE_FREQ,
    dir.y * NOISE_FREQ,
    dir.z * NOISE_FREQ,
  );
  let mare = THREE.MathUtils.smoothstep(1.6, -6.0, elev);
  mare = THREE.MathUtils.clamp(mare + (blotch - 0.5) * 0.28, 0, 1);

  let r = THREE.MathUtils.lerp(HIGHLAND.r, MARE.r, mare);
  let g = THREE.MathUtils.lerp(HIGHLAND.g, MARE.g, mare);
  let b = THREE.MathUtils.lerp(HIGHLAND.b, MARE.b, mare);

  // Depth bands — shallow cavity → deep abyss so bowls read as chasms.
  const midDepth = THREE.MathUtils.smoothstep(-1.5, -7.0, elev);
  const deepDepth = THREE.MathUtils.smoothstep(-6.0, -14.0, elev);
  r = THREE.MathUtils.lerp(r, CAVITY.r, midDepth * 0.75);
  g = THREE.MathUtils.lerp(g, CAVITY.g, midDepth * 0.75);
  b = THREE.MathUtils.lerp(b, CAVITY.b, midDepth * 0.75);
  r = THREE.MathUtils.lerp(r, ABYSS.r, deepDepth * 0.85);
  g = THREE.MathUtils.lerp(g, ABYSS.g, deepDepth * 0.85);
  b = THREE.MathUtils.lerp(b, ABYSS.b, deepDepth * 0.85);

  const rimCrest =
    THREE.MathUtils.smoothstep(0.1, 0.45, slope) *
    THREE.MathUtils.smoothstep(-0.4, 1.6, elev) *
    (1 - THREE.MathUtils.smoothstep(2.2, 4.5, elev));
  const crestAmt = rimCrest * 0.78;
  r = THREE.MathUtils.lerp(r, RIM_CREST.r, crestAmt);
  g = THREE.MathUtils.lerp(g, RIM_CREST.g, crestAmt);
  b = THREE.MathUtils.lerp(b, RIM_CREST.b, crestAmt);

  const innerLip =
    THREE.MathUtils.smoothstep(0.16, 0.55, slope) *
    THREE.MathUtils.smoothstep(0.5, -4.0, elev) *
    (1 - rimCrest);
  const lipAmt = innerLip * 0.6;
  r = THREE.MathUtils.lerp(r, INNER_WALL.r, lipAmt);
  g = THREE.MathUtils.lerp(g, INNER_WALL.g, lipAmt);
  b = THREE.MathUtils.lerp(b, INNER_WALL.b, lipAmt);

  const apron =
    THREE.MathUtils.smoothstep(0.05, 0.7, elev) *
    (1 - THREE.MathUtils.smoothstep(0.35, 0.7, slope)) *
    (1 - mare);
  const apronAmt = apron * 0.22;
  r = THREE.MathUtils.lerp(r, RIM_CREST.r, apronAmt);
  g = THREE.MathUtils.lerp(g, RIM_CREST.g, apronAmt);
  b = THREE.MathUtils.lerp(b, RIM_CREST.b, apronAmt);

  // Extra cavity darkening so floors drop away visually under lighting.
  const inBowl = THREE.MathUtils.smoothstep(0.5, -10.0, elev);
  const cavity = THREE.MathUtils.lerp(1, 0.62, inBowl);
  colors[offset] = r * cavity;
  colors[offset + 1] = g * cavity;
  colors[offset + 2] = b * cavity;
}

const DETAIL_BY_TIER = [0, 0.5, 0.9, 1] as const;
const RIM_BY_TIER = [0.08, 0.12, 0.16, 0.2] as const;
const BOWL_AO_BY_TIER = [0.14, 0.2, 0.26, 0.32] as const;

/**
 * Matte Standard material with baked vertex colors + GPU regolith grit.
 * Uses onBeforeCompile so fog / shadows keep working.
 */
export function createMoonMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    flatShading: false,
    fog: true,
    vertexColors: true,
    metalness: 0,
    roughness: 1,
  });

  const uniforms: MoonShaderUniforms = {
    uDetail: { value: DETAIL_BY_TIER[0]! },
    uRim: { value: RIM_BY_TIER[0]! },
    uBowlAo: { value: BOWL_AO_BY_TIER[0]! },
  };
  moonUniforms.set(material, uniforms);

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = uniforms.uDetail;
    shader.uniforms.uRim = uniforms.uRim;
    shader.uniforms.uBowlAo = uniforms.uBowlAo;

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vMoonWorldPos;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vMoonWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uDetail;
uniform float uRim;
uniform float uBowlAo;
varying vec3 vMoonWorldPos;

float moonHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float moonValueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = moonHash(i);
  float n100 = moonHash(i + vec3(1.0, 0.0, 0.0));
  float n010 = moonHash(i + vec3(0.0, 1.0, 0.0));
  float n110 = moonHash(i + vec3(1.0, 1.0, 0.0));
  float n001 = moonHash(i + vec3(0.0, 0.0, 1.0));
  float n101 = moonHash(i + vec3(1.0, 0.0, 1.0));
  float n011 = moonHash(i + vec3(0.0, 1.0, 1.0));
  float n111 = moonHash(i + vec3(1.0, 1.0, 1.0));
  float x00 = mix(n000, n100, u.x);
  float x10 = mix(n010, n110, u.x);
  float x01 = mix(n001, n101, u.x);
  float x11 = mix(n011, n111, u.x);
  return mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z);
}
`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
{
  vec3 radial = normalize(vMoonWorldPos);
  float facing = clamp(dot(normal, radial), 0.0, 1.0);
  // Soft bowl AO — floors tip away from radial and read deeper.
  float bowl = 1.0 - facing;
  diffuseColor.rgb *= 1.0 - bowl * uBowlAo;

  if (uDetail > 1e-4) {
    vec3 p = radial * 72.0;
    float n0 = moonValueNoise(p);
    float n1 = moonValueNoise(p * 2.17 + 3.1);
    float grit = (n0 * 0.65 + n1 * 0.35) * 2.0 - 1.0;
    // Cheap spherical micro-normal — denser look without more tris.
    vec3 micro = normalize(radial + vec3(
      grit * 0.35,
      moonValueNoise(p.yzx * 1.3) * 0.35 - 0.175,
      moonValueNoise(p.zxy * 1.7) * 0.35 - 0.175
    ));
    normal = normalize(mix(normal, micro, uDetail * 0.55));
    // Regolith grit — tiny albedo break-up, not shiny sparkle.
    diffuseColor.rgb += grit * uDetail * 0.03;
  }

  // Soft earthshine limb so the sphere silhouette stays readable in space.
  float rim = pow(1.0 - facing, 2.4) * uRim;
  diffuseColor.rgb += vec3(0.42, 0.5, 0.62) * rim;
}
`,
      );
  };

  material.customProgramCacheKey = () => "moon-terrain-v2";
  return material;
}

/** Push tier-aware detail uniforms (no material rebuild). */
export function syncMoonMaterialTier(
  material: THREE.MeshStandardMaterial,
  perf: PerfSettings,
): void {
  const uniforms = moonUniforms.get(material);
  if (!uniforms) return;
  const t = Math.min(3, Math.max(0, perf.tier)) as 0 | 1 | 2 | 3;
  uniforms.uDetail.value = DETAIL_BY_TIER[t]!;
  uniforms.uRim.value = RIM_BY_TIER[t]!;
  uniforms.uBowlAo.value = BOWL_AO_BY_TIER[t]!;
}
