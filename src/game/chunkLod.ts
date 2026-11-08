import * as THREE from "three";
import { MAX_SPEED, MOON_RADIUS } from "./moon";
import { getPerfSettings, scaleLodSubdiv } from "./performanceTiers";

/**
 * Icosahedron subdivision for streamable triangular chunks (20·4^n faces).
 * Detail 2 → 320 faces (~85 m edges). Detail 1's 80 giant faces made the
 * close ring look like a single triangle under the board.
 */
export const ICO_CHUNK_DETAIL = 2;

/** Base load radius (arc length) before velocity expansion. */
export const CHUNK_ARC_RADIUS = 240;

/**
 * Extra arc kept after a face leaves the enter radius — stops flicker at
 * the load boundary when the pup skates along a ring edge.
 */
export const CULL_EXIT_SLACK = 28;

/**
 * Horizon / limb cull relative to the LOD viewer (pup look-ahead), not the
 * chase camera. Faces whose nearest sample is past this cosine of the viewer
 * radial are over the horizon and never streamed.
 *
 * 0 = geometric limb on a perfect sphere; a tiny positive value drops faces
 * that are only grazing the silhouette (saves mesh work, little visual loss).
 */
export const HORIZON_COS = 0.04;

/**
 * Exit slack for horizon cull — already-loaded faces stay until clearly past
 * the limb so skating along the rim doesn't thrash remeshes.
 */
export const HORIZON_EXIT_COS = -0.06;

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
 * Clipmap LOD rings (base arc length from density probes → edge subdiv +
 * debug colour). Level 0 = closest / densest (green); higher = coarser.
 *
 * Close subdiv must keep bowl chord error under
 * boardClearance + meshChordSlack — subdiv 20 sank ~0.55 m through spawn
 * bowls while clearance was only 0.14 m.
 */
export const CLIPMAP_LODS: readonly {
  maxArc: number;
  subdiv: number;
  /** Debug minimap colour for this ring. */
  color: string;
}[] = [
  { maxArc: 42, subdiv: 32, color: "#22c55e" }, // close — green
  { maxArc: 88, subdiv: 12, color: "#eab308" }, // mid — yellow
  { maxArc: 150, subdiv: 5, color: "#f97316" }, // mid-far — orange
  { maxArc: CHUNK_ARC_RADIUS, subdiv: 3, color: "#a855f7" }, // horizon — purple
];

/** Fallback subdiv beyond the outer ring (should not appear while loaded). */
export const ICO_FACE_SUBDIV = 3;

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
 * True when every sample of the face is past the geometric limb — over the
 * horizon from the LOD viewer. Uses {@link HORIZON_COS} for cold loads and
 * {@link HORIZON_EXIT_COS} when the face was already streamed (hysteresis).
 */
export function faceOverHorizon(
  viewerDir: THREE.Vector3,
  face: IcoFace,
  cosKeep: number,
): boolean {
  const maxDot = Math.max(
    face.centroid.dot(viewerDir),
    face.a.dot(viewerDir),
    face.b.dot(viewerDir),
    face.c.dot(viewerDir),
  );
  return maxDot < cosKeep;
}

/** @deprecated Prefer {@link faceOverHorizon}. */
export function faceBackCulled(
  viewerDir: THREE.Vector3,
  face: IcoFace,
  cosKeep = HORIZON_COS,
): boolean {
  return faceOverHorizon(viewerDir, face, cosKeep);
}

/**
 * Load set with enter/exit arc hysteresis and horizon (limb) cull.
 * Streaming is viewer-centric — not chase-camera FOV — so orbiting the cam
 * never thrash-remeshes the world behind the pup.
 * `prevIds` are faces kept last frame — they stay until they leave exitArc
 * / the horizon exit cosine.
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
    const wasLoaded = prevIds.has(face.index);
    const horizonCos = wasLoaded ? HORIZON_EXIT_COS : HORIZON_COS;
    if (faceOverHorizon(viewerDir, face, horizonCos)) continue;

    if (faceWithinArc(viewerDir, face, enterArc)) {
      out.push(face);
      continue;
    }
    if (wasLoaded && faceWithinArc(viewerDir, face, exitArc)) {
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

const _edgeMid = new THREE.Vector3();

/**
 * Arc length from a probe direction to the nearest sample on a face
 * (centroid, corners, edge midpoints). Centroid-only distance is wrong for
 * detail-1 faces: you can stand on a triangle whose centroid is ~100 m away.
 */
export function faceArcDistance(dir: THREE.Vector3, face: IcoFace): number {
  let min = geodesicDistance(dir, face.centroid);
  min = Math.min(min, geodesicDistance(dir, face.a));
  min = Math.min(min, geodesicDistance(dir, face.b));
  min = Math.min(min, geodesicDistance(dir, face.c));
  _edgeMid.addVectors(face.a, face.b).normalize();
  min = Math.min(min, geodesicDistance(dir, _edgeMid));
  _edgeMid.addVectors(face.b, face.c).normalize();
  min = Math.min(min, geodesicDistance(dir, _edgeMid));
  _edgeMid.addVectors(face.c, face.a).normalize();
  min = Math.min(min, geodesicDistance(dir, _edgeMid));
  return min;
}

function subdivForArc(arc: number, speedScale: number): number {
  const scale = Math.max(1, speedScale);
  let subdiv = ICO_FACE_SUBDIV;
  let level = CLIPMAP_LODS.length - 1;
  for (let i = 0; i < CLIPMAP_LODS.length; i++) {
    const ring = CLIPMAP_LODS[i]!;
    if (arc <= ring.maxArc * scale) {
      subdiv = ring.subdiv;
      level = i;
      break;
    }
  }
  // Close ring stays full quality — tier scale only thins mid/far so climbing
  // tiers remeshes the horizon, not the board.
  if (level === 0) return subdiv;
  return scaleLodSubdiv(subdiv, getPerfSettings().lodSubdivScale);
}

function levelForArc(arc: number, speedScale: number): number {
  const scale = Math.max(1, speedScale);
  for (let i = 0; i < CLIPMAP_LODS.length; i++) {
    if (arc <= CLIPMAP_LODS[i]!.maxArc * scale) return i;
  }
  return CLIPMAP_LODS.length - 1;
}

/**
 * Clipmap tessellation for a face, with rings expanded by `speedScale`
 * (≥1) so fast travel keeps denser mesh farther out.
 *
 * When `densityDir` is set, take the finer of probe vs density (look-ahead
 * streams ahead; pup pose keeps underfoot detail — look-ahead alone starved
 * the board of the close ring).
 */
export function faceSubdiv(
  viewerDir: THREE.Vector3,
  face: IcoFace,
  speedScale = 1,
  densityDir?: THREE.Vector3,
): number {
  let subdiv = subdivForArc(faceArcDistance(viewerDir, face), speedScale);
  if (densityDir) {
    subdiv = Math.max(
      subdiv,
      subdivForArc(faceArcDistance(densityDir, face), speedScale),
    );
  }
  return subdiv;
}

/** LOD ring index (0 = closest) for a face at the given viewer / speed. */
export function faceLodLevel(
  viewerDir: THREE.Vector3,
  face: IcoFace,
  speedScale = 1,
  densityDir?: THREE.Vector3,
): number {
  let level = levelForArc(faceArcDistance(viewerDir, face), speedScale);
  if (densityDir) {
    level = Math.min(
      level,
      levelForArc(faceArcDistance(densityDir, face), speedScale),
    );
  }
  return level;
}

/**
 * Promote each loaded face to max(own, neighbors') subdiv so shared edges
 * share the finer tessellation (no T-junction cracks at LOD rings).
 *
 * `densityDir` (pup) is optional — see {@link faceSubdiv}.
 */
export function stitchFaceSubdivs(
  viewerDir: THREE.Vector3,
  faceIds: Iterable<number>,
  speedScale = 1,
  out: Map<number, number> = new Map(),
  ids: number[] = [],
  densityDir?: THREE.Vector3,
): Map<number, number> {
  out.clear();
  ids.length = 0;
  const faces = getIcoFaces();
  for (const id of faceIds) {
    const face = faces[id];
    if (!face) continue;
    ids.push(id);
    out.set(id, faceSubdiv(viewerDir, face, speedScale, densityDir));
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
  /** Unit direction used for streaming / load set (look-ahead biased). */
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
 *
 * Streaming (load set) uses arc + horizon around the look-ahead viewer so
 * fast travel prefetches ahead. Tessellation density uses the finer of
 * pup pose vs look-ahead — look-ahead alone left coarse mesh under the board.
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
  // computeLodViewer already normalized pose into _poseDir.
  const enterArc = CHUNK_ARC_RADIUS * speedScale;
  const exitArc = enterArc + CULL_EXIT_SLACK;

  const near = cullFaces(_viewer, enterArc, exitArc, _loadedIds, _nearBuf);
  _nextLoaded.clear();
  for (const f of near) _nextLoaded.add(f.index);
  _loadedIds.clear();
  for (const id of _nextLoaded) _loadedIds.add(id);

  // Reuse stitch's id list — avoid allocating `near.map(...)` every frame.
  // Density from pup (_poseDir); stream center from look-ahead (_viewer).
  const subdivs = stitchFaceSubdivs(
    _viewer,
    _nextLoaded,
    speedScale,
    _lodMap,
    _lodIds,
    _poseDir,
  );

  const faces = getIcoFaces();
  _entries.length = 0;
  for (const id of _lodIds) {
    const face = faces[id];
    if (!face) continue;
    const level = faceLodLevel(_viewer, face, speedScale, _poseDir);
    _entries.push({
      faceIndex: id,
      subdiv: subdivs.get(id) ?? ICO_FACE_SUBDIV,
      level,
      color: lodColor(level),
    });
  }

  // Stable order for consumers / tests.
  _entries.sort((a, b) => a.faceIndex - b.faceIndex);

  // Skip alloc + listener wake when the streamed set is unchanged.
  // Continuous fields still update in place for debug / look-ahead readers.
  if (planUnchanged(_entries, snap.chunks)) {
    mutateSnapPose(snap, _viewer, speed, speedScale, lookAheadArc);
    return snap;
  }

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

function planUnchanged(
  next: readonly ChunkLodEntry[],
  prev: readonly ChunkLodEntry[],
): boolean {
  if (next.length !== prev.length) return false;
  for (let i = 0; i < next.length; i++) {
    const a = next[i]!;
    const b = prev[i]!;
    if (
      a.faceIndex !== b.faceIndex ||
      a.subdiv !== b.subdiv ||
      a.level !== b.level
    ) {
      return false;
    }
  }
  return true;
}

function mutateSnapPose(
  target: ChunkLodSnapshot,
  viewer: THREE.Vector3,
  speed: number,
  speedScale: number,
  lookAheadArc: number,
): void {
  const s = target as {
    viewerX: number;
    viewerY: number;
    viewerZ: number;
    speed: number;
    speedScale: number;
    lookAheadArc: number;
  };
  s.viewerX = viewer.x;
  s.viewerY = viewer.y;
  s.viewerZ = viewer.z;
  s.speed = speed;
  s.speedScale = speedScale;
  s.lookAheadArc = lookAheadArc;
}

/** Clear published plan (e.g. leaving play). */
export function resetChunkLod(): void {
  snap = EMPTY_SNAP;
  _loadedIds.clear();
  _nextLoaded.clear();
  emit();
}
