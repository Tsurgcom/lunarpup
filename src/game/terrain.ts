import * as THREE from "three";
import { writeMoonVertexColor } from "./moonMaterial";

export type CraterKind = "simple" | "complex" | "basin";

export type Crater = {
  /** Unit direction of the crater center. */
  dir: THREE.Vector3;
  /** Bowl radius as surface arc length (semi-minor for ellipses). */
  radius: number;
  depth: number;
  /**
   * Morphological class — skatepark mapping of lunar simple / complex / basin.
   * Defaults to a smooth simple bowl.
   */
  kind?: CraterKind;
  /**
   * Stretch along local yaw axis (>1 = elongated kidney / snake run).
   * 1 = circular lunar bowl.
   */
  aspect?: number;
  /** Ellipse major-axis yaw in the local east/north tangent frame (rad). */
  yaw?: number;
  /**
   * Flat floor as a fraction of radius (0–0.4). Skate parks need deck space;
   * real craters are closer to 0.
   */
  flat?: number;
  /**
   * Transition steepness (≥1). Higher keeps the floor longer, then rises
   * toward vert near the rim — pumpable walls without sheer cliffs.
   */
  steep?: number;
  /** Coping / inner-lip blend strength (0–1). */
  lip?: number;
  /** Raised ejecta rim height (defaults to ~16% of depth). */
  rimHeight?: number;
  /**
   * Outer ejecta width as a fraction of bowl radius beyond the lip
   * (rim spans t ∈ [1, 1+rimWidth]).
   */
  rimWidth?: number;
  /** Central peak height (complex) — island to carve around. */
  peakHeight?: number;
  /** Peak radius as a fraction of bowl radius (default ~0.16). */
  peakRadius?: number;
  /**
   * Peak-ring berm height (basins) — annular mountain that replaces a
   * single central peak (Orientale-style).
   */
  peakRing?: number;
  /** Peak-ring center as a fraction of bowl radius (default ~0.4). */
  peakRingCenter?: number;
  /** Peak-ring half-width as a fraction of bowl radius (default ~0.1). */
  peakRingWidth?: number;
  /** Soft wall terraces 0–1 (complex) — pumpable benches, not cliffs. */
  terrace?: number;
  /** Extra concentric rings beyond the main rim (basin pump-track loops). */
  rings?: number;
};

/** A height contribution sampled at a unit sphere direction. */
export type TerrainGenerator = {
  readonly name: string;
  sample(dir: THREE.Vector3): number;
};

/**
 * Circumference of the moon — one great-circle lap in any direction.
 */
export const MOON_CIRCUMFERENCE = 1920;

/** Sphere radius such that 2πR = MOON_CIRCUMFERENCE. */
export const MOON_RADIUS = MOON_CIRCUMFERENCE / (2 * Math.PI);

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

/** @deprecated Prefer `ICO_FACE_SUBDIV` / `faceSubdiv` — kept for callers. */
export const FACE_SUBDIV = ICO_FACE_SUBDIV;

/**
 * Near clipmap is dense enough that analytic height matches the mesh —
 * no concave contact bias (that laplacian lift created invisible spikes
 * where bowls / noise curved sharply).
 */

/** HUD globe radius. */
export const CHART_RADIUS = 1;

/** Vertical exaggeration on the HUD globe. */
export const CHART_HEIGHT_SCALE = 0.045;

/** Unit direction of the skate spawn (near +Z, slightly north). */
export const SPAWN_DIR = new THREE.Vector3(0, 0.12, 1).normalize();

const _tmpA = new THREE.Vector3();
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
const _craterE = new THREE.Vector3();
const _craterN = new THREE.Vector3();
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

/**
 * Normalized elliptical radius at `dir` relative to crater center.
 * `t < 1` is inside the bowl; uses geodesic arc with local aspect stretch.
 */
export function craterRadialT(crater: Crater, dir: THREE.Vector3): number {
  const cosAng = THREE.MathUtils.clamp(dir.dot(crater.dir), -1, 1);
  const ang = Math.acos(cosAng);
  if (ang < 1e-10) return 0;

  const arc = ang * MOON_RADIUS;
  const aspect = crater.aspect ?? 1;
  if (Math.abs(aspect - 1) < 1e-3) {
    return arc / crater.radius;
  }

  // Geodesic tangent at the crater center, then stretch in the yaw frame.
  _tmpA.copy(dir).addScaledVector(crater.dir, -cosAng).normalize();
  tangentBasis(crater.dir, _craterE, _craterN);
  const ce = _tmpA.dot(_craterE);
  const cn = _tmpA.dot(_craterN);
  const yaw = crater.yaw ?? 0;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const le = ce * cy + cn * sy;
  const ln = -ce * sy + cn * cy;
  const ae = crater.radius * aspect;
  const an = crater.radius;
  return Math.hypot((arc * le) / ae, (arc * ln) / an);
}

/**
 * Skate-friendly bowl: flat deck, gentle transition walls, soft coping lip.
 * steep is capped soft — no sheer cliffs between floor and rim.
 */
export function skateBowlShape(
  t: number,
  flat = 0.12,
  steep = 1.08,
): number {
  if (t >= 1) return 0;
  const flatClamped = THREE.MathUtils.clamp(flat, 0, 0.42);
  if (t <= flatClamped) return 1;

  const u = (t - flatClamped) / (1 - flatClamped);
  // Cap steep so walls never go cliff-vertical; cosine stays C1 at the rim.
  const p = 1 / THREE.MathUtils.clamp(steep, 0.85, 1.22);
  return 0.5 * (1 + Math.cos(Math.PI * Math.pow(Math.min(u, 1), p)));
}

/** Outer radial extent of crater influence including ejecta / basin rings. */
export function craterOuterT(crater: Crater): number {
  const rim = 1 + (crater.rimWidth ?? 0.22);
  const rings = crater.rings ?? 0;
  if (rings <= 0) return rim;
  // Outermost basin ring sits near 1.05 + 0.14·n + width.
  return Math.max(rim, 1.05 + rings * 0.14 + 0.2);
}

/**
 * Unit direction at elliptical radius `t` and azimuth `phi` (ellipse frame).
 * Inverse of craterRadialT — used to lay dense vertices along the coping.
 */
export function craterDirAt(
  crater: Crater,
  t: number,
  phi: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const aspect = crater.aspect ?? 1;
  const yaw = crater.yaw ?? 0;
  const le = Math.cos(phi);
  const ln = Math.sin(phi);
  const arc =
    (t * crater.radius) / Math.max(Math.hypot(le / aspect, ln), 1e-8);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const eHat = le * cy - ln * sy;
  const nHat = le * sy + ln * cy;
  tangentBasis(crater.dir, _craterE, _craterN);
  _offT
    .copy(_craterE)
    .multiplyScalar(eHat * arc)
    .addScaledVector(_craterN, nHat * arc);
  return expMap(crater.dir, _offT, out);
}

/** Soft central peak dome — carve-around island for complex craters. */
function centralPeak(t: number, peakRadius: number, peakHeight: number): number {
  if (peakHeight <= 0 || t >= peakRadius) return 0;
  const u = t / peakRadius;
  // Wide rounded dome — avoid needle spikes under the board.
  return peakHeight * Math.pow(1 - u * u, 2.2);
}

/**
 * Peak ring — annular mountain that replaces the central peak in basins
 * (Orientale-style). Fun as a circular pump berm inside the mare floor.
 */
function peakRingBump(
  t: number,
  ringCenter: number,
  ringWidth: number,
  height: number,
): number {
  if (height <= 0 || ringWidth <= 0) return 0;
  const d = (t - ringCenter) / Math.max(ringWidth, 0.12);
  return height * Math.exp(-d * d * 0.55);
}

/** Soft wall terraces — faint benches only (no step cliffs). */
function terraceRipple(t: number, flat: number, terrace: number): number {
  if (terrace <= 0 || t <= flat || t >= 1) return 0;
  const u = (t - flat) / (1 - flat);
  const wave =
    Math.sin(u * Math.PI * 2.1) * Math.pow(Math.sin(u * Math.PI), 1.6);
  return terrace * wave * 0.18;
}

/**
 * Concentric basin rings — multi-ring mountain chains beyond the peak ring.
 * Outermost rings are lower (secondary / ejecta scarps).
 */
function basinRings(
  t: number,
  rings: number,
  rimH: number,
  depth: number,
): number {
  if (rings <= 0 || t < 0.5) return 0;
  let y = 0;
  for (let i = 1; i <= rings; i++) {
    // Sit rings outside the main rim so they don't stack into a cliff.
    const center = 1.05 + i * 0.14;
    const width = 0.18 + i * 0.04;
    const amp = (rimH * 0.4 + depth * 0.04) * (1.0 - i * 0.22);
    const d = (t - center) / width;
    y += amp * Math.exp(-d * d * 0.55);
  }
  return y;
}

/**
 * Bowl dig + raised ejecta rim, with simple / complex / basin morphology.
 *
 * Depth-to-diameter (game `radius` ≈ half-diameter):
 * - simple  ≈ 1:5  (deep bowl)
 * - complex ≈ 1:15 (shallow flat floor + peak)
 * - basin   ≈ 1:30+ (mare floor + peak ring + multi-rings)
 */
export function craterDelta(crater: Crater, dir: THREE.Vector3): number {
  const t = craterRadialT(crater, dir);
  const outer = craterOuterT(crater);
  if (t >= outer) return 0;

  const kind = crater.kind ?? "simple";
  const flat =
    crater.flat ??
    (kind === "basin" ? 0.42 : kind === "complex" ? 0.26 : 0.08);
  const steep =
    crater.steep ??
    (kind === "basin" ? 1.0 : kind === "complex" ? 1.08 : 1.1);
  const lipAmt = crater.lip ?? (kind === "simple" ? 0.34 : 0.42);
  const rimH =
    crater.rimHeight ??
    crater.depth * (kind === "basin" ? 0.28 : kind === "complex" ? 0.14 : 0.11);
  const peakH = crater.peakHeight ?? 0;
  const peakR = crater.peakRadius ?? 0.18;
  const peakRing = crater.peakRing ?? 0;
  const terrace = crater.terrace ?? 0;
  const rings = crater.rings ?? 0;

  let y = 0;

  if (t < 1) {
    const bowl = skateBowlShape(t, flat, steep);
    // Early, wide lip blend — kills rim crest cliffs between floor and apron.
    const lipStart = kind === "basin" ? 0.52 : 0.62;
    const crestStart = kind === "basin" ? 0.58 : 0.68;
    const lip = THREE.MathUtils.smoothstep(t, lipStart, 1);
    const dig = -crater.depth * bowl * (1 - lip * lipAmt);
    const crest = THREE.MathUtils.smoothstep(t, crestStart, 1);
    const crestAmp = kind === "basin" ? rimH * 0.5 : rimH * 0.85;
    y = dig + crestAmp * crest * crest;

    if (kind === "complex" || peakH > 0) {
      y += centralPeak(t, peakR, peakH);
    }
    if (kind === "basin" || peakRing > 0) {
      // Peak ring sits on the mare floor, inside the main rim.
      const rc = crater.peakRingCenter ?? 0.4;
      const rw = crater.peakRingWidth ?? 0.14;
      y += peakRingBump(t, rc, rw, peakRing);
    }
    y += terraceRipple(t, flat, terrace) * crater.depth * 0.06;
  } else {
    const u = (t - 1) / Math.max(outer - 1, 1e-4);
    const fall = 1 - u;
    const ejecta = fall * fall * (3 - 2 * fall);
    y = rimH * ejecta * (kind === "basin" ? 0.35 : 0.85);
  }

  if (rings > 0) y += basinRings(t, rings, rimH, crater.depth);
  return y;
}

type AnchorOpts = {
  kind?: CraterKind;
  aspect?: number;
  yaw?: number;
  flat?: number;
  steep?: number;
  lip?: number;
  rimHeight?: number;
  rimWidth?: number;
  peakHeight?: number;
  peakRadius?: number;
  peakRing?: number;
  peakRingCenter?: number;
  peakRingWidth?: number;
  terrace?: number;
  rings?: number;
};

function makeAnchor(
  eastArc: number,
  northArc: number,
  radius: number,
  depth: number,
  opts: AnchorOpts = {},
): Crater {
  return {
    dir: offsetDir(SPAWN_DIR, eastArc, northArc),
    radius,
    depth,
    kind: opts.kind ?? "simple",
    ...opts,
  };
}

/**
 * Hand-placed skate park near spawn — linked bowls for transfers, a kidney
 * for long carves, and a snake run, while still reading as crater cluster.
 */
export const ANCHOR_CRATERS: Crater[] = [
  // Main plaza — complex flat deck (no peak so the spawn stays open).
  makeAnchor(0, 0, 22, 7.4, {
    kind: "complex",
    flat: 0.32,
    steep: 1.12,
    lip: 0.5,
    rimHeight: 1.05,
    rimWidth: 0.32,
    terrace: 0.15,
  }),
  // Kidney east — elongated carve line into the plaza rim.
  makeAnchor(36, -8, 15, 5.6, {
    kind: "simple",
    aspect: 1.55,
    yaw: 0.35,
    flat: 0.24,
    steep: 1.1,
    lip: 0.45,
    rimHeight: 0.8,
    rimWidth: 0.3,
  }),
  // Twin NW bowls — overlapping hip for transfers.
  makeAnchor(-28, 18, 13, 5.4, {
    kind: "simple",
    flat: 0.24,
    steep: 1.12,
    lip: 0.42,
    rimHeight: 0.75,
    rimWidth: 0.3,
  }),
  makeAnchor(-16, 30, 12, 5.0, {
    kind: "simple",
    flat: 0.22,
    steep: 1.1,
    lip: 0.4,
    rimHeight: 0.7,
    rimWidth: 0.3,
  }),
  // South mellow — wider floor, softer walls (warmup line).
  makeAnchor(-6, -34, 15, 4.6, {
    kind: "simple",
    flat: 0.36,
    steep: 1.02,
    lip: 0.36,
    rimHeight: 0.55,
    rimWidth: 0.28,
  }),
  // NE snake / half-pipe scar — long axis for speed runs.
  makeAnchor(30, 30, 11, 4.8, {
    kind: "simple",
    aspect: 2.15,
    yaw: -0.55,
    flat: 0.16,
    steep: 1.14,
    lip: 0.46,
    rimHeight: 0.7,
    rimWidth: 0.28,
  }),
  // SE satellite pocket — air / gap line off the kidney.
  makeAnchor(48, 10, 9, 4.0, {
    kind: "simple",
    flat: 0.22,
    steep: 1.12,
    lip: 0.42,
    rimHeight: 0.6,
    rimWidth: 0.3,
  }),
  // Complex with central peak — Tycho-style island hub (shallower 1:15 deck).
  makeAnchor(-42, -8, 24, 2.8, {
    kind: "complex",
    flat: 0.3,
    steep: 1.06,
    lip: 0.42,
    rimHeight: 0.7,
    rimWidth: 0.3,
    peakHeight: 1.2,
    peakRadius: 0.2,
    terrace: 0.2,
  }),
  // Impact basin — multi-ring mare plaza with peak ring (Orientale lite).
  makeAnchor(-62, -52, 72, 2.4, {
    kind: "basin",
    flat: 0.44,
    steep: 1.0,
    lip: 0.32,
    rimHeight: 0.8,
    rimWidth: 0.22,
    peakRing: 0.75,
    peakRingCenter: 0.38,
    peakRingWidth: 0.14,
    rings: 3,
    terrace: 0.08,
  }),
];

/** Keep procedural bowls out of the hand-placed skate park. */
const SPAWN_CLEAR_ARC = 36;

/**
 * Map the OG flat heightfield onto the sphere.
 * Horizontal scale sets feature size in arc units; height scale is lower so
 * bowl walls stay rideable (uniform scale would preserve OG cliffs).
 * Chosen so both hill and crater lattices tile the circumference exactly.
 */
const OG_XY_SCALE = 8 / 42; // ≈0.1905 → 14 hill cells, 18 crater cells
const OG_H_SCALE = 0.032;

/** OG hill lattice (pre-scale). */
const OG_HILL_CELL = 720;
/** OG crater lattice (pre-scale). */
const OG_CRATER_CELL = 560;

/** Longitude cell counts (must divide the circumference at OG_XY_SCALE). */
const OG_HILL_CELLS_X = Math.round(
  MOON_CIRCUMFERENCE / (OG_HILL_CELL * OG_XY_SCALE),
);
const OG_CRATER_CELLS_X = Math.round(
  MOON_CIRCUMFERENCE / (OG_CRATER_CELL * OG_XY_SCALE),
);

/** Max crater influence arc used for spatial bucket size (basins included). */
const CATALOG_MAX_INFLUENCE_ARC = 160;

const _nearCraters: Crater[] = [];
const _zoneNear: Crater[] = [];
const _bucketDir = new THREE.Vector3();
const _ogDir = new THREE.Vector3();

type CraterIndex = {
  catalog: Crater[];
  /** Cube-grid buckets: key "ix,iy,iz" → catalog indices. */
  buckets: Map<string, number[]>;
  scale: number;
};

let _craterIndex: CraterIndex | null = null;

function bucketKey(ix: number, iy: number, iz: number): string {
  return `${ix},${iy},${iz}`;
}

function hash2(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function ogSmoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Equirectangular unwrap: longitude/latitude × moon radius → OG-style XZ. */
function dirToTerrainXZ(dir: THREE.Vector3): { x: number; z: number } {
  const lon = Math.atan2(dir.x, dir.z);
  const lat = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
  return { x: lon * MOON_RADIUS, z: lat * MOON_RADIUS };
}

/** Inverse of dirToTerrainXZ (unit direction). */
function terrainXZToDir(
  x: number,
  z: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const lon = x / MOON_RADIUS;
  const lat = THREE.MathUtils.clamp(z / MOON_RADIUS, -Math.PI / 2, Math.PI / 2);
  const cosLat = Math.cos(lat);
  return out
    .set(Math.sin(lon) * cosLat, Math.sin(lat), Math.cos(lon) * cosLat)
    .normalize();
}

function modCell(g: number, n: number): number {
  return ((g % n) + n) % n;
}

/** Map a longitude arc into (-C/2, C/2] for atan2-compatible dirs. */
function wrapLonArc(x: number): number {
  const c = MOON_CIRCUMFERENCE;
  let v = ((x % c) + c) % c;
  if (v > c * 0.5) v -= c;
  return v;
}

function fractalNoiseDir(dir: THREE.Vector3, scale: number): number {
  let total = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < 5; i++) {
    _tmpD.copy(dir).multiplyScalar(scale * freq * 8);
    total += (smoothNoise3(_tmpD) * 2 - 1) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return total / norm;
}

/**
 * OG `calculateTerrainHeight` on the sphere: seamless 3D mare + ridge waves,
 * plus the original cell hills/craters placed on the sphere (geodesic bowls).
 * Longitude lattice is periodic so the date line does not pop features.
 */
export function calculateOgTerrainHeight(dir: THREE.Vector3): number {
  const { x, z } = dirToTerrainXZ(dir);
  const X = x / OG_XY_SCALE;
  const Z = z / OG_XY_SCALE;

  // Seamless mare (OG fractalNoise amplitudes) via 3D noise on the sphere.
  let y = fractalNoiseDir(dir, 0.42) * 22 * OG_H_SCALE;
  y += fractalNoiseDir(dir, 1.55) * 7 * OG_H_SCALE;

  // Soft ridge waves — lower exponents so crests don't cliff.
  y +=
    Math.pow(
      Math.max(0, Math.sin(dir.x * 5.8 + Math.sin(dir.y * 4.4) * 2.2)),
      1.55,
    ) *
    28 *
    OG_H_SCALE;
  y +=
    Math.pow(Math.max(0, Math.cos((dir.x + dir.z) * 5.1)), 1.85) *
    16 *
    OG_H_SCALE;

  // Soften lattice features near the poles where equirect cells collapse.
  const lat = THREE.MathUtils.clamp(z / MOON_RADIUS, -Math.PI / 2, Math.PI / 2);
  const poleFade = Math.pow(Math.max(0, Math.cos(lat)), 1.5);

  const cell = OG_HILL_CELL;
  const periodX = OG_HILL_CELLS_X * cell;
  const Xw = ((X % periodX) + periodX) % periodX;
  const baseCx = Math.floor(Xw / cell);
  const baseCz = Math.floor(Z / cell);
  for (let oz = -1; oz <= 1; oz++) {
    for (let ox = -1; ox <= 1; ox++) {
      const gx = modCell(baseCx + ox, OG_HILL_CELLS_X);
      const gz = baseCz + oz;
      const px = wrapLonArc(
        (gx + hash2(gx, gz) * 0.8 + 0.1) * cell * OG_XY_SCALE,
      );
      const pz =
        (gz + hash2(gx + 91, gz - 47) * 0.8 + 0.1) * cell * OG_XY_SCALE;
      const radius = (170 + hash2(gx - 12, gz + 31) * 260) * OG_XY_SCALE;
      const height = (45 + hash2(gx + 7, gz + 13) * 95) * OG_H_SCALE;
      terrainXZToDir(px, pz, _ogDir);
      const dist = geodesicDistance(dir, _ogDir);
      const t = Math.max(0, 1 - dist / radius);
      // Softer falloff than OG 2.35 keeps mound skirts rideable.
      y += Math.pow(t, 3.1) * height * 0.6 * poleFade;
    }
  }

  const craterCell = OG_CRATER_CELL;
  const periodCX = OG_CRATER_CELLS_X * craterCell;
  const Xcw = ((X % periodCX) + periodCX) % periodCX;
  const ccx = Math.floor(Xcw / craterCell);
  const ccz = Math.floor(Z / craterCell);
  // ±2 so large basins (radius ~70) don't pop at cell borders.
  for (let oz = -2; oz <= 2; oz++) {
    for (let ox = -2; ox <= 2; ox++) {
      const gx = modCell(ccx + ox, OG_CRATER_CELLS_X);
      const gz = ccz + oz;
      const crater = ogCraterAtCell(gx, gz);
      if (!crater) continue;
      y += craterDelta(crater, dir) * poleFade;
    }
  }

  return y;
}

/**
 * Lunar size-class morphology, scaled for a skateable moon.
 *
 * Depth uses diameter D = 2·radius:
 * - simple  ≈ D/5   (deep bowl, no peak)
 * - complex ≈ D/15  (flat floor + central peak + terraces)
 * - basin   ≈ D/35  (mare floor + peak ring + multi-rings)
 */
function ogCraterMorph(
  gx: number,
  gz: number,
): {
  kind: CraterKind;
  radius: number;
  depth: number;
  flat: number;
  steep: number;
  lip: number;
  rimHeight: number;
  rimWidth: number;
  peakHeight?: number;
  peakRadius?: number;
  peakRing?: number;
  peakRingCenter?: number;
  peakRingWidth?: number;
  terrace?: number;
  rings?: number;
  aspect?: number;
  yaw?: number;
} {
  const roll = hash2(gx + 201, gz - 109);
  const h2 = hash2(gx + 22, gz + 22);
  const h3 = hash2(gx - 44, gz + 11);
  const h4 = hash2(gx + 14, gz - 14);
  const h5 = hash2(gx + 5, gz + 6);

  // Size class from occupancy roll — more simples, fewer basins.
  const classRoll = (roll - 0.42) / 0.58;

  if (classRoll < 0.62) {
    // Simple — Moltke-like bowls. Diameter < ~18 → radius < ~9.
    const radius = 3.8 + h2 * 5.2;
    const diameter = radius * 2;
    const depth = diameter * (0.14 + h3 * 0.03); // softer ~1:6–1:7
    return {
      kind: "simple",
      radius,
      depth,
      flat: 0.06 + h4 * 0.08,
      steep: 1.04 + h5 * 0.1,
      lip: 0.3 + h4 * 0.1,
      rimHeight: depth * (0.08 + h4 * 0.04),
      rimWidth: 0.22 + h5 * 0.08,
      // Mostly circular; rare slight oval.
      aspect: h5 < 0.82 ? 1 : 1.12 + h5 * 0.2,
      yaw: h4 * Math.PI * 2,
    };
  }

  if (classRoll < 0.92) {
    // Complex — Tycho/Copernicus. Diameter ~24–80 → radius 12–40.
    const radius = 12 + h2 * 28;
    const diameter = radius * 2;
    const depth = diameter * (0.045 + h3 * 0.02); // ~1:15–1:22
    const peakHeight = depth * (0.28 + h4 * 0.22);
    return {
      kind: "complex",
      radius,
      depth,
      flat: 0.24 + h4 * 0.12,
      steep: 1.02 + h5 * 0.1,
      lip: 0.36 + h4 * 0.1,
      rimHeight: depth * (0.12 + h5 * 0.06),
      rimWidth: 0.26 + h4 * 0.08,
      peakHeight,
      peakRadius: 0.14 + h5 * 0.1,
      terrace: 0.15 + h4 * 0.2,
      aspect: h5 < 0.7 ? 1 : 1.08 + h5 * 0.28,
      yaw: h4 * Math.PI * 2,
    };
  }

  // Impact basin — Imbrium/Orientale lite. Diameter ~110–190.
  const radius = 55 + h2 * 40;
  const diameter = radius * 2;
  const depth = diameter * (0.018 + h3 * 0.012); // ~1:35–1:55
  const rimHeight = Math.max(0.7, depth * (0.32 + h5 * 0.15));
  return {
    kind: "basin",
    radius,
    depth: Math.max(1.8, depth),
    flat: 0.42 + h4 * 0.08,
    steep: 1.0 + h5 * 0.04,
    lip: 0.3 + h4 * 0.08,
    rimHeight,
    rimWidth: 0.2 + h4 * 0.08,
    peakRing: rimHeight * (0.5 + h4 * 0.15),
    peakRingCenter: 0.34 + h5 * 0.1,
    peakRingWidth: 0.12 + h4 * 0.06,
    rings: h5 < 0.4 ? 2 : 3,
    terrace: 0.06 + h4 * 0.1,
  };
}

function ogCraterAtCell(gx: number, gz: number): Crater | null {
  if (hash2(gx + 201, gz - 109) < 0.42) return null;

  const craterCell = OG_CRATER_CELL;
  const cx = wrapLonArc(
    (gx + 0.18 + hash2(gx + 5, gz + 6) * 0.64) * craterCell * OG_XY_SCALE,
  );
  const cz =
    (gz + 0.18 + hash2(gx - 8, gz + 3) * 0.64) * craterCell * OG_XY_SCALE;

  const morph = ogCraterMorph(gx, gz);
  terrainXZToDir(cx, cz, _ogDir);
  if (
    geodesicDistance(_ogDir, SPAWN_DIR) <
    SPAWN_CLEAR_ARC + morph.radius * 0.4
  ) {
    return null;
  }

  return {
    dir: _ogDir.clone(),
    ...morph,
  };
}

function buildCraterIndex(): CraterIndex {
  const catalog: Crater[] = [];
  const cellArc = OG_CRATER_CELL * OG_XY_SCALE;
  const zMin = Math.floor((-0.5 * Math.PI * MOON_RADIUS) / cellArc) - 1;
  const zMax = Math.ceil((0.5 * Math.PI * MOON_RADIUS) / cellArc) + 1;

  for (let gz = zMin; gz <= zMax; gz++) {
    for (let gx = 0; gx < OG_CRATER_CELLS_X; gx++) {
      const crater = ogCraterAtCell(gx, gz);
      if (crater) catalog.push(crater);
    }
  }

  const scale = MOON_RADIUS / CATALOG_MAX_INFLUENCE_ARC;
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < catalog.length; i++) {
    const c = catalog[i]!;
    _bucketDir.copy(c.dir).multiplyScalar(scale);
    const ix = Math.floor(_bucketDir.x);
    const iy = Math.floor(_bucketDir.y);
    const iz = Math.floor(_bucketDir.z);
    const key = bucketKey(ix, iy, iz);
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push(i);
  }

  return { catalog, buckets, scale };
}

function ensureCraterIndex(): CraterIndex {
  if (!_craterIndex) _craterIndex = buildCraterIndex();
  return _craterIndex;
}

/** Fixed procedural crater catalog from the OG lattice (lazy singleton). */
export function getCraterCatalog(): readonly Crater[] {
  return ensureCraterIndex().catalog;
}

/**
 * Fill `out` with catalog craters whose influence may reach `dir`.
 * Uses cube buckets + geodesic cull (no ownership / pop-in).
 */
export function cratersNear(
  dir: THREE.Vector3,
  out: Crater[] = _nearCraters,
): Crater[] {
  out.length = 0;
  const { catalog, buckets, scale } = ensureCraterIndex();
  _bucketDir.copy(dir).normalize().multiplyScalar(scale);
  const ix0 = Math.floor(_bucketDir.x);
  const iy0 = Math.floor(_bucketDir.y);
  const iz0 = Math.floor(_bucketDir.z);

  for (let dz = -2; dz <= 2; dz++) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const list = buckets.get(bucketKey(ix0 + dx, iy0 + dy, iz0 + dz));
        if (!list) continue;
        for (const id of list) {
          const crater = catalog[id]!;
          const aspect = crater.aspect ?? 1;
          const reach =
            crater.radius * craterOuterT(crater) * Math.max(aspect, 1) * 1.05;
          if (geodesicDistance(dir, crater.dir) <= reach) out.push(crater);
        }
      }
    }
  }
  return out;
}

/**
 * OG landscape sampled on the sphere. Fades out around the hand-placed
 * skate park so anchors own the plaza.
 */
export const ogLandscape: TerrainGenerator = {
  name: "ogLandscape",
  sample(dir) {
    let y = calculateOgTerrainHeight(dir);
    const dist = geodesicDistance(dir, SPAWN_DIR);
    if (dist < SPAWN_CLEAR_ARC) {
      // Hard-clear the plaza so anchors own the flat deck.
      const t = Math.max(
        0,
        (dist - SPAWN_CLEAR_ARC * 0.55) / (SPAWN_CLEAR_ARC * 0.45),
      );
      y *= ogSmoothstep(t);
    }
    return y;
  },
};

/** Fine grit on top of the OG crust (sphere-native 3D noise). */
export const regolithDetail: TerrainGenerator = {
  name: "regolithDetail",
  sample(dir) {
    // Keep grit tiny — larger amplitudes read as invisible spikes under hard contact.
    const grit = fbmDir(dir, 1.25, 3) * 0.06;
    const dist = geodesicDistance(dir, SPAWN_DIR);
    if (dist < SPAWN_CLEAR_ARC * 0.7) return grit * (dist / (SPAWN_CLEAR_ARC * 0.7));
    return grit;
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

/** OG procedural crust + hand-placed skate park. */
export const LUNAR_GENERATORS: readonly TerrainGenerator[] = [
  ogLandscape,
  regolithDetail,
  anchorBowls,
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

/**
 * Height for board / rock contact — same analytic crust the mesh uses.
 * (Former concave bias was removed: laplacian lift spiked on sharp bowls.)
 */
export function sampleContactHeightDir(
  dir: THREE.Vector3,
  h0?: number,
): number {
  return h0 ?? sampleHeightDir(dir);
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
  eps = 0.7,
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

/** World position on the displaced crust along `dir`, then offset along the surface normal. */
export function surfacePoint(
  dir: THREE.Vector3,
  clearance = 0,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  _surfDir.copy(dir).normalize();
  const h = sampleContactHeightDir(_surfDir);
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
  /** Indices of faces that share an edge. */
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

  // Edge → face indices sharing that edge (for LOD stitching).
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
 * Vertices use analytic height (same as physics); albedo from elev.
 */
export function createFaceGeometry(
  face: IcoFace,
  subdiv = ICO_FACE_SUBDIV,
  radius = MOON_RADIUS,
): THREE.BufferGeometry {
  const n = Math.max(1, subdiv | 0);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const dir = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const colorBuf = new Float32Array(3);

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
      const hAnalytic = sampleHeightDir(dir);
      const h = sampleContactHeightDir(dir, hAnalytic);
      const r = radius + h;
      positions.push(dir.x * r, dir.y * r, dir.z * r);

      sampleNormalDir(dir, normal, 0.7, hAnalytic);
      const slope = 1 - THREE.MathUtils.clamp(normal.dot(dir), 0, 1);
      writeMoonVertexColor(dir, hAnalytic, slope, colorBuf, 0);
      colors.push(colorBuf[0]!, colorBuf[1]!, colorBuf[2]!);
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
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Faces whose centroid lies within `arcRadius` of `viewerDir`. */
export function facesNear(
  viewerDir: THREE.Vector3,
  arcRadius = CHUNK_ARC_RADIUS,
  out: IcoFace[] = [],
): IcoFace[] {
  const faces = getIcoFaces();
  const cosMax = Math.cos(arcRadius / MOON_RADIUS);
  out.length = 0;
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

/**
 * Promote each loaded face to max(own, neighbors') subdiv so shared edges
 * share the finer tessellation (no T-junction cracks at LOD rings).
 */
export function stitchFaceSubdivs(
  viewerDir: THREE.Vector3,
  faceIds: Iterable<number>,
  out: Map<number, number> = new Map(),
  /** Caller-owned scratch — reused to avoid per-frame GC. */
  ids: number[] = [],
): Map<number, number> {
  out.clear();
  ids.length = 0;
  const faces = getIcoFaces();
  for (const id of faceIds) {
    const face = faces[id];
    if (!face) continue;
    ids.push(id);
    out.set(id, faceSubdiv(viewerDir, face));
  }
  // One promotion pass against neighbors that are also loaded.
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

/**
 * Whether a surface direction sits inside any bowl or rim
 * (anchors + procedural catalog).
 */
export function dirInCraterZone(dir: THREE.Vector3): boolean {
  for (const crater of ANCHOR_CRATERS) {
    if (craterRadialT(crater, dir) < craterOuterT(crater) + 0.2) return true;
  }
  const near = cratersNear(dir, _zoneNear);
  for (const crater of near) {
    if (craterRadialT(crater, dir) < craterOuterT(crater) + 0.2) return true;
  }
  return false;
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
  const normal = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    dir.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    const h = sampleHeightDir(dir);
    const r = radius * (1 + (h * heightScale) / MOON_RADIUS);
    pos.setXYZ(i, dir.x * r, dir.y * r, dir.z * r);

    sampleNormalDir(dir, normal, 0.7, h);
    const slope = 1 - THREE.MathUtils.clamp(normal.dot(dir), 0, 1);
    writeMoonVertexColor(dir, h, slope, colors, i * 3);
  }

  pos.needsUpdate = true;
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}
