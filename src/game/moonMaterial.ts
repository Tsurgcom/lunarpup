import * as THREE from "three";

/** Cream highlands. */
const HIGHLAND = { r: 0.93, g: 0.86, b: 0.74 };
/** Lilac mare. */
const MARE = { r: 0.58, g: 0.54, b: 0.68 };
/** Bright ejecta crest. */
const RIM_CREST = { r: 1.0, g: 0.96, b: 0.9 };
/** Darker inner wall under the lip. */
const INNER_WALL = { r: 0.48, g: 0.44, b: 0.55 };
/** Deep bowl floor — cool indigo so depth reads at a glance. */
const ABYSS = { r: 0.22, g: 0.2, b: 0.34 };
/** Mid-depth cavity — dusty violet. */
const CAVITY = { r: 0.38, g: 0.34, b: 0.48 };

/** ≈ MOON_RADIUS * 0.028 — blotch scale in unit-sphere space. */
const NOISE_FREQ = 8.6;

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
 * Bake pastel mare/highland + depth / rim cues into a vertex color.
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

/**
 * Lit Standard material with baked vertex colors — soft lunar response.
 */
export function createMoonMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: "#ffffff",
    flatShading: false,
    fog: true,
    vertexColors: true,
    metalness: 0.02,
    roughness: 0.84,
  });
}
