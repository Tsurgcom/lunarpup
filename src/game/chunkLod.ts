import * as THREE from "three";
import { MAX_SPEED, MOON_RADIUS } from "./moon";
import { getPerfSettings, scaleLodSubdiv } from "./performanceTiers";

/** Icosahedron subdivision for streamable triangular chunks (20·4^n faces). */
export const ICO_CHUNK_DETAIL = 2;

/** Base load radius (arc length) before velocity expansion. */
export const CHUNK_ARC_RADIUS = 220;

/**
 * Extra arc kept after a face leaves the enter radius — stops flicker at
 * the load boundary when the pup skates along a ring edge.
 */
export const CULL_EXIT_SLACK = 28;

/**
 * Faces whose nearest corner is behind this cosine of the viewer direction
 * are back-hemisphere culled (past the limb).
 */
export const BACKFACE_COS = -0.12;

/**
 * Look-ahead time (s): stream detail toward where the pup will be.
 * Scaled by tangential speed; capped by {@link MAX_LOOKAHEAD_ARC}.
 */
export const LOOKAHEAD_SEC = 1.4;

/** Hard cap on look-ahead arc length (m). */
export const MAX_LOOKAHEAD_ARC = 90;

/**
 * At {@link MAX_SPEED}, ring radii expand by this fraction so fast travel
 * keeps denser mesh ahead of the board.
 */
export const SPEED_RING_EXPAND = 0.55;

/**
 * Clipmap LOD rings (base arc length from viewer → edge subdiv + debug colour).
 * Level 0 = closest / densest (green); higher = coarser / farther.
 */
export const CLIPMAP_LODS: readonly {
  maxArc: number;
  subdiv: number;
  /** Debug minimap colour for this ring. */
  color: string;
}[] = [
  { maxArc: 24, subdiv: 40, color: "#22c55e" }, // close — green
  { maxArc: 48, subdiv: 28, color: "#84cc16" }, // near — lime
  { maxArc: 80, subdiv: 18, color: "#eab308" }, // mid — yellow
  { maxArc: 120, subdiv: 12, color: "#f97316" }, // mid-far — orange
  { maxArc: 170, subdiv: 8, color: "#ef4444" }, // far — red
  { maxArc: CHUNK_ARC_RADIUS, subdiv: 4, color: "#a855f7" }, // horizon — purple
];

/** Fallback subdiv beyond the outer ring (should not appear while loaded). */
export const ICO_FACE_SUBDIV = 4;

// ---------------------------------------------------------------------------
// Terrain generator API (stub until a heightfield lands)
// ---------------------------------------------------------------------------

/** A height contribution sampled at a unit sphere direction. */
export type TerrainGenerator = {
  readonly name: string;
  sample(dir: THREE.Vector3): number;
};

let terrainGen: TerrainGenerator | null = null;

/** Register the active heightfield (or `null` to clear). */
export function setTerrainGenerator(gen: TerrainGenerator | null): void {
  terrainGen = gen;
}

export function getTerrainGenerator(): TerrainGenerator | null {
  return terrainGen;
}

/**
 * Sample radial height offset above {@link MOON_RADIUS}.
 * Returns 0 until a generator is registered.
 */
export function sampleTerrainHeight(dir: THREE.Vector3): number {
  return terrainGen ? terrainGen.sample(dir) : 0;
}

// ---------------------------------------------------------------------------
// Chunk topology
// ---------------------------------------------------------------------------

export type IcoFace = {
  index: number;
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  centroid: THREE.Vector3;
  neighbors: number[];
};

let _faces: IcoFace[] | null = null;

function midDir(u: THREE.Vector3, v: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3().addVectors(u, v).normalize();
}

function edgeKey(i: number, j: number): string {
  return i < j ? `${i},${j}` : `${j},${i}`;
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
      const key = edgeKey(i, j);
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

  const edgeFaces = new Map<string, number[]>();
  for (let fi = 0; fi < faces.length; fi++) {
    const [i0, i1, i2] = faces[fi]!;
    for (const key of [edgeKey(i0, i1), edgeKey(i1, i2), edgeKey(i2, i0)]) {
      let list = edgeFaces.get(key);
      if (!list) {
        list = [];
        edgeFaces.set(key, list);
      }
      list.push(fi);
    }
  }

  const neighborSets = faces.map(() => new Set<number>());
  for (const pair of edgeFaces.values()) {
    if (pair.length < 2) continue;
    for (let i = 0; i < pair.length; i++) {
      for (let j = i + 1; j < pair.length; j++) {
        neighborSets[pair[i]!]!.add(pair[j]!);
        neighborSets[pair[j]!]!.add(pair[i]!);
      }
    }
  }

  return faces.map(([i0, i1, i2], index) => {
    const a = verts[i0]!.clone();
    const b = verts[i1]!.clone();
    const c = verts[i2]!.clone();
    const centroid = new THREE.Vector3().add(a).add(b).add(c).normalize();
    return {
      index,
      a,
      b,
      c,
      centroid,
      neighbors: [...neighborSets[index]!],
    };
  });
}

export function getIcoFaces(): readonly IcoFace[] {
  if (!_faces) _faces = buildIcoFaces(ICO_CHUNK_DETAIL);
  return _faces;
}

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
 * of `dir`) along the sphere. Returns unit direction in `out`.
 */
export function expMap(
  dir: THREE.Vector3,
  tangent: THREE.Vector3,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const arc = tangent.length();
  if (arc < 1e-8) return out.copy(dir).normalize();
  const angle = arc / MOON_RADIUS;
  const tHat = _tmpA.copy(tangent).multiplyScalar(1 / arc);
  // Rodrigues: cos(θ)·n + sin(θ)·t̂  (n ⊥ t̂ on the unit sphere)
  return out
    .copy(dir)
    .multiplyScalar(Math.cos(angle))
    .addScaledVector(tHat, Math.sin(angle))
    .normalize();
}

/** Faces whose centroid lies within `arcRadius` of `viewerDir`. */
export function facesNear(
  viewerDir: THREE.Vector3,
  arcRadius = CHUNK_ARC_RADIUS,
  out: IcoFace[] = [],
): IcoFace[] {
  const faces = getIcoFaces();
  out.length = 0;
  for (const face of faces) {
    if (faceWithinArc(viewerDir, face, arcRadius)) out.push(face);
  }
  return out;
}

/**
 * Keep a face if its centroid **or any corner** is inside the arc radius.
 * Corner tests stop large horizon triangles from popping when only the
 * centroid sits just outside the load ring.
 */
export function faceWithinArc(
  viewerDir: THREE.Vector3,
  face: IcoFace,
  arcRadius: number,
): boolean {
  const cosMax = Math.cos(arcRadius / MOON_RADIUS);
  if (face.centroid.dot(viewerDir) >= cosMax) return true;
  if (face.a.dot(viewerDir) >= cosMax) return true;
  if (face.b.dot(viewerDir) >= cosMax) return true;
  if (face.c.dot(viewerDir) >= cosMax) return true;
  return false;
}

/**
 * True when every sample of the face is past the limb — safe hard cull.
 */
export function faceBackCulled(
  viewerDir: THREE.Vector3,
  face: IcoFace,
  cosKeep = BACKFACE_COS,
): boolean {
  const maxDot = Math.max(
    face.centroid.dot(viewerDir),
    face.a.dot(viewerDir),
    face.b.dot(viewerDir),
    face.c.dot(viewerDir),
  );
  return maxDot < cosKeep;
}

/**
 * Load set with enter/exit hysteresis and back-face cull.
 * `prevIds` are faces kept last frame — they stay until they leave exitArc.
 */
export function cullFaces(
  viewerDir: THREE.Vector3,
  enterArc: number,
  exitArc: number,
  prevIds: ReadonlySet<number>,
  out: IcoFace[] = [],
): IcoFace[] {
  const faces = getIcoFaces();
  out.length = 0;
  for (const face of faces) {
    if (faceBackCulled(viewerDir, face)) continue;
    if (faceWithinArc(viewerDir, face, enterArc)) {
      out.push(face);
      continue;
    }
    if (prevIds.has(face.index) && faceWithinArc(viewerDir, face, exitArc)) {
      out.push(face);
    }
  }
  return out;
}

/** Debug / stream colour for a LOD ring index. */
export function lodColor(level: number): string {
  const ring = CLIPMAP_LODS[level];
  return ring?.color ?? "#64748b";
}

/**
 * Clipmap tessellation for a face, with rings expanded by `speedScale`
 * (≥1) so fast travel keeps denser mesh farther out.
 */
export function faceSubdiv(
  viewerDir: THREE.Vector3,
  face: IcoFace,
  speedScale = 1,
): number {
  const arc = geodesicDistance(viewerDir, face.centroid);
  const scale = Math.max(1, speedScale);
  let subdiv = ICO_FACE_SUBDIV;
  for (const ring of CLIPMAP_LODS) {
    if (arc <= ring.maxArc * scale) {
      subdiv = ring.subdiv;
      break;
    }
  }
  return scaleLodSubdiv(subdiv, getPerfSettings().lodSubdivScale);
}

/** LOD ring index (0 = closest) for a face at the given viewer / speed. */
export function faceLodLevel(
  viewerDir: THREE.Vector3,
  face: IcoFace,
  speedScale = 1,
): number {
  const arc = geodesicDistance(viewerDir, face.centroid);
  const scale = Math.max(1, speedScale);
  for (let i = 0; i < CLIPMAP_LODS.length; i++) {
    if (arc <= CLIPMAP_LODS[i]!.maxArc * scale) return i;
  }
  return CLIPMAP_LODS.length - 1;
}

/**
 * Promote each loaded face to max(own, neighbors') subdiv so shared edges
 * share the finer tessellation (no T-junction cracks at LOD rings).
 */
export function stitchFaceSubdivs(
  viewerDir: THREE.Vector3,
  faceIds: Iterable<number>,
  speedScale = 1,
  out: Map<number, number> = new Map(),
  ids: number[] = [],
): Map<number, number> {
  out.clear();
  ids.length = 0;
  const faces = getIcoFaces();
  for (const id of faceIds) {
    const face = faces[id];
    if (!face) continue;
    ids.push(id);
    out.set(id, faceSubdiv(viewerDir, face, speedScale));
  }
  for (const id of ids) {
    const face = faces[id]!;
    let lod = out.get(id)!;
    for (const nid of face.neighbors) {
      const nLod = out.get(nid);
      if (nLod !== undefined && nLod > lod) lod = nLod;
    }
    out.set(id, lod);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Velocity-based viewer + published plan
// ---------------------------------------------------------------------------

export type ChunkLodEntry = {
  faceIndex: number;
  /** Edge subdiv after stitch — ready for a future mesh builder. */
  subdiv: number;
  /** Ring index 0 = closest. */
  level: number;
  color: string;
};

export type ChunkLodSnapshot = {
  /** Unit direction used for LOD (look-ahead biased). */
  viewerX: number;
  viewerY: number;
  viewerZ: number;
  speed: number;
  /** Ring radius scale from speed (≥1). */
  speedScale: number;
  /** Look-ahead arc applied (m). */
  lookAheadArc: number;
  chunks: readonly ChunkLodEntry[];
};

const EMPTY_SNAP: ChunkLodSnapshot = {
  viewerX: 0,
  viewerY: 0,
  viewerZ: 1,
  speed: 0,
  speedScale: 1,
  lookAheadArc: 0,
  chunks: [],
};

let snap: ChunkLodSnapshot = EMPTY_SNAP;
const listeners = new Set<() => void>();

const _poseDir = new THREE.Vector3();
const _viewer = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _tmpA = new THREE.Vector3();
const _nearBuf: IcoFace[] = [];
const _lodMap = new Map<number, number>();
const _lodIds: number[] = [];
const _entries: ChunkLodEntry[] = [];
const _loadedIds = new Set<number>();
const _nextLoaded = new Set<number>();

export function getChunkLodSnapshot(): ChunkLodSnapshot {
  return snap;
}

export function subscribeChunkLod(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const l of listeners) l();
}

/** Speed → ring expansion factor (≥1). */
export function speedRingScale(speed: number): number {
  const ratio = THREE.MathUtils.clamp(speed / MAX_SPEED, 0, 1.5);
  return 1 + ratio * SPEED_RING_EXPAND;
}

/**
 * Build the LOD viewer direction from world pose + velocity.
 * Writes unit `out`; returns look-ahead arc length used (m).
 */
export function computeLodViewer(
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  out: THREE.Vector3,
): number {
  _poseDir.set(x, y, z);
  if (_poseDir.lengthSq() < 1e-8) _poseDir.set(0, 0, 1);
  else _poseDir.normalize();

  const speed = Math.hypot(vx, vy, vz);
  if (speed < 0.05) {
    out.copy(_poseDir);
    return 0;
  }

  // Tangential component only — radial climb shouldn't shift surface LOD.
  _tangent.set(vx, vy, vz);
  _tangent.addScaledVector(_poseDir, -_tangent.dot(_poseDir));
  const tanSpeed = _tangent.length();
  if (tanSpeed < 0.05) {
    out.copy(_poseDir);
    return 0;
  }

  const lookAhead = Math.min(tanSpeed * LOOKAHEAD_SEC, MAX_LOOKAHEAD_ARC);
  _tangent.multiplyScalar(lookAhead / tanSpeed);
  expMap(_poseDir, _tangent, out);
  return lookAhead;
}

/**
 * Recompute the active chunk plan from pose + velocity.
 * Call once per frame after the player writes local pose.
 */
export function updateChunkLod(
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
): ChunkLodSnapshot {
  const speed = Math.hypot(vx, vy, vz);
  const speedScale = speedRingScale(speed);
  const lookAheadArc = computeLodViewer(x, y, z, vx, vy, vz, _viewer);
  const enterArc = CHUNK_ARC_RADIUS * speedScale;
  const exitArc = enterArc + CULL_EXIT_SLACK;

  const near = cullFaces(_viewer, enterArc, exitArc, _loadedIds, _nearBuf);
  _nextLoaded.clear();
  for (const f of near) _nextLoaded.add(f.index);
  _loadedIds.clear();
  for (const id of _nextLoaded) _loadedIds.add(id);

  const needed = near.map((f) => f.index);
  const subdivs = stitchFaceSubdivs(
    _viewer,
    needed,
    speedScale,
    _lodMap,
    _lodIds,
  );

  const faces = getIcoFaces();
  _entries.length = 0;
  for (const id of needed) {
    const face = faces[id];
    if (!face) continue;
    const level = faceLodLevel(_viewer, face, speedScale);
    _entries.push({
      faceIndex: id,
      subdiv: subdivs.get(id) ?? ICO_FACE_SUBDIV,
      level,
      color: lodColor(level),
    });
  }

  // Stable order for consumers / tests.
  _entries.sort((a, b) => a.faceIndex - b.faceIndex);

  snap = {
    viewerX: _viewer.x,
    viewerY: _viewer.y,
    viewerZ: _viewer.z,
    speed,
    speedScale,
    lookAheadArc,
    chunks: _entries.slice(),
  };
  emit();
  return snap;
}

/** Clear published plan (e.g. leaving play). */
export function resetChunkLod(): void {
  snap = EMPTY_SNAP;
  _loadedIds.clear();
  _nextLoaded.clear();
  emit();
}
