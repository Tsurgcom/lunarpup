import * as THREE from "three";
import {
  AIR_DRAG,
  MASS,
  atmosphereDensity,
  gravityAccel,
} from "./physics";
import {
  ANCHOR_CRATERS,
  MOON_RADIUS,
  SPAWN_DIR,
  sampleContactHeightDir,
  sampleHeightDir,
  sampleNormalDir,
  surfacePoint,
} from "./terrain";

/**
 * Pup collision proxy radius (m). Covers the deck length (~1.35) enough that
 * the visual dog cannot spear through rocks / other pups.
 */
export const PLAYER_RADIUS = 0.65;

/**
 * Game-scaled rock density (kg/m³). Real lunar rock is ~2700; scaled so
 * small rocks are pushable by the 18 kg pup in low g.
 */
export const ROCK_DENSITY = 28;

/** Coefficient of restitution on crust contact. */
export const ROCK_RESTITUTION = 0.18;

/** Rolling / sliding friction vs crust (Coulomb-ish). */
export const ROCK_MU_ROLL = 0.045;

/** Player↔rock / rock↔rock restitution. */
export const COLLISION_RESTITUTION = 0.4;

/** How much collision impulse spins the rock (0–1). */
export const SPIN_COUPLING = 0.7;

/** Positional solver passes per frame. */
const SEPARATION_ITERS = 2;

/** Integration substeps — 2 is enough once settled rocks sleep. */
const SUBSTEPS = 2;
/** ~20× the original 40-rock field density. */
export const ROCK_COUNT = 800;

/** Only collide / wake rocks near the pup (keeps 800 rocks playable). */
const ACTIVE_RADIUS = 14;
const ACTIVE_R2 = ACTIVE_RADIUS * ACTIVE_RADIUS;

/** Grounded rocks below this stay asleep (even near the pup). */
const SLEEP_VEL2 = 0.01;
const SLEEP_OMEGA2 = 0.01;

/** Visual / mass variants scattered on the mare. */
export type RockKind = "pebble" | "chunk" | "slab" | "shard" | "boulder";

export type RockState = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  omega: THREE.Vector3;
  quat: THREE.Quaternion;
  radius: number;
  mass: number;
  kind: RockKind;
  grounded: boolean;
};

export type PeerCollider = {
  x: number;
  y: number;
  z: number;
  ghost?: boolean;
};

const ROCK_KINDS: RockKind[] = [
  "pebble",
  "pebble",
  "pebble",
  "chunk",
  "chunk",
  "slab",
  "shard",
  "boulder",
];

/** Radius range and density scale per kind. */
const KIND_STATS: Record<
  RockKind,
  { rMin: number; rMax: number; densityScale: number }
> = {
  pebble: { rMin: 0.08, rMax: 0.16, densityScale: 1.0 },
  chunk: { rMin: 0.16, rMax: 0.28, densityScale: 1.0 },
  slab: { rMin: 0.18, rMax: 0.32, densityScale: 0.85 },
  shard: { rMin: 0.12, rMax: 0.24, densityScale: 0.9 },
  boulder: { rMin: 0.28, rMax: 0.42, densityScale: 1.15 },
};

const _radial = new THREE.Vector3();
const _n = new THREE.Vector3();
const _surface = new THREE.Vector3();
const _force = new THREE.Vector3();
const _accel = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _impulse = new THREE.Vector3();
const _spin = new THREE.Vector3();
const _qDot = new THREE.Quaternion();
const _east = new THREE.Vector3();
const _north = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _zero = new THREE.Vector3();

const _activeIdx: number[] = [];
const _touchedIdx: number[] = [];
const _touchedMark: Uint8Array = new Uint8Array(ROCK_COUNT);

export function rockMass(
  radius: number,
  densityScale = 1,
): number {
  return (
    ROCK_DENSITY *
    densityScale *
    (4 / 3) *
    Math.PI *
    radius *
    radius *
    radius
  );
}

/** Solid-sphere inertia about center. */
export function rockInertia(mass: number, radius: number): number {
  return 0.4 * mass * radius * radius;
}

function heightAbove(
  surface: THREE.Vector3,
  normal: THREE.Vector3,
  pos: THREE.Vector3,
): number {
  return (
    (pos.x - surface.x) * normal.x +
    (pos.y - surface.y) * normal.y +
    (pos.z - surface.z) * normal.z
  );
}

function hash01(i: number, salt: number): number {
  const n = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Seat a rock on the crust at its current lateral position.
 * Preserves tangential offset from collisions; kills into-ground velocity.
 */
export function snapRockToSurface(rock: RockState): void {
  const r = Math.max(rock.pos.length(), 1e-4);
  _radial.copy(rock.pos).multiplyScalar(1 / r);
  const hAnalytic = sampleHeightDir(_radial);
  const h = sampleContactHeightDir(_radial, hAnalytic);
  sampleNormalDir(_radial, _n, 0.7, hAnalytic);
  _surface.copy(_radial).multiplyScalar(MOON_RADIUS + h);
  rock.pos.copy(_surface).addScaledVector(_n, rock.radius);

  const vn = rock.vel.dot(_n);
  if (vn < 0) {
    rock.vel.addScaledVector(_n, -vn);
  }
  rock.grounded = true;
}

/** Place a rock on the crust at `dir` with the given radius / kind. */
export function createRock(
  dir: THREE.Vector3,
  radius: number,
  kind: RockKind = "chunk",
): RockState {
  const densityScale = KIND_STATS[kind].densityScale;
  const mass = rockMass(radius, densityScale);
  _dir.copy(dir).normalize();
  return {
    pos: surfacePoint(_dir, radius),
    vel: new THREE.Vector3(),
    omega: new THREE.Vector3(),
    quat: new THREE.Quaternion().setFromUnitVectors(_up, _dir),
    radius,
    mass,
    kind,
    grounded: true,
  };
}

/**
 * Deterministic scatter near spawn bowls — mixed kinds, smaller average size.
 */
export function spawnRocks(count = ROCK_COUNT): RockState[] {
  const rocks: RockState[] = [];
  const anchors = [SPAWN_DIR, ...ANCHOR_CRATERS.map((c) => c.dir)];

  for (let i = 0; i < count; i++) {
    const anchor = anchors[i % anchors.length]!;
    _east.set(0, 1, 0).cross(anchor);
    if (_east.lengthSq() < 1e-8) _east.set(1, 0, 0).cross(anchor);
    _east.normalize();
    _north.crossVectors(anchor, _east).normalize();

    const ring = 3 + hash01(i, 1) * 58;
    const ang = hash01(i, 2) * Math.PI * 2;
    const clear = i % anchors.length === 0 ? 3 + hash01(i, 3) * 2 : 0;
    const dist = Math.max(ring, clear);

    _dir
      .copy(anchor)
      .addScaledVector(_east, Math.cos(ang) * dist)
      .addScaledVector(_north, Math.sin(ang) * dist)
      .normalize();

    const kind = ROCK_KINDS[Math.floor(hash01(i, 5) * ROCK_KINDS.length)]!;
    const stats = KIND_STATS[kind];
    const radius = stats.rMin + hash01(i, 4) * (stats.rMax - stats.rMin);
    rocks.push(createRock(_dir, radius, kind));
  }
  return rocks;
}

function substepRock(rock: RockState, dt: number): void {
  const r = Math.max(rock.pos.length(), 1e-4);
  _radial.copy(rock.pos).multiplyScalar(1 / r);

  const g = gravityAccel(r);
  _force.copy(_radial).multiplyScalar(-rock.mass * g);

  // Drag is negligible once seated — skip the density exp for grounded rocks.
  if (!rock.grounded) {
    const dens = atmosphereDensity(r);
    const speed = rock.vel.length();
    if (speed > 1e-5 && dens > 1e-4) {
      const drag = AIR_DRAG * dens * speed * speed;
      _force.addScaledVector(rock.vel, -drag / speed);
    }
  }

  // Contact projection below cancels into-ground motion; skipping an early
  // sampleNormalDir here saves ~3 heightfield samples per substep.
  _accel.copy(_force).multiplyScalar(1 / rock.mass);
  rock.vel.addScaledVector(_accel, dt);
  rock.pos.addScaledVector(rock.vel, dt);

  const w = rock.omega.length();
  if (w > 1e-6) {
    _qDot.setFromAxisAngle(
      _spin.copy(rock.omega).multiplyScalar(1 / w),
      w * dt,
    );
    rock.quat.premultiply(_qDot).normalize();
    const damp = rock.grounded ? Math.exp(-1.8 * dt) : Math.exp(-0.12 * dt);
    rock.omega.multiplyScalar(damp);
  }

  const r2 = Math.max(rock.pos.length(), 1e-4);
  _radial.copy(rock.pos).multiplyScalar(1 / r2);
  const hAnalytic = sampleHeightDir(_radial);
  const h = sampleContactHeightDir(_radial, hAnalytic);
  sampleNormalDir(_radial, _n, 0.7, hAnalytic);
  _surface.copy(_radial).multiplyScalar(MOON_RADIUS + h);

  const height = heightAbove(_surface, _n, rock.pos);
  const penetration = rock.radius - height;

  if (penetration >= 0) {
    rock.pos.addScaledVector(_n, rock.radius - height);

    const vn = rock.vel.dot(_n);
    let jn = 0;
    if (vn < 0) {
      jn = -(1 + ROCK_RESTITUTION) * rock.mass * vn;
      rock.vel.addScaledVector(_n, jn / rock.mass);
    }

    _tangent.copy(rock.vel).addScaledVector(_n, -rock.vel.dot(_n));
    const vt = _tangent.length();
    if (vt > 1e-5) {
      const maxJt = ROCK_MU_ROLL * Math.max(jn, rock.mass * g * dt);
      const jt = Math.min(rock.mass * vt, maxJt);
      rock.vel.addScaledVector(_tangent, -jt / (rock.mass * vt));

      _spin.crossVectors(_tangent, _n).multiplyScalar(1 / rock.radius);
      rock.omega.lerp(_spin, 0.35);
    } else if (jn > 0) {
      rock.omega.multiplyScalar(0.85);
    }

    // Snap residual jitter so nearby settled rocks can sleep next frame.
    if (rock.vel.lengthSq() < SLEEP_VEL2) rock.vel.set(0, 0, 0);
    if (rock.omega.lengthSq() < SLEEP_OMEGA2) rock.omega.set(0, 0, 0);

    rock.grounded = true;
  } else {
    rock.grounded = false;
  }
}

/** True when the rock should integrate this frame. */
export function rockIsActive(rock: RockState): boolean {
  if (!rock.grounded) return true;
  return (
    rock.vel.lengthSq() > SLEEP_VEL2 || rock.omega.lengthSq() > SLEEP_OMEGA2
  );
}

/** True when the rock is close enough for collision checks. */
function rockInCollisionRange(
  rock: RockState,
  playerPos: THREE.Vector3,
): boolean {
  return rock.pos.distanceToSquared(playerPos) <= ACTIVE_R2;
}

export function stepRocks(
  rocks: RockState[],
  dt: number,
  _playerPos: THREE.Vector3 | null = null,
): void {
  const step = dt / SUBSTEPS;
  // Collect awake indices once — avoids re-testing sleep 2× per rock.
  _activeIdx.length = 0;
  for (let i = 0; i < rocks.length; i++) {
    if (!rockIsActive(rocks[i]!)) continue;
    _activeIdx.push(i);
  }
  for (let s = 0; s < SUBSTEPS; s++) {
    for (let a = 0; a < _activeIdx.length; a++) {
      substepRock(rocks[_activeIdx[a]!]!, step);
    }
  }
}

type ContactPair = {
  posA: THREE.Vector3;
  velA: THREE.Vector3;
  massA: number;
  radiusA: number;
  posB: THREE.Vector3;
  velB: THREE.Vector3;
  massB: number;
  radiusB: number;
  spinB: THREE.Vector3 | null;
  surfaceN: THREE.Vector3;
  /** Tangential contact axis (A → B), frozen at contact discovery. */
  axis: THREE.Vector3;
  /** Rock index for posA when it is a rock; -1 for player. */
  idxA: number;
  /** Rock index for posB when it is a rock; -1 for kinematic peer. */
  idxB: number;
};

/** Scratch pools for collision contacts (avoids per-frame Vector3 alloc). */
const CONTACT_POOL_SIZE = 96;
const _snPool: THREE.Vector3[] = Array.from(
  { length: CONTACT_POOL_SIZE },
  () => new THREE.Vector3(),
);
const _axisPool: THREE.Vector3[] = Array.from(
  { length: CONTACT_POOL_SIZE },
  () => new THREE.Vector3(),
);
/** Extra positions for kinematic peers (posB must outlive the discovery loop). */
const _posPool: THREE.Vector3[] = Array.from(
  { length: CONTACT_POOL_SIZE },
  () => new THREE.Vector3(),
);
const _contactPool: ContactPair[] = Array.from(
  { length: CONTACT_POOL_SIZE },
  (_, i) => ({
    posA: _zero,
    velA: _zero,
    massA: 0,
    radiusA: 0,
    posB: _zero,
    velB: _zero,
    massB: 0,
    radiusB: 0,
    spinB: null,
    surfaceN: _snPool[i]!,
    axis: _axisPool[i]!,
    idxA: -1,
    idxB: -1,
  }),
);

let _contactUsed = 0;

function nextContact(): ContactPair | null {
  if (_contactUsed >= CONTACT_POOL_SIZE) return null;
  return _contactPool[_contactUsed++]!;
}

/**
 * Compute tangential separation axis + overlap.
 * Writes the unit axis into `outAxis`. Returns overlap (0 = no contact).
 */
function computeTangentialOverlap(
  posA: THREE.Vector3,
  radiusA: number,
  posB: THREE.Vector3,
  radiusB: number,
  surfaceN: THREE.Vector3,
  outAxis: THREE.Vector3,
): number {
  _delta.subVectors(posB, posA);
  const minDist = radiusA + radiusB;
  const dh = _delta.dot(surfaceN);
  outAxis.copy(_delta).addScaledVector(surfaceN, -dh);
  let ht = outAxis.length();
  const maxDh = minDist * 0.999;
  const absDh = Math.abs(dh);

  if (absDh >= maxDh) {
    if (ht < 1e-8) {
      _east.set(0, 1, 0).cross(surfaceN);
      if (_east.lengthSq() < 1e-10) _east.set(1, 0, 0).cross(surfaceN);
      outAxis.copy(_east).normalize();
      ht = 0;
    } else {
      outAxis.multiplyScalar(1 / ht);
    }
    return Math.max(0, minDist - ht);
  }

  const need = Math.sqrt(minDist * minDist - dh * dh);
  if (ht >= need) return 0;
  if (ht < 1e-8) {
    _east.set(0, 1, 0).cross(surfaceN);
    if (_east.lengthSq() < 1e-10) _east.set(1, 0, 0).cross(surfaceN);
    outAxis.copy(_east).normalize();
  } else {
    outAxis.multiplyScalar(1 / ht);
  }
  return need - ht;
}

function sampleSurfaceNormal(pos: THREE.Vector3, out: THREE.Vector3): void {
  const rLen = Math.max(pos.length(), 1e-4);
  sampleNormalDir(_radial.copy(pos).multiplyScalar(1 / rLen), out);
}

/** Positional correction only — no velocity change. */
function separatePair(c: ContactPair): boolean {
  const overlap = computeTangentialOverlap(
    c.posA,
    c.radiusA,
    c.posB,
    c.radiusB,
    c.surfaceN,
    _n,
  );
  if (overlap <= 0) return false;

  const invA = 1 / c.massA;
  const invB = c.massB > 0 ? 1 / c.massB : 0;
  const invSum = invA + invB;
  if (invSum < 1e-12) return false;

  const push = overlap + 0.005;
  c.posA.addScaledVector(_n, -push * (invA / invSum));
  if (invB > 0) {
    c.posB.addScaledVector(_n, push * (invB / invSum));
  }
  return true;
}

/**
 * Single velocity impulse along the frozen contact axis.
 * Applied once per pair so multi-pass separation cannot stack momentum.
 */
function impulsePair(c: ContactPair, restitution: number): void {
  const invA = 1 / c.massA;
  const invB = c.massB > 0 ? 1 / c.massB : 0;
  const invSum = invA + invB;
  if (invSum < 1e-12) return;

  const axis = c.axis;
  const vRel = (invB > 0 ? c.velB.dot(axis) : 0) - c.velA.dot(axis);
  if (vRel >= 0) return;

  const j = (-(1 + restitution) * vRel) / invSum;
  _impulse.copy(axis).multiplyScalar(j);
  c.velA.addScaledVector(_impulse, -invA);
  if (invB > 0) {
    c.velB.addScaledVector(_impulse, invB);
  }

  if (c.spinB && invB > 0) {
    _spin.copy(axis).multiplyScalar(-c.radiusB);
    _spin.cross(_impulse).multiplyScalar(
      SPIN_COUPLING / rockInertia(c.massB, c.radiusB),
    );
    c.spinB.add(_spin);
  }
}

function markTouched(idx: number): void {
  if (idx < 0 || idx >= _touchedMark.length) return;
  if (_touchedMark[idx]) return;
  _touchedMark[idx] = 1;
  _touchedIdx.push(idx);
}

/**
 * Resolve player↔rock, rock↔rock, and local player↔remote peers.
 *
 * Positional separation iterates; velocity impulses fire once per contacting
 * pair so momentum is not multi-hit within a frame.
 */
export function resolveCollisions(
  rocks: RockState[],
  playerPos: THREE.Vector3,
  playerVel: THREE.Vector3,
  playerMass = MASS,
  playerRadius = PLAYER_RADIUS,
  peers: readonly PeerCollider[] = [],
): void {
  _contactUsed = 0;
  _activeIdx.length = 0;
  _touchedIdx.length = 0;

  const touchR2 =
    (playerRadius + 0.45 + 2) * (playerRadius + 0.45 + 2);

  for (let i = 0; i < rocks.length; i++) {
    const rock = rocks[i]!;
    if (!rockInCollisionRange(rock, playerPos)) continue;
    _activeIdx.push(i);

    const d2 = rock.pos.distanceToSquared(playerPos);
    if (d2 > touchR2) continue;

    const c = nextContact();
    if (!c) break;
    sampleSurfaceNormal(rock.pos, c.surfaceN);
    const overlap = computeTangentialOverlap(
      playerPos,
      playerRadius,
      rock.pos,
      rock.radius,
      c.surfaceN,
      c.axis,
    );
    if (overlap <= 0) {
      _contactUsed--;
      continue;
    }
    c.posA = playerPos;
    c.velA = playerVel;
    c.massA = playerMass;
    c.radiusA = playerRadius;
    c.posB = rock.pos;
    c.velB = rock.vel;
    c.massB = rock.mass;
    c.radiusB = rock.radius;
    c.spinB = rock.omega;
    c.idxA = -1;
    c.idxB = i;
  }

  // Rock↔rock among nearby rocks only (typically dozens, not 800).
  for (let ai = 0; ai < _activeIdx.length; ai++) {
    const i = _activeIdx[ai]!;
    const a = rocks[i]!;
    sampleSurfaceNormal(a.pos, _n);
    for (let aj = ai + 1; aj < _activeIdx.length; aj++) {
      const j = _activeIdx[aj]!;
      const b = rocks[j]!;
      const pairDist2 = a.pos.distanceToSquared(b.pos);
      const maxReach = a.radius + b.radius + 0.5;
      if (pairDist2 > maxReach * maxReach) continue;

      const c = nextContact();
      if (!c) break;
      c.surfaceN.copy(_n);
      const overlap = computeTangentialOverlap(
        a.pos,
        a.radius,
        b.pos,
        b.radius,
        c.surfaceN,
        c.axis,
      );
      if (overlap <= 0) {
        _contactUsed--;
        continue;
      }
      c.posA = a.pos;
      c.velA = a.vel;
      c.massA = a.mass;
      c.radiusA = a.radius;
      c.posB = b.pos;
      c.velB = b.vel;
      c.massB = b.mass;
      c.radiusB = b.radius;
      c.spinB = b.omega;
      c.idxA = i;
      c.idxB = j;
    }
  }

  for (const peer of peers) {
    if (peer.ghost) continue;
    const c = nextContact();
    if (!c) break;
    const peerPos = _posPool[_contactUsed - 1]!;
    peerPos.set(peer.x, peer.y, peer.z);
    sampleSurfaceNormal(playerPos, c.surfaceN);
    const overlap = computeTangentialOverlap(
      playerPos,
      playerRadius,
      peerPos,
      playerRadius,
      c.surfaceN,
      c.axis,
    );
    if (overlap <= 0) {
      _contactUsed--;
      continue;
    }
    c.posA = playerPos;
    c.velA = playerVel;
    c.massA = playerMass;
    c.radiusA = playerRadius;
    c.posB = peerPos;
    c.velB = _zero;
    c.massB = 0;
    c.radiusB = playerRadius;
    c.spinB = null;
    c.idxA = -1;
    c.idxB = -1;
  }

  if (_contactUsed === 0) return;

  for (let ci = 0; ci < _contactUsed; ci++) {
    const c = _contactPool[ci]!;
    markTouched(c.idxA);
    markTouched(c.idxB);
  }

  for (let iter = 0; iter < SEPARATION_ITERS; iter++) {
    let hit = false;
    for (let ci = 0; ci < _contactUsed; ci++) {
      if (separatePair(_contactPool[ci]!)) hit = true;
    }
    for (let t = 0; t < _touchedIdx.length; t++) {
      snapRockToSurface(rocks[_touchedIdx[t]!]!);
    }
    if (!hit) break;
  }

  for (let ci = 0; ci < _contactUsed; ci++) {
    impulsePair(_contactPool[ci]!, COLLISION_RESTITUTION);
  }

  for (let t = 0; t < _touchedIdx.length; t++) {
    _touchedMark[_touchedIdx[t]!] = 0;
  }
}
