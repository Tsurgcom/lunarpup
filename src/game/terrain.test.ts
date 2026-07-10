import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import {
  ANCHOR_CRATERS,
  LUNAR_GENERATORS,
  MOON_CIRCUMFERENCE,
  MOON_RADIUS,
  SPAWN_DIR,
  createFaceGeometry,
  faceSubdiv,
  facesNear,
  geodesicDistance,
  getIcoFaces,
  sampleHeightDir,
  sampleNormalDir,
  surfacePoint,
  worldToChart,
} from "./terrain";

describe("spherical lunar surface", () => {
  test("generators are registered", () => {
    expect(LUNAR_GENERATORS.length).toBeGreaterThanOrEqual(4);
    expect(LUNAR_GENERATORS.map((g) => g.name)).toContain("craterField");
    expect(LUNAR_GENERATORS.map((g) => g.name)).toContain("anchorBowls");
  });

  test("circumference is equal in every great-circle direction", () => {
    expect(MOON_CIRCUMFERENCE).toBe(960);
    expect(2 * Math.PI * MOON_RADIUS).toBeCloseTo(MOON_CIRCUMFERENCE, 10);
  });

  test("geodesic distance matches arc length on the unit sphere scaled by R", () => {
    const a = new THREE.Vector3(1, 0, 0);
    const b = new THREE.Vector3(0, 1, 0);
    expect(geodesicDistance(a, b)).toBeCloseTo((Math.PI / 2) * MOON_RADIUS, 6);
  });

  test("anchor bowl digs the spawn crater", () => {
    const floor = sampleHeightDir(SPAWN_DIR);
    const axis = new THREE.Vector3()
      .crossVectors(SPAWN_DIR, new THREE.Vector3(0, 1, 0))
      .normalize();
    const rimDir = SPAWN_DIR.clone()
      .applyAxisAngle(axis, 16 / MOON_RADIUS)
      .normalize();
    const rim = sampleHeightDir(rimDir);
    expect(floor).toBeLessThan(rim - 2.5);
    expect(ANCHOR_CRATERS[0]?.depth).toBeGreaterThan(5);
  });

  test("normals stay unit length on procedural ground", () => {
    const dir = new THREE.Vector3(0.4, 0.3, 0.8).normalize();
    const n = sampleNormalDir(dir);
    expect(n.length()).toBeCloseTo(1, 5);
    expect(n.dot(dir)).toBeGreaterThan(0);
  });

  test("crater walls tilt away from the radial", () => {
    const east = new THREE.Vector3(0, 1, 0).cross(SPAWN_DIR).normalize();
    const wall = SPAWN_DIR.clone()
      .applyAxisAngle(east, 10 / MOON_RADIUS)
      .normalize();
    const n = sampleNormalDir(wall);
    const tiltDeg =
      (Math.acos(THREE.MathUtils.clamp(n.dot(wall), -1, 1)) * 180) / Math.PI;
    expect(tiltDeg).toBeGreaterThan(15);
    expect(n.dot(wall)).toBeLessThan(0.98);
  });

  test("surface point sits near moon radius plus height", () => {
    const p = surfacePoint(SPAWN_DIR);
    const h = sampleHeightDir(SPAWN_DIR);
    expect(p.length()).toBeCloseTo(MOON_RADIUS + h, 5);
  });

  test("icosphere chunks cover the sphere", () => {
    const faces = getIcoFaces();
    expect(faces.length).toBe(20 * 4 ** 2);
    const near = facesNear(SPAWN_DIR);
    expect(near.length).toBeGreaterThan(8);
    expect(near.length).toBeLessThan(faces.length);
  });

  test("clipmap LOD densifies faces under the viewer", () => {
    const faces = getIcoFaces();
    let nearest = faces[0]!;
    let best = -2;
    for (const f of faces) {
      const d = f.centroid.dot(SPAWN_DIR);
      if (d > best) {
        best = d;
        nearest = f;
      }
    }
    const nearSub = faceSubdiv(SPAWN_DIR, nearest);
    const farFace = faces.find((f) => f.centroid.dot(SPAWN_DIR) < 0)!;
    const farSub = faceSubdiv(SPAWN_DIR, farFace);
    expect(nearSub).toBeGreaterThan(farSub);
    expect(nearSub).toBeGreaterThanOrEqual(32);
  });

  test("face geometry has displaced vertices", () => {
    const face = getIcoFaces()[0]!;
    const geo = createFaceGeometry(face, 3);
    const pos = geo.attributes.position!;
    expect(pos.count).toBeGreaterThan(6);
    const v = new THREE.Vector3(pos.getX(0), pos.getY(0), pos.getZ(0));
    expect(v.length()).toBeGreaterThan(MOON_RADIUS * 0.85);
    geo.dispose();
  });

  test("chart maps world positions onto a globe", () => {
    const p = surfacePoint(SPAWN_DIR);
    const c = worldToChart(p.x, p.y, p.z, new THREE.Vector3(), 0);
    expect(c.length()).toBeCloseTo(1, 5);
    expect(c.dot(SPAWN_DIR)).toBeGreaterThan(0.98);
  });

  test("far-side terrain stays free of antipode spikes", () => {
    const anti = SPAWN_DIR.clone().negate();
    let minH = Infinity;
    let maxTilt = 0;
    const east = new THREE.Vector3(0, 1, 0).cross(anti).normalize();
    const north = new THREE.Vector3().crossVectors(anti, east).normalize();
    for (let a = 0; a < 32; a++) {
      const ang = (a / 32) * Math.PI * 2;
      const dir = anti
        .clone()
        .addScaledVector(east, Math.cos(ang) * 0.08)
        .addScaledVector(north, Math.sin(ang) * 0.08)
        .normalize();
      const h = sampleHeightDir(dir);
      const n = sampleNormalDir(dir);
      const tilt =
        (Math.acos(THREE.MathUtils.clamp(n.dot(dir), -1, 1)) * 180) / Math.PI;
      minH = Math.min(minH, h);
      maxTilt = Math.max(maxTilt, tilt);
    }
    expect(minH).toBeGreaterThan(-10);
    expect(maxTilt).toBeLessThan(55);
  });

  test("heightfield has no cliffs anywhere on the sphere", () => {
    // Walk many short steps; a cell-pop discontinuity jumps several units.
    const step = 0.25;
    let maxJump = 0;
    let maxTilt = 0;
    const axes = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(1, 1, 0).normalize(),
      new THREE.Vector3(1, 0, 1).normalize(),
      new THREE.Vector3(0, 1, 1).normalize(),
    ];
    for (const axis of axes) {
      let prev = sampleHeightDir(SPAWN_DIR);
      for (let s = step; s < Math.PI * MOON_RADIUS; s += step) {
        const dir = SPAWN_DIR.clone()
          .applyAxisAngle(axis, s / MOON_RADIUS)
          .normalize();
        const h = sampleHeightDir(dir);
        maxJump = Math.max(maxJump, Math.abs(h - prev));
        prev = h;
        const n = sampleNormalDir(dir);
        const tilt =
          (Math.acos(THREE.MathUtils.clamp(n.dot(dir), -1, 1)) * 180) /
          Math.PI;
        maxTilt = Math.max(maxTilt, tilt);
      }
    }
    expect(maxJump).toBeLessThan(0.85);
    expect(maxTilt).toBeLessThan(50);
  });
});
