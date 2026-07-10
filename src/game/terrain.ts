import * as THREE from "three";

export type Crater = {
  x: number;
  z: number;
  radius: number;
  depth: number;
};

/** A height contribution sampled at world XZ. Generators compose additively. */
export type TerrainGenerator = {
  readonly name: string;
  sample(x: number, z: number): number;
};

/** Hand-placed skate bowls near spawn — always present. */
export const ANCHOR_CRATERS: Crater[] = [
  { x: 0, z: 0, radius: 18, depth: 7 },
  { x: 32, z: -8, radius: 12, depth: 5.5 },
  { x: -28, z: 18, radius: 14, depth: 6 },
  { x: 18, z: 30, radius: 10, depth: 4.5 },
  { x: -22, z: -26, radius: 11, depth: 5 },
];

/** @deprecated Prefer ANCHOR_CRATERS — kept for call-site compatibility. */
export const CRATERS = ANCHOR_CRATERS;

/** Chunk edge length in world units. */
export const CHUNK_SIZE = 48;

/** Finite moon extent in chunks along each axis (toroidal wrap). */
export const MOON_CHUNKS = 10;

/** World edge length — surface loops at this period. */
export const MOON_SIZE = CHUNK_SIZE * MOON_CHUNKS;

export const MOON_HALF = MOON_SIZE / 2;

/**
 * Visual horizon drop radius. Tuned so the finite moon still reads as gently
 * rounded without making the skate plane look like a marble.
 */
export const CURVATURE_RADIUS = MOON_SIZE * 1.15;

/** How many chunks out from the viewer to keep loaded. */
export const CHUNK_RADIUS = 2;

const CRATER_CELL = 48;
const MICRO_CELL = 16;
const SPAWN_CLEAR_R = 24;
const GLOBE_HEIGHT_SCALE = 0.045;

/** Wrap into [-MOON_HALF, MOON_HALF). */
export function wrapCoord(v: number): number {
  return ((((v + MOON_HALF) % MOON_SIZE) + MOON_SIZE) % MOON_SIZE) - MOON_HALF;
}

/** Shortest signed delta on the toroidal moon surface. */
export function wrapDelta(a: number, b: number): number {
  let d = a - b;
  d -= MOON_SIZE * Math.round(d / MOON_SIZE);
  return d;
}

/** Map a value onto the image nearest to `around` (for seamless remote pups). */
export function unwrapToward(value: number, around: number): number {
  return around + wrapDelta(value, around);
}

export function wrapChunk(c: number): number {
  return ((c % MOON_CHUNKS) + MOON_CHUNKS) % MOON_CHUNKS;
}

function hash2(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Periodic lattice hash so mare noise tiles with the moon. */
function hash2Periodic(ix: number, iz: number, period: number): number {
  const p = Math.max(1, period | 0);
  const wx = ((ix % p) + p) % p;
  const wz = ((iz % p) + p) % p;
  return hash2(wx, wz);
}

function smoothNoisePeriodic(x: number, z: number, period: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash2Periodic(x0, z0, period);
  const b = hash2Periodic(x0 + 1, z0, period);
  const c = hash2Periodic(x0, z0 + 1, period);
  const d = hash2Periodic(x0 + 1, z0 + 1, period);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(a, b, u),
    THREE.MathUtils.lerp(c, d, u),
    v,
  );
}

function fbmPeriodic(x: number, z: number, scale: number, octaves = 4): number {
  let value = 0;
  let amp = 0.55;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    const s = scale * freq;
    const period = Math.max(1, Math.round(MOON_SIZE * s));
    value += smoothNoisePeriodic(x * s, z * s, period) * amp;
    amp *= 0.5;
    freq *= 2.05;
  }
  return value;
}

/** Smooth bowl profile with toroidal distance so edge bowls wrap cleanly. */
export function craterDelta(crater: Crater, x: number, z: number): number {
  const dx = wrapDelta(x, crater.x);
  const dz = wrapDelta(z, crater.z);
  const dist = Math.hypot(dx, dz);
  if (dist >= crater.radius) return 0;

  const t = dist / crater.radius;
  const bowl = 0.5 * (1 + Math.cos(Math.PI * Math.min(t, 1)));
  const lip = THREE.MathUtils.smoothstep(0.72, 1, t);
  return -crater.depth * bowl * (1 - lip * 0.35);
}

/** Broad mare undulation — tiles with the finite moon. */
export const mareUndulation: TerrainGenerator = {
  name: "mareUndulation",
  sample(x, z) {
    return fbmPeriodic(x, z, 0.045) * 1.8 - 0.4;
  },
};

/** Fine regolith grit on top of the mare. */
export const regolithDetail: TerrainGenerator = {
  name: "regolithDetail",
  sample(x, z) {
    return fbmPeriodic(x, z, 0.12, 3) * 0.35;
  },
};

/** Fixed skate-park bowls around the origin. */
export const anchorBowls: TerrainGenerator = {
  name: "anchorBowls",
  sample(x, z) {
    let y = 0;
    for (const crater of ANCHOR_CRATERS) {
      y += craterDelta(crater, x, z);
    }
    return y;
  },
};

function wrapCellIndex(i: number, cellSize: number): number {
  const count = Math.round(MOON_SIZE / cellSize);
  return ((i % count) + count) % count;
}

function cellCraterContribution(
  cellX: number,
  cellZ: number,
  x: number,
  z: number,
): number {
  const ix = wrapCellIndex(cellX, CRATER_CELL);
  const iz = wrapCellIndex(cellZ, CRATER_CELL);
  const roll = hash2(ix * 3.1, iz * 7.7);
  const count = roll < 0.28 ? 0 : roll < 0.72 ? 1 : 2;
  let y = 0;

  for (let i = 0; i < count; i++) {
    const h1 = hash2(ix * 13.3 + i * 7.1, iz * 17.9 + i);
    const h2 = hash2(ix * 19.7 + i, iz * 23.1 + i * 3.3);
    const h3 = hash2(ix + i * 31.1, iz * 41.3 + i);
    const h4 = hash2(ix * 53.9 + i, iz + i * 59.7);

    const crater: Crater = {
      x: wrapCoord((ix + 0.18 + h1 * 0.64) * CRATER_CELL - MOON_HALF),
      z: wrapCoord((iz + 0.18 + h2 * 0.64) * CRATER_CELL - MOON_HALF),
      radius: 6.5 + h3 * 11,
      depth: 2.8 + h4 * 4.2,
    };

    if (
      Math.hypot(wrapDelta(crater.x, 0), wrapDelta(crater.z, 0)) <
      SPAWN_CLEAR_R + crater.radius * 0.35
    ) {
      continue;
    }

    y += craterDelta(crater, x, z);
  }

  return y;
}

/**
 * Spatially hashed crater field on the finite moon. Neighbor cells wrap so
 * bowls can straddle the seam.
 */
export const craterField: TerrainGenerator = {
  name: "craterField",
  sample(x, z) {
    const cx = Math.floor((x + MOON_HALF) / CRATER_CELL);
    const cz = Math.floor((z + MOON_HALF) / CRATER_CELL);
    let y = 0;
    for (let iz = cz - 1; iz <= cz + 1; iz++) {
      for (let ix = cx - 1; ix <= cx + 1; ix++) {
        y += cellCraterContribution(ix, iz, x, z);
      }
    }
    return y;
  },
};

/** Soft secondary dimples — smaller pits between major craters. */
export const microCraters: TerrainGenerator = {
  name: "microCraters",
  sample(x, z) {
    const cx = Math.floor((x + MOON_HALF) / MICRO_CELL);
    const cz = Math.floor((z + MOON_HALF) / MICRO_CELL);
    let y = 0;
    for (let iz = cz - 1; iz <= cz + 1; iz++) {
      for (let ix = cx - 1; ix <= cx + 1; ix++) {
        const wx = wrapCellIndex(ix, MICRO_CELL);
        const wz = wrapCellIndex(iz, MICRO_CELL);
        const h = hash2(wx * 91.7, wz * 53.3);
        if (h < 0.55) continue;
        const crater: Crater = {
          x: wrapCoord((wx + 0.25 + hash2(wx, wz + 4) * 0.5) * MICRO_CELL - MOON_HALF),
          z: wrapCoord((wz + 0.25 + hash2(wx + 9, wz) * 0.5) * MICRO_CELL - MOON_HALF),
          radius: 1.8 + hash2(wx * 2, wz * 5) * 2.4,
          depth: 0.35 + hash2(wx * 3, wz * 7) * 0.55,
        };
        if (Math.hypot(wrapDelta(crater.x, 0), wrapDelta(crater.z, 0)) < 16) {
          continue;
        }
        y += craterDelta(crater, x, z);
      }
    }
    return y;
  },
};

/** Active generator stack for the lunar surface. */
export const LUNAR_GENERATORS: readonly TerrainGenerator[] = [
  mareUndulation,
  regolithDetail,
  anchorBowls,
  craterField,
  microCraters,
];

/**
 * Finite toroidal heightfield — inputs wrap; generators see canonical coords.
 */
export function sampleHeight(x: number, z: number): number {
  const wx = wrapCoord(x);
  const wz = wrapCoord(z);
  let y = 0;
  for (const gen of LUNAR_GENERATORS) {
    y += gen.sample(wx, wz);
  }
  return y;
}

/**
 * Visual-only planetary curvature: drops the horizon away from the viewer.
 * Uses toroidal deltas so the seam does not crease the skyline.
 */
export function curvatureDrop(
  x: number,
  z: number,
  viewerX: number,
  viewerZ: number,
  radius = CURVATURE_RADIUS,
): number {
  const dx = wrapDelta(x, viewerX);
  const dz = wrapDelta(z, viewerZ);
  return (dx * dx + dz * dz) / (2 * radius);
}

/** Match a physics height to the curved terrain the camera sees. */
export function curvedSurfaceY(
  x: number,
  z: number,
  y: number,
  viewerX: number,
  viewerZ: number,
): number {
  return y - curvatureDrop(x, z, viewerX, viewerZ);
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

/** Canonical chunk index in [0, MOON_CHUNKS) for a world X (or Z) coordinate. */
export function chunkIndexFromWorld(v: number): number {
  return wrapChunk(Math.floor((wrapCoord(v) + MOON_HALF) / CHUNK_SIZE));
}

/**
 * World-space center of a chunk slot. `slot` may be outside [0, MOON_CHUNKS)
 * for wrap-around ghost tiles placed beside the viewer.
 */
export function chunkOrigin(slotX: number, slotZ: number): {
  x: number;
  z: number;
} {
  return {
    x: -MOON_HALF + (slotX + 0.5) * CHUNK_SIZE,
    z: -MOON_HALF + (slotZ + 0.5) * CHUNK_SIZE,
  };
}

/**
 * Build a heightfield tile for a canonical chunk (0..MOON_CHUNKS-1).
 * Ghost placements reuse this geometry at offset origins.
 */
export function createChunkGeometry(
  logicalX: number,
  logicalZ: number,
  segments = 40,
): THREE.BufferGeometry {
  const lx = wrapChunk(logicalX);
  const lz = wrapChunk(logicalZ);
  const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const { x: ox, z: oz } = chunkOrigin(lx, lz);
  const pos = geo.attributes.position;
  if (!pos) throw new Error("missing position attribute");

  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + ox;
    const wz = pos.getZ(i) + oz;
    pos.setY(i, sampleHeight(wx, wz));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

const _dir = new THREE.Vector3();

/** Square chart UV in [0, 1]² for the finite moon. */
export function worldToMapUv(
  x: number,
  z: number,
): { u: number; v: number } {
  return {
    u: (wrapCoord(x) + MOON_HALF) / MOON_SIZE,
    v: (wrapCoord(z) + MOON_HALF) / MOON_SIZE,
  };
}

export function mapUvToWorld(u: number, v: number): { x: number; z: number } {
  const uu = ((u % 1) + 1) % 1;
  const vv = ((v % 1) + 1) % 1;
  return {
    x: wrapCoord(uu * MOON_SIZE - MOON_HALF),
    z: wrapCoord(vv * MOON_SIZE - MOON_HALF),
  };
}

/** Lon/lat chart: X → longitude, Z → latitude. */
export function worldToLonLat(
  x: number,
  z: number,
): { lon: number; lat: number } {
  const { u, v } = worldToMapUv(x, z);
  return {
    lon: u * Math.PI * 2 - Math.PI,
    lat: v * Math.PI - Math.PI / 2,
  };
}

export function lonLatToWorld(
  lon: number,
  lat: number,
): { x: number; z: number } {
  const u = (lon + Math.PI) / (Math.PI * 2);
  const v = (lat + Math.PI / 2) / Math.PI;
  return mapUvToWorld(u, v);
}

/**
 * World XZ → HUD globe. Longitude wraps continuously (date line); circling
 * the south pole stays smooth. Crossing the Z wrap still jumps south↔north —
 * a torus cannot embed continuously in a sphere.
 */
export function worldToGlobe(
  x: number,
  z: number,
  radius: number,
  out = new THREE.Vector3(),
  heightScale = GLOBE_HEIGHT_SCALE,
): THREE.Vector3 {
  const { lon, lat } = worldToLonLat(x, z);
  const cy = Math.cos(lat);
  out.set(Math.sin(lon) * cy, Math.sin(lat), Math.cos(lon) * cy);
  const h = sampleHeight(x, z);
  return out.multiplyScalar(radius + h * heightScale);
}

export function globeHitToWorld(
  point: THREE.Vector3,
): { x: number; z: number } | null {
  const len = point.length();
  if (len < 1e-6) return null;
  const y = THREE.MathUtils.clamp(point.y / len, -1, 1);
  const lat = Math.asin(y);
  const lon = Math.atan2(point.x, point.z);
  return lonLatToWorld(lon, lat);
}

/**
 * Displaced sphere for the HUD map. Equirectangular XZ→lon/lat so the pin
 * can circle the poles without teleporting.
 */
export function createMoonGlobeGeometry(
  radius = 1,
  detail = 4,
): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  if (!pos) throw new Error("missing position attribute");
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    _dir.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    const hit = globeHitToWorld(_dir);
    if (!hit) continue;
    const h = sampleHeight(hit.x, hit.z);
    _dir.multiplyScalar(radius + h * GLOBE_HEIGHT_SCALE);
    pos.setXYZ(i, _dir.x, _dir.y, _dir.z);

    const t = THREE.MathUtils.clamp((h + 4) / 10, 0, 1);
    colors[i * 3] = THREE.MathUtils.lerp(0.55, 0.82, t);
    colors[i * 3 + 1] = THREE.MathUtils.lerp(0.52, 0.78, t);
    colors[i * 3 + 2] = THREE.MathUtils.lerp(0.48, 0.7, t);
  }

  pos.needsUpdate = true;
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/** @deprecated Use createChunkGeometry. */
export function createMoonGeometry(segments = 180): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(MOON_SIZE, MOON_SIZE, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  if (!pos) throw new Error("missing position attribute");

  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, sampleHeight(pos.getX(i), pos.getZ(i)));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Finite moon world size (legacy name). */
export const WORLD_SIZE = MOON_SIZE;
