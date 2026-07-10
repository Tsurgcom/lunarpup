import * as THREE from "three";

export type Crater = {
  x: number;
  z: number;
  radius: number;
  depth: number;
};

/** Hand-placed bowls — ride the walls like skate parks. */
export const CRATERS: Crater[] = [
  { x: 0, z: 0, radius: 18, depth: 7 },
  { x: 32, z: -8, radius: 12, depth: 5.5 },
  { x: -28, z: 18, radius: 14, depth: 6 },
  { x: 18, z: 30, radius: 10, depth: 4.5 },
  { x: -22, z: -26, radius: 11, depth: 5 },
  { x: 45, z: 22, radius: 8, depth: 3.5 },
  { x: -48, z: 5, radius: 9, depth: 4 },
];

const WORLD = 120;
const HALF = WORLD / 2;

function hash2(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash2(x0, z0);
  const b = hash2(x0 + 1, z0);
  const c = hash2(x0, z0 + 1);
  const d = hash2(x0 + 1, z0 + 1);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(a, b, u),
    THREE.MathUtils.lerp(c, d, u),
    v,
  );
}

function fbm(x: number, z: number): number {
  let value = 0;
  let amp = 0.55;
  let freq = 1;
  for (let i = 0; i < 4; i++) {
    value += smoothNoise(x * freq, z * freq) * amp;
    amp *= 0.5;
    freq *= 2.05;
  }
  return value;
}

/** Smooth bowl profile: flat floor, steep transition, soft lip. */
function craterDelta(crater: Crater, x: number, z: number): number {
  const dx = x - crater.x;
  const dz = z - crater.z;
  const dist = Math.hypot(dx, dz);
  if (dist >= crater.radius) return 0;

  const t = dist / crater.radius;
  // Cosine bowl — classic skate-bowl cross section
  const bowl = 0.5 * (1 + Math.cos(Math.PI * Math.min(t, 1)));
  // Soften the lip so you can roll in/out
  const lip = THREE.MathUtils.smoothstep(0.72, 1, t);
  return -crater.depth * bowl * (1 - lip * 0.35);
}

export function sampleHeight(x: number, z: number): number {
  const nx = THREE.MathUtils.clamp(x, -HALF + 1, HALF - 1);
  const nz = THREE.MathUtils.clamp(z, -HALF + 1, HALF - 1);
  let y = fbm(nx * 0.045, nz * 0.045) * 1.8 - 0.4;
  y += fbm(nx * 0.12, nz * 0.12) * 0.35;

  for (const crater of CRATERS) {
    y += craterDelta(crater, nx, nz);
  }
  return y;
}

const _n = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export function sampleNormal(
  x: number,
  z: number,
  out = _n,
  eps = 0.35,
): THREE.Vector3 {
  const hL = sampleHeight(x - eps, z);
  const hR = sampleHeight(x + eps, z);
  const hD = sampleHeight(x, z - eps);
  const hU = sampleHeight(x, z + eps);
  _a.set(2 * eps, hR - hL, 0);
  _b.set(0, hU - hD, 2 * eps);
  return out.crossVectors(_b, _a).normalize();
}

export function createMoonGeometry(segments = 180): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  if (!pos) throw new Error("missing position attribute");

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, sampleHeight(x, z));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export const WORLD_SIZE = WORLD;
