import * as THREE from "three";
import { writeMoonVertexColor } from "./moonMaterial";

/**
 * Circumference of the decorative moon — one great-circle lap.
 */
export const MOON_CIRCUMFERENCE = 1920;

/** Sphere radius such that 2πR = MOON_CIRCUMFERENCE. */
export const MOON_RADIUS = MOON_CIRCUMFERENCE / (2 * Math.PI);

/** Peak skate speed (m/s) — HUD ratio, LOD look-ahead, velocity cap. */
export const MAX_SPEED = 40;

/**
 * Spawn altitude above the decorative moon radius (short drop-in onto the
 * ride shell — clearance is applied by movement/rideShell).
 */
export const SPAWN_ALTITUDE = 4;

/** Unit direction of the skate spawn (near +Z, slightly north). */
export const SPAWN_DIR = new THREE.Vector3(0, 0.12, 1).normalize();

/** HUD globe radius. */
export const CHART_RADIUS = 1;

const _chartDir = new THREE.Vector3();

/** Free-space-style spawn position — short drop-in above the ride shell. */
export function spawnPosition(out = new THREE.Vector3()): THREE.Vector3 {
  return out.copy(SPAWN_DIR).multiplyScalar(MOON_RADIUS + SPAWN_ALTITUDE);
}

/**
 * Place the pup along a direction at an altitude above MOON_RADIUS
 * (map teleport / warp). Prefer ride-shell clearance for surface landings.
 */
export function orbitPoint(
  dir: THREE.Vector3,
  altitude = SPAWN_ALTITUDE,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  _chartDir.copy(dir);
  if (_chartDir.lengthSq() < 1e-8) _chartDir.copy(SPAWN_DIR);
  else _chartDir.normalize();
  return out.copy(_chartDir).multiplyScalar(MOON_RADIUS + altitude);
}

/** World position → point on the HUD globe (pure direction, no height). */
export function worldToChart(
  x: number,
  y: number,
  z: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  _chartDir.set(x, y, z);
  const len = _chartDir.length();
  if (len < 1e-8) return out.set(0, CHART_RADIUS, 0);
  return out.copy(_chartDir).multiplyScalar(CHART_RADIUS / len);
}

/** Ray hit on the chart globe → unit direction (teleport target). */
export function chartHitToDir(
  point: THREE.Vector3,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  return out.copy(point).normalize();
}

/** Plain HUD globe (no heightfield). */
export function createMoonChartGeometry(
  radius = CHART_RADIUS,
  detail = 4,
): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  if (!pos) throw new Error("missing position attribute");
  const colors = new Float32Array(pos.count * 3);
  const dir = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    dir.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    writeMoonVertexColor(dir, 0, 0, colors, i * 3);
  }

  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}
