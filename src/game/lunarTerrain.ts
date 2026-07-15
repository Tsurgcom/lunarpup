import * as THREE from "three";
import type { TerrainGenerator } from "./chunkLod";
import { MOON_RADIUS, SPAWN_DIR } from "./moon";

/**
 * Fresh sphere-native lunar crust — deep skate bowls, not a flat-heightfield port.
 *
 * Height is a radial offset above {@link MOON_RADIUS}. Negative = crater floor.
 */

export type Crater = {
  dir: THREE.Vector3;
  /** Bowl semi-minor radius as surface arc length (m). */
  radius: number;
  /** Floor dig depth (m) — large values = massive bowls. */
  depth: number;
  /** Flat deck fraction of radius (0–0.4). */
  flat?: number;
  /** Wall steepness (≥1). Soft-capped so walls stay rideable. */
  steep?: number;
  /** Coping blend (0–1). */
  lip?: number;
  /** Raised ejecta rim height. */
  rimHeight?: number;
  /** Outer ejecta width as a fraction of bowl radius. */
  rimWidth?: number;
  /** Stretch along local yaw (>1 = elongated). */
  aspect?: number;
  /** Ellipse major-axis yaw in the east/north frame (rad). */
  yaw?: number;
  /** Optional central peak height. */
  peakHeight?: number;
  /** Peak radius as a fraction of bowl radius. */
  peakRadius?: number;
};

const _tmpA = new THREE.Vector3();
const _tmpD = new THREE.Vector3();
const _sampleDir = new THREE.Vector3();
const _east = new THREE.Vector3();
const _north = new THREE.Vector3();
const _offT = new THREE.Vector3();
const _craterE = new THREE.Vector3();
const _craterN = new THREE.Vector3();
const _bucketDir = new THREE.Vector3();
const _cellDir = new THREE.Vector3();
const _nearScratch: Crater[] = [];

/** Keep procedural bowls out of the hand-placed plaza. */
const SPAWN_CLEAR_ARC = 40;

/** Max influence arc for spatial buckets (largest basins). */
const MAX_INFLUENCE_ARC = 180;

function hash2(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return n - Math.floor(n);
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
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(x00, x10, v),
    THREE.MathUtils.lerp(x01, x11, v),
    w,
  );
}

function fbmDir(dir: THREE.Vector3, scale: number, octaves = 4): number {
  let value = 0;
  let amp = 0.55;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    _tmpD.copy(dir).multiplyScalar(scale * freq * 8);
    value += (smoothNoise3(_tmpD) * 2 - 1) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.05;
  }
  return value / Math.max(norm, 1e-8);
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

/**
 * Exponential map: walk `tangent` (world-length) along the sphere from `dir`.
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

function offsetDir(
  base: THREE.Vector3,
  eastArc: number,
  northArc: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  tangentBasis(base, _east, _north);
  _offT.copy(_east).multiplyScalar(eastArc).addScaledVector(_north, northArc);
  return expMap(base, _offT, out);
}

/** Normalized elliptical radius; t < 1 is inside the bowl. */
export function craterRadialT(crater: Crater, dir: THREE.Vector3): number {
  const cosAng = THREE.MathUtils.clamp(dir.dot(crater.dir), -1, 1);
  const ang = Math.acos(cosAng);
  if (ang < 1e-10) return 0;

  const arc = ang * MOON_RADIUS;
  const aspect = crater.aspect ?? 1;
  if (Math.abs(aspect - 1) < 1e-3) {
    return arc / crater.radius;
  }

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

export function craterOuterT(crater: Crater): number {
  return 1 + (crater.rimWidth ?? 0.28);
}

/**
 * Smooth skate bowl profile — flat deck, cosine walls, C1 at the rim.
 */
export function skateBowlShape(t: number, flat = 0.12, steep = 1.1): number {
  if (t >= 1) return 0;
  const flatClamped = THREE.MathUtils.clamp(flat, 0, 0.42);
  if (t <= flatClamped) return 1;
  const u = (t - flatClamped) / (1 - flatClamped);
  const p = 1 / THREE.MathUtils.clamp(steep, 0.85, 1.25);
  return 0.5 * (1 + Math.cos(Math.PI * Math.min(u, 1) ** p));
}

function centralPeak(
  t: number,
  peakRadius: number,
  peakHeight: number,
): number {
  if (peakHeight <= 0 || t >= peakRadius) return 0;
  const u = t / peakRadius;
  return peakHeight * (1 - u * u) ** 2.2;
}

/** Bowl dig + raised ejecta rim. */
export function craterDelta(crater: Crater, dir: THREE.Vector3): number {
  const t = craterRadialT(crater, dir);
  const outer = craterOuterT(crater);
  if (t >= outer) return 0;

  const flat = crater.flat ?? 0.1;
  const steep = crater.steep ?? 1.1;
  const lipAmt = crater.lip ?? 0.38;
  const rimH = crater.rimHeight ?? crater.depth * 0.12;
  const peakH = crater.peakHeight ?? 0;
  const peakR = crater.peakRadius ?? 0.18;

  if (t < 1) {
    const bowl = skateBowlShape(t, flat, steep);
    const lip = THREE.MathUtils.smoothstep(t, 0.58, 1);
    const dig = -crater.depth * bowl * (1 - lip * lipAmt);
    const crest = THREE.MathUtils.smoothstep(t, 0.66, 1);
    let y = dig + rimH * 0.85 * crest * crest;
    if (peakH > 0) y += centralPeak(t, peakR, peakH);
    return y;
  }

  const u = (t - 1) / Math.max(outer - 1, 1e-4);
  const fall = 1 - u;
  const ejecta = fall * fall * (3 - 2 * fall);
  return rimH * ejecta * 0.9;
}

function makeAnchor(
  eastArc: number,
  northArc: number,
  radius: number,
  depth: number,
  opts: Omit<Crater, "dir" | "radius" | "depth"> = {},
): Crater {
  return {
    dir: offsetDir(SPAWN_DIR, eastArc, northArc),
    radius,
    depth,
    ...opts,
  };
}

/**
 * Hand-placed mega bowls near spawn — deep enough to read as lunar chasms
 * and fun enough to skate as linked plazas.
 */
export const ANCHOR_CRATERS: Crater[] = [
  // Main plaza — deep but wide so walls stay skateable (not near-vert).
  makeAnchor(0, 0, 36, 11, {
    flat: 0.32,
    steep: 1.05,
    lip: 0.42,
    rimHeight: 1.4,
    rimWidth: 0.32,
  }),
  // East kidney — elongated carve line into the plaza.
  makeAnchor(48, -12, 22, 8.5, {
    aspect: 1.65,
    yaw: 0.4,
    flat: 0.22,
    steep: 1.08,
    lip: 0.42,
    rimHeight: 1.1,
    rimWidth: 0.3,
  }),
  // Twin NW bowls — overlapping hip for transfers.
  makeAnchor(-38, 24, 18, 8, {
    flat: 0.22,
    steep: 1.08,
    lip: 0.4,
    rimHeight: 1.0,
    rimWidth: 0.3,
  }),
  makeAnchor(-22, 40, 16, 7.5, {
    flat: 0.2,
    steep: 1.08,
    lip: 0.4,
    rimHeight: 0.95,
    rimWidth: 0.3,
  }),
  // South warmup — wider floor, mellow walls.
  makeAnchor(-4, -46, 20, 6.5, {
    flat: 0.36,
    steep: 1.02,
    lip: 0.36,
    rimHeight: 0.85,
    rimWidth: 0.28,
  }),
  // NE snake scar — long axis for speed runs.
  makeAnchor(40, 40, 16, 7, {
    aspect: 2.2,
    yaw: -0.55,
    flat: 0.16,
    steep: 1.1,
    lip: 0.44,
    rimHeight: 0.95,
    rimWidth: 0.28,
  }),
  // SE pocket — air / gap off the kidney.
  makeAnchor(64, 14, 13, 6.5, {
    flat: 0.2,
    steep: 1.1,
    lip: 0.4,
    rimHeight: 0.85,
    rimWidth: 0.28,
  }),
  // Peak island hub — carve-around mountain.
  makeAnchor(-56, -8, 32, 6.5, {
    flat: 0.28,
    steep: 1.04,
    lip: 0.4,
    rimHeight: 1.0,
    rimWidth: 0.3,
    peakHeight: 2.0,
    peakRadius: 0.2,
  }),
  // Far mega-basin — deep chasm kept clear of the plaza ejecta apron.
  makeAnchor(-120, -100, 80, 16, {
    flat: 0.42,
    steep: 1.02,
    lip: 0.32,
    rimHeight: 1.8,
    rimWidth: 0.16,
    peakHeight: 2.8,
    peakRadius: 0.16,
  }),
];

// ---------------------------------------------------------------------------
// Procedural sphere lattice (cube-projected cells → unit dirs)
// ---------------------------------------------------------------------------

const CELL_ARC = 95;
const GRID = Math.max(4, Math.round((Math.PI * MOON_RADIUS) / CELL_ARC));

type CraterIndex = {
  catalog: Crater[];
  buckets: Map<string, number[]>;
  scale: number;
};

let _craterIndex: CraterIndex | null = null;

function bucketKey(ix: number, iy: number, iz: number): string {
  return `${ix},${iy},${iz}`;
}

/**
 * Map a cube-face cell to a unit direction. Faces 0..5 cover the sphere
 * without the polar collapse of equirectangular lattices.
 */
function cellToDir(
  face: number,
  i: number,
  j: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const u = (i + 0.5) / GRID;
  const v = (j + 0.5) / GRID;
  const a = u * 2 - 1;
  const b = v * 2 - 1;
  switch (face) {
    case 0:
      out.set(1, b, -a);
      break;
    case 1:
      out.set(-1, b, a);
      break;
    case 2:
      out.set(a, 1, -b);
      break;
    case 3:
      out.set(a, -1, b);
      break;
    case 4:
      out.set(a, b, 1);
      break;
    default:
      out.set(-a, b, -1);
      break;
  }
  return out.normalize();
}

function proceduralCraterAt(face: number, i: number, j: number): Crater | null {
  const roll = hash2(face * 97 + i, j * 53 + face);
  // Sparse occupancy — leave mare between bowls.
  if (roll < 0.62) return null;

  cellToDir(face, i, j, _cellDir);
  // Jitter within the cell so the lattice doesn't look like a grid.
  const jE = (hash2(i + 3, j + face) - 0.5) * CELL_ARC * 0.55;
  const jN = (hash2(i - 7, j + 11 + face) - 0.5) * CELL_ARC * 0.55;
  offsetDir(_cellDir, jE, jN, _cellDir);

  const classRoll = hash2(face + i * 13, j * 17 + 9);
  const h2 = hash2(i + 22, j + face * 3);
  const h3 = hash2(i - 4, j + 19);
  const h4 = hash2(face * 5 + i, j - 14);

  let radius: number;
  let depth: number;
  let flat: number;
  let steep: number;
  let lip: number;
  let rimHeight: number;
  let rimWidth: number;
  let peakHeight = 0;
  let peakRadius = 0.18;
  let aspect = 1;
  const yaw = h4 * Math.PI * 2;

  if (classRoll < 0.55) {
    // Pocket bowls — deep relative to size.
    radius = 5 + h2 * 8;
    depth = radius * (0.55 + h3 * 0.25); // ~1:1.5 diameter → dramatic pits
    flat = 0.06 + h4 * 0.1;
    steep = 1.08 + h3 * 0.12;
    lip = 0.32 + h4 * 0.12;
    rimHeight = depth * (0.08 + h2 * 0.05);
    rimWidth = 0.22 + h3 * 0.1;
    aspect = h2 < 0.75 ? 1 : 1.15 + h3 * 0.35;
  } else if (classRoll < 0.88) {
    // Mid-size skate bowls — the meat of the moon.
    radius = 14 + h2 * 22;
    depth = radius * (0.42 + h3 * 0.22); // massive
    flat = 0.14 + h4 * 0.14;
    steep = 1.06 + h3 * 0.12;
    lip = 0.38 + h4 * 0.1;
    rimHeight = depth * (0.09 + h2 * 0.04);
    rimWidth = 0.26 + h4 * 0.08;
    if (h2 > 0.7) {
      peakHeight = depth * (0.18 + h4 * 0.12);
      peakRadius = 0.14 + h3 * 0.08;
    }
    aspect = h3 < 0.65 ? 1 : 1.2 + h4 * 0.4;
  } else {
    // Mega basins — horizon-scale chasms.
    radius = 48 + h2 * 55;
    depth = radius * (0.22 + h3 * 0.12);
    flat = 0.32 + h4 * 0.1;
    steep = 1.02 + h3 * 0.06;
    lip = 0.34 + h4 * 0.08;
    rimHeight = Math.max(1.4, depth * (0.12 + h2 * 0.06));
    rimWidth = 0.22 + h4 * 0.08;
    peakHeight = depth * (0.14 + h4 * 0.1);
    peakRadius = 0.12 + h3 * 0.08;
  }

  if (geodesicDistance(_cellDir, SPAWN_DIR) < SPAWN_CLEAR_ARC + radius * 0.45) {
    return null;
  }

  return {
    dir: _cellDir.clone(),
    radius,
    depth,
    flat,
    steep,
    lip,
    rimHeight,
    rimWidth,
    aspect,
    yaw,
    peakHeight: peakHeight > 0 ? peakHeight : undefined,
    peakRadius: peakHeight > 0 ? peakRadius : undefined,
  };
}

function buildCraterIndex(): CraterIndex {
  const catalog: Crater[] = [];
  for (let face = 0; face < 6; face++) {
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const crater = proceduralCraterAt(face, i, j);
        if (crater) catalog.push(crater);
      }
    }
  }

  const scale = MOON_RADIUS / MAX_INFLUENCE_ARC;
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

export function getCraterCatalog(): readonly Crater[] {
  return ensureCraterIndex().catalog;
}

/** Catalog craters whose influence may reach `dir`. */
export function cratersNear(
  dir: THREE.Vector3,
  out: Crater[] = _nearScratch,
  opts?: { neighborhood?: number; minRadius?: number },
): Crater[] {
  out.length = 0;
  const { catalog, buckets, scale } = ensureCraterIndex();
  _bucketDir.copy(dir).normalize().multiplyScalar(scale);
  const ix0 = Math.floor(_bucketDir.x);
  const iy0 = Math.floor(_bucketDir.y);
  const iz0 = Math.floor(_bucketDir.z);
  const neighborhood = opts?.neighborhood ?? 2;
  const minRadius = opts?.minRadius ?? 0;

  for (let dz = -neighborhood; dz <= neighborhood; dz++) {
    for (let dy = -neighborhood; dy <= neighborhood; dy++) {
      for (let dx = -neighborhood; dx <= neighborhood; dx++) {
        const list = buckets.get(bucketKey(ix0 + dx, iy0 + dy, iz0 + dz));
        if (!list) continue;
        for (const id of list) {
          const crater = catalog[id]!;
          if (crater.radius < minRadius) continue;
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
 * Visual height quality for clipmap builds.
 * Physics / ride-shell always uses {@link sampleHeightDir} at `"near"`.
 */
export type HeightSampleQuality = "near" | "mid" | "far";

/** Map edge subdiv → sampler quality (far rings = cheaper FBM / craters). */
export function heightQualityForSubdiv(subdiv: number): HeightSampleQuality {
  if (subdiv <= 6) return "far";
  if (subdiv <= 16) return "mid";
  return "near";
}

/** Soft mare undulation — low amplitude so bowls stay the hero. */
function mareHeight(
  dir: THREE.Vector3,
  quality: HeightSampleQuality = "near",
): number {
  if (quality === "far") {
    let y = fbmDir(dir, 0.35, 2) * 1.8;
    y +=
      Math.max(0, Math.sin(dir.x * 4.2 + Math.sin(dir.y * 3.1) * 1.6)) ** 1.8 *
      1.4;
    return y;
  }
  if (quality === "mid") {
    let y = fbmDir(dir, 0.35, 3) * 1.8;
    y += fbmDir(dir, 1.1, 2) * 0.55;
    y +=
      Math.max(0, Math.sin(dir.x * 4.2 + Math.sin(dir.y * 3.1) * 1.6)) ** 1.8 *
      1.4;
    return y;
  }
  let y = fbmDir(dir, 0.35, 4) * 1.8;
  y += fbmDir(dir, 1.1, 3) * 0.55;
  // Gentle highland ridges — never cliffy.
  y +=
    Math.max(0, Math.sin(dir.x * 4.2 + Math.sin(dir.y * 3.1) * 1.6)) ** 1.8 *
    1.4;
  return y;
}

/** Tiny grit — kept small so hard contact stays smooth. */
function gritHeight(dir: THREE.Vector3): number {
  return fbmDir(dir, 2.4, 2) * 0.04;
}

function fadeNearSpawn(dir: THREE.Vector3, y: number): number {
  const dist = geodesicDistance(dir, SPAWN_DIR);
  if (dist >= SPAWN_CLEAR_ARC) return y;
  const t = Math.max(
    0,
    (dist - SPAWN_CLEAR_ARC * 0.5) / (SPAWN_CLEAR_ARC * 0.5),
  );
  const s = t * t * (3 - 2 * t);
  return y * s;
}

/** Radial height offset at a unit direction. */
export function sampleHeightDir(
  dir: THREE.Vector3,
  quality: HeightSampleQuality = "near",
): number {
  _sampleDir.copy(dir).normalize();

  let y = fadeNearSpawn(_sampleDir, mareHeight(_sampleDir, quality));
  if (quality === "near") {
    y += gritHeight(_sampleDir);
  } else if (quality === "mid") {
    y += gritHeight(_sampleDir) * 0.35;
  }

  for (const crater of ANCHOR_CRATERS) {
    y += craterDelta(crater, _sampleDir);
  }

  const near =
    quality === "far"
      ? cratersNear(_sampleDir, _nearScratch, {
          neighborhood: 1,
          minRadius: 14,
        })
      : quality === "mid"
        ? cratersNear(_sampleDir, _nearScratch, {
            neighborhood: 2,
            minRadius: 6,
          })
        : cratersNear(_sampleDir);
  for (const crater of near) {
    y += craterDelta(crater, _sampleDir);
  }

  return y;
}

/** Finite-difference slope magnitude (unitless-ish) for vertex colour cues. */
export function sampleSlopeDir(dir: THREE.Vector3, eps = 1.4e-3): number {
  _sampleDir.copy(dir).normalize();
  tangentBasis(_sampleDir, _east, _north);
  const h0 = sampleHeightDir(_sampleDir);

  _tmpA.copy(_sampleDir).addScaledVector(_east, eps).normalize();
  const hE = sampleHeightDir(_tmpA);
  _tmpA.copy(_sampleDir).addScaledVector(_north, eps).normalize();
  const hN = sampleHeightDir(_tmpA);

  const dE = (hE - h0) / (eps * MOON_RADIUS);
  const dN = (hN - h0) / (eps * MOON_RADIUS);
  return Math.hypot(dE, dN);
}

/** Composed heightfield registered with the chunk / ride-shell stack. */
export const lunarSurface: TerrainGenerator = {
  name: "lunarSurface",
  sample: sampleHeightDir,
};
