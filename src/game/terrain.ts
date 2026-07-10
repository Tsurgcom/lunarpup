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

/** Planet-scale radius used for visual horizon drop (larger = subtler). */
export const CURVATURE_RADIUS = 620;

/** How many chunks out from the viewer to keep loaded. */
export const CHUNK_RADIUS = 2;

const CRATER_CELL = 56;
const SPAWN_CLEAR_R = 24;

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

function fbm(x: number, z: number, octaves = 4): number {
  let value = 0;
  let amp = 0.55;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += smoothNoise(x * freq, z * freq) * amp;
    amp *= 0.5;
    freq *= 2.05;
  }
  return value;
}

/** Smooth bowl profile: flat floor, steep transition, soft lip. */
export function craterDelta(crater: Crater, x: number, z: number): number {
  const dx = x - crater.x;
  const dz = z - crater.z;
  const dist = Math.hypot(dx, dz);
  if (dist >= crater.radius) return 0;

  const t = dist / crater.radius;
  const bowl = 0.5 * (1 + Math.cos(Math.PI * Math.min(t, 1)));
  const lip = THREE.MathUtils.smoothstep(0.72, 1, t);
  return -crater.depth * bowl * (1 - lip * 0.35);
}

/** Broad mare undulation — slow rolling hills across the infinite plain. */
export const mareUndulation: TerrainGenerator = {
  name: "mareUndulation",
  sample(x, z) {
    return fbm(x * 0.045, z * 0.045) * 1.8 - 0.4;
  },
};

/** Fine regolith grit on top of the mare. */
export const regolithDetail: TerrainGenerator = {
  name: "regolithDetail",
  sample(x, z) {
    return fbm(x * 0.12, z * 0.12, 3) * 0.35;
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

function cellCraterContribution(
  cellX: number,
  cellZ: number,
  x: number,
  z: number,
): number {
  const roll = hash2(cellX * 3.1, cellZ * 7.7);
  const count = roll < 0.28 ? 0 : roll < 0.72 ? 1 : 2;
  let y = 0;

  for (let i = 0; i < count; i++) {
    const h1 = hash2(cellX * 13.3 + i * 7.1, cellZ * 17.9 + i);
    const h2 = hash2(cellX * 19.7 + i, cellZ * 23.1 + i * 3.3);
    const h3 = hash2(cellX + i * 31.1, cellZ * 41.3 + i);
    const h4 = hash2(cellX * 53.9 + i, cellZ + i * 59.7);

    const crater: Crater = {
      x: (cellX + 0.18 + h1 * 0.64) * CRATER_CELL,
      z: (cellZ + 0.18 + h2 * 0.64) * CRATER_CELL,
      radius: 6.5 + h3 * 11,
      depth: 2.8 + h4 * 4.2,
    };

    // Keep the spawn skate park free of procedural bowls.
    if (Math.hypot(crater.x, crater.z) < SPAWN_CLEAR_R + crater.radius * 0.35) {
      continue;
    }

    y += craterDelta(crater, x, z);
  }

  return y;
}

/**
 * Spatially hashed crater field — deterministic bowls in every cell of the
 * infinite plane. Neighbor cells are sampled so bowls can straddle borders.
 */
export const craterField: TerrainGenerator = {
  name: "craterField",
  sample(x, z) {
    const cx = Math.floor(x / CRATER_CELL);
    const cz = Math.floor(z / CRATER_CELL);
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
    const cell = 18;
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    let y = 0;
    for (let iz = cz - 1; iz <= cz + 1; iz++) {
      for (let ix = cx - 1; ix <= cx + 1; ix++) {
        const h = hash2(ix * 91.7, iz * 53.3);
        if (h < 0.55) continue;
        const crater: Crater = {
          x: (ix + 0.25 + hash2(ix, iz + 4) * 0.5) * cell,
          z: (iz + 0.25 + hash2(ix + 9, iz) * 0.5) * cell,
          radius: 1.8 + hash2(ix * 2, iz * 5) * 2.4,
          depth: 0.35 + hash2(ix * 3, iz * 7) * 0.55,
        };
        if (Math.hypot(crater.x, crater.z) < 16) continue;
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
 * Infinite heightfield — sum of all generators. No world bounds.
 * Physics and mesh sampling must both go through this.
 */
export function sampleHeight(x: number, z: number): number {
  let y = 0;
  for (const gen of LUNAR_GENERATORS) {
    y += gen.sample(x, z);
  }
  return y;
}

/**
 * Visual-only planetary curvature: drops the horizon away from the viewer.
 * Not applied to physics — skating stays on the unwrapped heightfield.
 */
export function curvatureDrop(
  x: number,
  z: number,
  viewerX: number,
  viewerZ: number,
  radius = CURVATURE_RADIUS,
): number {
  const dx = x - viewerX;
  const dz = z - viewerZ;
  return (dx * dx + dz * dz) / (2 * radius);
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

export function chunkOrigin(chunkX: number, chunkZ: number): {
  x: number;
  z: number;
} {
  return {
    x: (chunkX + 0.5) * CHUNK_SIZE,
    z: (chunkZ + 0.5) * CHUNK_SIZE,
  };
}

/** Build a heightfield tile for chunk indices (chunkX, chunkZ). */
export function createChunkGeometry(
  chunkX: number,
  chunkZ: number,
  segments = 40,
): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const { x: ox, z: oz } = chunkOrigin(chunkX, chunkZ);
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

/** @deprecated Use createChunkGeometry — single-plane helper for tests/tools. */
export function createMoonGeometry(segments = 180): THREE.BufferGeometry {
  const extent = CHUNK_SIZE * (CHUNK_RADIUS * 2 + 1);
  const geo = new THREE.PlaneGeometry(extent, extent, segments, segments);
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

/** Legacy export — world is infinite; value is the streamed window size. */
export const WORLD_SIZE = CHUNK_SIZE * (CHUNK_RADIUS * 2 + 1);
