import * as THREE from "three";

/** Cream highlands. */
const HIGHLAND = { r: 0.93, g: 0.86, b: 0.74 };
/** Lilac mare. */
const MARE = { r: 0.58, g: 0.54, b: 0.68 };
/** Bright ejecta crest. */
const RIM_CREST = { r: 1.0, g: 0.96, b: 0.9 };
/** Darker inner wall under the lip. */
const INNER_WALL = { r: 0.48, g: 0.44, b: 0.55 };

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
 * Bake pastel mare/highland (+ soft rim cues) into a vertex color.
 * Matches the old fragment shader look at facet resolution.
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
  let mare = THREE.MathUtils.smoothstep(1.4, -3.2, elev);
  mare = THREE.MathUtils.clamp(mare + (blotch - 0.5) * 0.28, 0, 1);

  let r = THREE.MathUtils.lerp(HIGHLAND.r, MARE.r, mare);
  let g = THREE.MathUtils.lerp(HIGHLAND.g, MARE.g, mare);
  let b = THREE.MathUtils.lerp(HIGHLAND.b, MARE.b, mare);

  const rimCrest =
    THREE.MathUtils.smoothstep(0.12, 0.42, slope) *
    THREE.MathUtils.smoothstep(-0.15, 1.35, elev) *
    (1 - THREE.MathUtils.smoothstep(2.4, 4.0, elev));
  const crestAmt = rimCrest * 0.72;
  r = THREE.MathUtils.lerp(r, RIM_CREST.r, crestAmt);
  g = THREE.MathUtils.lerp(g, RIM_CREST.g, crestAmt);
  b = THREE.MathUtils.lerp(b, RIM_CREST.b, crestAmt);

  const innerLip =
    THREE.MathUtils.smoothstep(0.18, 0.52, slope) *
    THREE.MathUtils.smoothstep(0.9, -1.8, elev) *
    (1 - rimCrest);
  const lipAmt = innerLip * 0.55;
  r = THREE.MathUtils.lerp(r, INNER_WALL.r, lipAmt);
  g = THREE.MathUtils.lerp(g, INNER_WALL.g, lipAmt);
  b = THREE.MathUtils.lerp(b, INNER_WALL.b, lipAmt);

  const apron =
    THREE.MathUtils.smoothstep(0.05, 0.55, elev) *
    (1 - THREE.MathUtils.smoothstep(0.35, 0.7, slope)) *
    (1 - mare);
  const apronAmt = apron * 0.22;
  r = THREE.MathUtils.lerp(r, RIM_CREST.r, apronAmt);
  g = THREE.MathUtils.lerp(g, RIM_CREST.g, apronAmt);
  b = THREE.MathUtils.lerp(b, RIM_CREST.b, apronAmt);

  // Soft cavity darkening in bowls (was lighting-side in the old shader).
  const inBowl = THREE.MathUtils.smoothstep(1.2, -4.5, elev);
  const cavity = THREE.MathUtils.lerp(1, 0.78, inBowl);
  colors[offset] = r * cavity;
  colors[offset + 1] = g * cavity;
  colors[offset + 2] = b * cavity;
}

/**
 * Lit Standard material with baked vertex colors — v1-style lighting response.
 */
export function createMoonMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: "#ffffff",
    flatShading: false,
    fog: true,
    vertexColors: true,
    metalness: 0.02,
    roughness: 0.82,
  });
}
