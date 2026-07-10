import * as THREE from "three";

export type Crater = {
  /** Unit direction of the crater center. */
  dir: THREE.Vector3;
  /** Bowl radius as surface arc length. */
  radius: number;
  depth: number;
};

/** A height contribution sampled at a unit sphere direction. */
export type TerrainGenerator = {
  readonly name: string;
  sample(dir: THREE.Vector3): number;
};

/**
 * Circumference of the moon — one great-circle lap in any direction.
 */
export const MOON_CIRCUMFERENCE = 960;

/** Sphere radius such that 2πR = MOON_CIRCUMFERENCE. */
export const MOON_RADIUS = MOON_CIRCUMFERENCE / (2 * Math.PI);

/** @deprecated Use MOON_CIRCUMFERENCE — old square-torus edge length. */
export const MOON_SIZE = MOON_CIRCUMFERENCE;
/** @deprecated */
export const MOON_HALF = MOON_CIRCUMFERENCE / 2;

/** Icosahedron subdivision for streamable triangular chunks (20·4^n faces). */
export const ICO_CHUNK_DETAIL = 2;

/**
 * Default / far-ring face tessellation. Near the pup, `faceSubdiv` raises this
 * so the visual clipmap matches the analytic heightfield used by collisions.
 */
export const ICO_FACE_SUBDIV = 8;

/** Load faces whose centroid is within this arc length of the viewer. */
export const CHUNK_ARC_RADIUS = 220;

/**
 * Clipmap LOD rings (arc length from viewer → edge subdiv).
 * Near ring is dense enough that chord error stays under board clearance.
 */
export const CLIPMAP_LODS: readonly { maxArc: number; subdiv: number }[] = [
  { maxArc: 28, subdiv: 40 },
  { maxArc: 70, subdiv: 22 },
  { maxArc: 130, subdiv: 12 },
  { maxArc: CHUNK_ARC_RADIUS, subdiv: ICO_FACE_SUBDIV },
];

/** HUD globe radius. */
export const CHART_RADIUS = 1;

/** Vertical exaggeration on the HUD globe. */
export const CHART_HEIGHT_SCALE = 0.045;

const SPAWN_CLEAR_ARC = 24;
const CRATER_CELL_ARC = 48;
const MICRO_CELL_ARC = 16;

/** Unit direction of the skate spawn (near +Z, slightly north). */
export const SPAWN_DIR = new THREE.Vector3(0, 0.12, 1).normalize();

const _tmpA = new THREE.Vector3();
const _tmpB = new THREE.Vector3();
const _tmpC = new THREE.Vector3();
const _tmpD = new THREE.Vector3();
const _sampleDir = new THREE.Vector3();
const _normalDir = new THREE.Vector3();
const _surfDir = new THREE.Vector3();
const _chartDir = new THREE.Vector3();
const _gradE = new THREE.Vector3();
const _gradN = new THREE.Vector3();
const _normE = new THREE.Vector3();
const _normN = new THREE.Vector3();
const _offE = new THREE.Vector3();
const _offN = new THREE.Vector3();
const _offT = new THREE.Vector3();
const _n = new THREE.Vector3();

/** Great-circle arc length between two unit directions. */
export function geodesicDistance(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius = MOON_RADIUS,
): number {
  const d = THREE.MathUtils.clamp(a.dot(b), -1, 1);
  return Math.acos(d) * radius;
}

/**
 * Exponential map: walk `tangent` (world-length vector in the tangent plane
 * of `dir`) along the sphere. Returns a new unit direction.
 */
export function expMap(
  dir: THREE.Vector3,
  tangent: THREE.Vector3,
  out = new THREE.Vector3(),
  radius = MOON_RADIUS,
): THREE.Vector3 {
  const dist = tangent.length();
  if (dist < 1e-10) return out.copy(dir).normalize();
  const angle = dist / radius;
  _tmpA.copy(tangent).multiplyScalar(1 / dist);
  return out
    .copy(dir)
    .multiplyScalar(Math.cos(angle))
    .addScaledVector(_tmpA, Math.sin(angle))
    .normalize();
}

/** Orthonormal tangent basis at `dir` (east, north) using world +Y as pole. */
export function tangentBasis(
  dir: THREE.Vector3,
  east: THREE.Vector3,
  north: THREE.Vector3,
): void {
  east.set(0, 1, 0).cross(dir);
  if (east.lengthSq() < 1e-10) {
    east.set(1, 0, 0).cross(dir);
  }
  east.normalize();
  north.crossVectors(dir, east).normalize();
}

function offsetDir(
  base: THREE.Vector3,
  eastArc: number,
  northArc: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  tangentBasis(base, _offE, _offN);
  _offT
    .copy(_offE)
    .multiplyScalar(eastArc)
    .addScaledVector(_offN, northArc);
  return expMap(base, _offT, out);
}

function hash3(x: number, y: number, z: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise3(p: THREE.Vector3): number {
  const x0 = Math.floor(p.x);
  const y0 = Math.floor(p.y);
  const z0 = Math.floor(p.z);
  const fx = p.x - x0;
  const fy = p.y - y0;
  const fz = p.z - z0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);

  const n000 = hash3(x0, y0, z0);
  const n100 = hash3(x0 + 1, y0, z0);
  const n010 = hash3(x0, y0 + 1, z0);
  const n110 = hash3(x0 + 1, y0 + 1, z0);
  const n001 = hash3(x0, y0, z0 + 1);
  const n101 = hash3(x0 + 1, y0, z0 + 1);
  const n011 = hash3(x0, y0 + 1, z0 + 1);
  const n111 = hash3(x0 + 1, y0 + 1, z0 + 1);

  const x00 = THREE.MathUtils.lerp(n000, n100, u);
  const x10 = THREE.MathUtils.lerp(n010, n110, u);
  const x01 = THREE.MathUtils.lerp(n001, n101, u);
  const x11 = THREE.MathUtils.lerp(n011, n111, u);
  const y0l = THREE.MathUtils.lerp(x00, x10, v);
  const y1l = THREE.MathUtils.lerp(x01, x11, v);
  return THREE.MathUtils.lerp(y0l, y1l, w);
}

function fbmDir(dir: THREE.Vector3, scale: number, octaves = 4): number {
  let value = 0;
  let amp = 0.55;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    _tmpD.copy(dir).multiplyScalar(scale * freq * 8);
    value += smoothNoise3(_tmpD) * amp;
    amp *= 0.5;
    freq *= 2.05;
  }
  return value;
}

/** Smooth bowl profile using geodesic distance. */
export function craterDelta(crater: Crater, dir: THREE.Vector3): number {
  const dist = geodesicDistance(crater.dir, dir);
  if (dist >= crater.radius) return 0;

  const t = dist / crater.radius;
  const bowl = 0.5 * (1 + Math.cos(Math.PI * Math.min(t, 1)));
  const lip = THREE.MathUtils.smoothstep(0.72, 1, t);
  return -crater.depth * bowl * (1 - lip * 0.35);
}

function makeAnchor(
  eastArc: number,
  northArc: number,
  radius: number,
  depth: number,
): Crater {
  return {
    dir: offsetDir(SPAWN_DIR, eastArc, northArc),
    radius,
    depth,
  };
}

/** Hand-placed skate bowls near spawn — always present. */
export const ANCHOR_CRATERS: Crater[] = [
  makeAnchor(0, 0, 18, 7),
  makeAnchor(32, -8, 12, 5.5),
  makeAnchor(-28, 18, 14, 6),
  makeAnchor(18, 30, 10, 4.5),
  makeAnchor(-22, -26, 11, 5),
];

/** @deprecated Prefer ANCHOR_CRATERS. */
export const CRATERS = ANCHOR_CRATERS;

export const mareUndulation: TerrainGenerator = {
  name: "mareUndulation",
  sample(dir) {
    return fbmDir(dir, 0.55) * 1.8 - 0.4;
  },
};

export const regolithDetail: TerrainGenerator = {
  name: "regolithDetail",
  sample(dir) {
    return fbmDir(dir, 1.4, 3) * 0.35;
  },
};

export const anchorBowls: TerrainGenerator = {
  name: "anchorBowls",
  sample(dir) {
    let y = 0;
    for (const crater of ANCHOR_CRATERS) {
      y += craterDelta(crater, dir);
    }
    return y;
  },
};

/**
 * Procedural craters on a cube lattice projected to the sphere.
 *
 * Critical for continuity: a cell only emits a crater if it *owns* the
 * projected center (floor(center·scale) === cell). Without that, centers
 * drift into other cells after normalize() and pop in/out of the local
 * neighborhood → height cliffs.
 */
function cubeCellCraters(
  ix: number,
  iy: number,
  iz: number,
  dir: THREE.Vector3,
  scale: number,
  opts: {
    seed: number;
    maxCount: number;
    radiusMin: number;
    radiusSpan: number;
    depthMin: number;
    depthSpan: number;
    clearArc: number;
    emptyBelow: number;
  },
): number {
  const roll = hash3(ix * 3.1 + opts.seed, iy * 7.7, iz * 1.2 + opts.seed);
  if (roll < opts.emptyBelow) return 0;
  const count =
    roll < opts.emptyBelow + (1 - opts.emptyBelow) * 0.55 ? 1 : opts.maxCount;

  let y = 0;
  for (let i = 0; i < count; i++) {
    const h1 = hash3(ix * 13.3 + i * 7.1, iy * 17.9 + i, iz * 2.1 + opts.seed);
    const h2 = hash3(ix * 19.7 + i, iy * 23.1 + i * 3.3, iz * 3.2 + opts.seed);
    const h3 = hash3(ix + i * 31.1, iy * 41.3 + i, iz * 4.3 + opts.seed);
    const h4 = hash3(ix * 53.9 + i, iy + i * 59.7, iz * 5.4 + opts.seed);

    _tmpB.set(
      (ix + 0.12 + h1 * 0.76) / scale,
      (iy + 0.12 + h2 * 0.76) / scale,
      (iz + 0.12 + h3 * 0.76) / scale,
    );
    if (_tmpB.lengthSq() < 1e-10) continue;
    _tmpB.normalize();

    // Ownership: projected center must land back in this cell.
    if (
      Math.floor(_tmpB.x * scale) !== ix ||
      Math.floor(_tmpB.y * scale) !== iy ||
      Math.floor(_tmpB.z * scale) !== iz
    ) {
      continue;
    }

    if (geodesicDistance(_tmpB, SPAWN_DIR) < opts.clearArc) continue;

    const radius = opts.radiusMin + h4 * opts.radiusSpan;
    const depth =
      opts.depthMin +
      hash3(ix * 2 + i, iy * 5, iz * 9 + opts.seed) * opts.depthSpan;
    y = Math.min(y, craterDelta({ dir: _tmpB, radius, depth }, dir));
  }
  return y;
}

function sampleCubeCraterField(
  dir: THREE.Vector3,
  cellArc: number,
  opts: {
    seed: number;
    maxCount: number;
    radiusMin: number;
    radiusSpan: number;
    depthMin: number;
    depthSpan: number;
    clearArc: number;
    emptyBelow: number;
  },
): number {
  const scale = MOON_RADIUS / cellArc;
  _tmpA.copy(dir).multiplyScalar(scale);
  const ix0 = Math.floor(_tmpA.x);
  const iy0 = Math.floor(_tmpA.y);
  const iz0 = Math.floor(_tmpA.z);

  const maxRadius = opts.radiusMin + opts.radiusSpan;
  // With ownership, crater cell ≈ center cell; ring covers any still-reaching bowl.
  const ring = Math.max(1, Math.ceil(maxRadius / cellArc) + 1);

  let y = 0;
  for (let dz = -ring; dz <= ring; dz++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        y = Math.min(
          y,
          cubeCellCraters(ix0 + dx, iy0 + dy, iz0 + dz, dir, scale, opts),
        );
      }
    }
  }
  return y;
}

export const craterField: TerrainGenerator = {
  name: "craterField",
  sample(dir) {
    return sampleCubeCraterField(dir, CRATER_CELL_ARC, {
      seed: 1.2,
      maxCount: 1,
      // radius < cellArc so a 2-ring neighborhood always covers influence.
      radiusMin: 8,
      radiusSpan: 14,
      depthMin: 2.0,
      depthSpan: 3.0,
      clearArc: SPAWN_CLEAR_ARC + 6,
      emptyBelow: 0.35,
    });
  },
};

export const microCraters: TerrainGenerator = {
  name: "microCraters",
  sample(dir) {
    return sampleCubeCraterField(dir, MICRO_CELL_ARC, {
      seed: 6.6,
      maxCount: 1,
      radiusMin: 1.5,
      radiusSpan: 2.0,
      depthMin: 0.3,
      depthSpan: 0.45,
      clearArc: 16,
      emptyBelow: 0.6,
    });
  },
};

export const LUNAR_GENERATORS: readonly TerrainGenerator[] = [
  mareUndulation,
  regolithDetail,
  anchorBowls,
  craterField,
  microCraters,
];

/** Radial height offset at a unit direction. */
export function sampleHeightDir(dir: THREE.Vector3): number {
  _sampleDir.copy(dir).normalize();
  let h = 0;
  for (const gen of LUNAR_GENERATORS) {
    h += gen.sample(_sampleDir);
  }
  return h;
}

/** Radial height at any world position (uses direction from moon center). */
export function sampleHeightAt(pos: THREE.Vector3): number {
  return sampleHeightDir(_tmpD.copy(pos).normalize());
}

/**
 * Surface normal for the radial heightfield ρ = R + h(dir).
 * With ∇ measured in moon arc length: N ∝ (1 + h/R) dir − ∇h.
 * (Dividing ∇h by R was wrong — that collapsed bowl walls onto the radial.)
 *
 * Pass `h0` when the caller already sampled height at `dir` to skip a redo.
 */
export function sampleNormalDir(
  dir: THREE.Vector3,
  out = _n,
  eps = 0.45,
  h0?: number,
): THREE.Vector3 {
  _normalDir.copy(dir).normalize();
  const h = h0 ?? sampleHeightDir(_normalDir);
  const scale = 1 + h / MOON_RADIUS;

  tangentBasis(_normalDir, _normE, _normN);
  expMap(_normalDir, _tmpA.copy(_normE).multiplyScalar(eps), _gradE);
  expMap(_normalDir, _tmpA.copy(_normN).multiplyScalar(eps), _gradN);
  const dhE = (sampleHeightDir(_gradE) - h) / eps;
  const dhN = (sampleHeightDir(_gradN) - h) / eps;

  return out
    .copy(_normalDir)
    .addScaledVector(_normE, -dhE / Math.max(scale, 1e-4))
    .addScaledVector(_normN, -dhN / Math.max(scale, 1e-4))
    .normalize();
}

export function sampleNormalAt(
  pos: THREE.Vector3,
  out = _n,
  eps = 0.45,
): THREE.Vector3 {
  return sampleNormalDir(_tmpD.copy(pos).normalize(), out, eps);
}

/** World position on the displaced crust along `dir`, then offset along the surface normal. */
export function surfacePoint(
  dir: THREE.Vector3,
  clearance = 0,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  _surfDir.copy(dir).normalize();
  const h = sampleHeightDir(_surfDir);
  sampleNormalDir(_surfDir, _n);
  return out
    .copy(_surfDir)
    .multiplyScalar(MOON_RADIUS + h)
    .addScaledVector(_n, clearance);
}

// ---------------------------------------------------------------------------
// Icosphere chunk topology
// ---------------------------------------------------------------------------

export type IcoFace = {
  index: number;
  /** Unit-sphere corners. */
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  centroid: THREE.Vector3;
};

let _faces: IcoFace[] | null = null;

function midDir(u: THREE.Vector3, v: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3().addVectors(u, v).normalize();
}

function buildIcoFaces(detail: number): IcoFace[] {
  const t = (1 + Math.sqrt(5)) / 2;
  const verts: THREE.Vector3[] = [
    new THREE.Vector3(-1, t, 0).normalize(),
    new THREE.Vector3(1, t, 0).normalize(),
    new THREE.Vector3(-1, -t, 0).normalize(),
    new THREE.Vector3(1, -t, 0).normalize(),
    new THREE.Vector3(0, -1, t).normalize(),
    new THREE.Vector3(0, 1, t).normalize(),
    new THREE.Vector3(0, -1, -t).normalize(),
    new THREE.Vector3(0, 1, -t).normalize(),
    new THREE.Vector3(t, 0, -1).normalize(),
    new THREE.Vector3(t, 0, 1).normalize(),
    new THREE.Vector3(-t, 0, -1).normalize(),
    new THREE.Vector3(-t, 0, 1).normalize(),
  ];

  let faces: Array<[number, number, number]> = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];

  for (let d = 0; d < detail; d++) {
    const next: Array<[number, number, number]> = [];
    const midCache = new Map<string, number>();
    const midpoint = (i: number, j: number): number => {
      const key = i < j ? `${i},${j}` : `${j},${i}`;
      const cached = midCache.get(key);
      if (cached !== undefined) return cached;
      const m = midDir(verts[i]!, verts[j]!);
      const idx = verts.length;
      verts.push(m);
      midCache.set(key, idx);
      return idx;
    };
    for (const [i0, i1, i2] of faces) {
      const a = midpoint(i0, i1);
      const b = midpoint(i1, i2);
      const c = midpoint(i2, i0);
      next.push([i0, a, c], [i1, b, a], [i2, c, b], [a, b, c]);
    }
    faces = next;
  }

  return faces.map(([i0, i1, i2], index) => {
    const a = verts[i0]!.clone();
    const b = verts[i1]!.clone();
    const c = verts[i2]!.clone();
    const centroid = new THREE.Vector3().add(a).add(b).add(c).normalize();
    return { index, a, b, c, centroid };
  });
}

export function getIcoFaces(): readonly IcoFace[] {
  if (!_faces) _faces = buildIcoFaces(ICO_CHUNK_DETAIL);
  return _faces;
}

/** Barycentric interpolate on the unit sphere (normalize after lerp). */
function sphereBary(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  u: number,
  v: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const w = 1 - u - v;
  return out
    .set(0, 0, 0)
    .addScaledVector(a, w)
    .addScaledVector(b, u)
    .addScaledVector(c, v)
    .normalize();
}

/**
 * Build a displaced triangular patch for one icosphere face.
 * `subdiv` is the number of edge segments (≥1).
 */
export function createFaceGeometry(
  face: IcoFace,
  subdiv = ICO_FACE_SUBDIV,
  radius = MOON_RADIUS,
): THREE.BufferGeometry {
  const n = Math.max(1, subdiv | 0);
  const positions: number[] = [];
  const indices: number[] = [];
  const dir = new THREE.Vector3();

  const vertIndex = (i: number, j: number) => {
    // Row j has (j+1) verts; i in [0..j]
    return (j * (j + 1)) / 2 + i;
  };

  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= j; i++) {
      // Barycentric: s along a→b, t along a→c (row j, column i).
      const s = i / n;
      const t = (j - i) / n;
      sphereBary(face.a, face.b, face.c, s, t, dir);
      const h = sampleHeightDir(dir);
      const r = radius + h;
      positions.push(dir.x * r, dir.y * r, dir.z * r);
    }
  }

  for (let j = 0; j < n; j++) {
    for (let i = 0; i <= j; i++) {
      const v0 = vertIndex(i, j);
      const v1 = vertIndex(i, j + 1);
      const v2 = vertIndex(i + 1, j + 1);
      // CW winding so normals point outward from the moon center.
      indices.push(v0, v2, v1);
      if (i < j) {
        const v3 = vertIndex(i + 1, j);
        indices.push(v0, v3, v2);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Faces whose centroid lies within `arcRadius` of `viewerDir`. */
export function facesNear(
  viewerDir: THREE.Vector3,
  arcRadius = CHUNK_ARC_RADIUS,
): IcoFace[] {
  const faces = getIcoFaces();
  const cosMax = Math.cos(arcRadius / MOON_RADIUS);
  const out: IcoFace[] = [];
  for (const face of faces) {
    if (face.centroid.dot(viewerDir) >= cosMax) out.push(face);
  }
  return out;
}

/**
 * Clipmap tessellation for a face: denser near the viewer so the mesh
 * matches analytic collision height, coarser on the horizon.
 */
export function faceSubdiv(
  viewerDir: THREE.Vector3,
  face: IcoFace,
): number {
  const arc = geodesicDistance(viewerDir, face.centroid);
  for (const ring of CLIPMAP_LODS) {
    if (arc <= ring.maxArc) return ring.subdiv;
  }
  return ICO_FACE_SUBDIV;
}

// ---------------------------------------------------------------------------
// HUD globe
// ---------------------------------------------------------------------------

export function worldToChart(
  x: number,
  y: number,
  z: number,
  out = new THREE.Vector3(),
  heightScale = CHART_HEIGHT_SCALE,
): THREE.Vector3 {
  _chartDir.set(x, y, z);
  const len = _chartDir.length();
  if (len < 1e-8) return out.set(0, CHART_RADIUS, 0);
  _chartDir.multiplyScalar(1 / len);
  const h = sampleHeightDir(_chartDir);
  const r = CHART_RADIUS * (1 + (h * heightScale) / MOON_RADIUS);
  return out.copy(_chartDir).multiplyScalar(r);
}

/** Ray hit on the chart globe → unit direction (teleport target). */
export function chartHitToDir(
  point: THREE.Vector3,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  return out.copy(point).normalize();
}

export function createMoonChartGeometry(
  radius = CHART_RADIUS,
  detail = 4,
  heightScale = CHART_HEIGHT_SCALE,
): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position;
  if (!pos) throw new Error("missing position attribute");
  const colors = new Float32Array(pos.count * 3);
  const dir = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    dir.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    const h = sampleHeightDir(dir);
    const r = radius * (1 + (h * heightScale) / MOON_RADIUS);
    pos.setXYZ(i, dir.x * r, dir.y * r, dir.z * r);

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

// ---------------------------------------------------------------------------
// Legacy shims (flat API → sphere via spawn-centered chart)
// ---------------------------------------------------------------------------

/** @deprecated Flat XZ height — projects through spawn tangent chart. */
export function sampleHeight(x: number, z: number): number {
  return sampleHeightDir(offsetDir(SPAWN_DIR, x, -z, _tmpC));
}

/** @deprecated */
export function sampleNormal(
  x: number,
  z: number,
  out = _n,
  eps = 0.35,
): THREE.Vector3 {
  return sampleNormalDir(offsetDir(SPAWN_DIR, x, -z, _tmpC), out, eps);
}

/** @deprecated No longer used — sphere is geometric. */
export const CURVATURE_RADIUS = MOON_RADIUS;

/** @deprecated */
export function curvatureDrop(): number {
  return 0;
}

/** @deprecated */
export function curvedSurfaceY(
  _x: number,
  _z: number,
  y: number,
): number {
  return y;
}

/** @deprecated Toroidal wrap removed. */
export function wrapCoord(v: number): number {
  return v;
}

/** @deprecated */
export function wrapDelta(a: number, b: number): number {
  return a - b;
}

/** @deprecated */
export function unwrapToward(value: number, _around: number): number {
  return value;
}

/** @deprecated */
export const CHUNK_SIZE = 48;
/** @deprecated */
export const MOON_CHUNKS = 10;
/** @deprecated */
export const CHUNK_RADIUS = 2;
/** @deprecated */
export const CHART_HALF = CHART_RADIUS;
/** @deprecated */
export const WORLD_SIZE = MOON_CIRCUMFERENCE;
