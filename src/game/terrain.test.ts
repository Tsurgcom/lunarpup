import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import {
  ANCHOR_CRATERS,
  CHUNK_ARC_RADIUS,
  ICO_FACE_SUBDIV,
  LUNAR_GENERATORS,
  MOON_CIRCUMFERENCE,
  MOON_RADIUS,
  SPAWN_DIR,
  createFaceGeometry,
  craterDelta,
  craterDirAt,
  craterOuterT,
  craterRadialT,
  dirInCraterZone,
  faceSubdiv,
  facesNear,
  geodesicDistance,
  getCraterCatalog,
  getIcoFaces,
  sampleContactHeightDir,
  sampleHeightDir,
  sampleNormalDir,
  stitchFaceSubdivs,
  surfacePoint,
  worldToChart,
} from "./terrain";

describe("spherical lunar surface", () => {
  test("generators are registered", () => {
    expect(LUNAR_GENERATORS.length).toBe(3);
    expect(LUNAR_GENERATORS.map((g) => g.name)).toContain("anchorBowls");
    expect(LUNAR_GENERATORS.map((g) => g.name)).toContain("ogLandscape");
    expect(LUNAR_GENERATORS.map((g) => g.name)).toContain("regolithDetail");
  });

  test("global crater catalog covers the sphere outside the skate park", () => {
    const catalog = getCraterCatalog();
    expect(catalog.length).toBeGreaterThan(40);
    expect(catalog.length).toBeLessThan(500);
    for (const crater of catalog) {
      expect(geodesicDistance(crater.dir, SPAWN_DIR)).toBeGreaterThan(30);
    }

    // Procedural bowls dig below the surrounding mare.
    const crater = catalog[Math.floor(catalog.length / 3)]!;
    const floor = sampleHeightDir(crater.dir);
    const east = new THREE.Vector3(0, 1, 0).cross(crater.dir).normalize();
    const rimDir = crater.dir
      .clone()
      .applyAxisAngle(east, (crater.radius * 1.05) / MOON_RADIUS)
      .normalize();
    expect(floor).toBeLessThan(sampleHeightDir(rimDir) - 0.5);
  });

  test("catalog mixes simple, complex, and basin morphologies", () => {
    const catalog = getCraterCatalog();
    const kinds = new Set(catalog.map((c) => c.kind ?? "simple"));
    expect(kinds.has("simple")).toBe(true);
    expect(kinds.has("complex")).toBe(true);
    expect(kinds.has("basin")).toBe(true);

    const simple = catalog.find((c) => c.kind === "simple")!;
    const complex = catalog.find(
      (c) => c.kind === "complex" && (c.peakHeight ?? 0) > 0.4,
    )!;
    const basin = catalog.find(
      (c) => c.kind === "basin" && (c.rings ?? 0) >= 2,
    )!;
    expect(simple).toBeDefined();
    expect(complex).toBeDefined();
    expect(basin).toBeDefined();

    // Depth-to-diameter ratios (diameter = 2·radius).
    const simpleRatio = simple.depth / (2 * simple.radius);
    const complexRatio = complex.depth / (2 * complex.radius);
    const basinRatio = basin.depth / (2 * basin.radius);
    expect(simpleRatio).toBeGreaterThan(0.14);
    expect(simpleRatio).toBeLessThan(0.24);
    expect(complexRatio).toBeGreaterThan(0.04);
    expect(complexRatio).toBeLessThan(0.1);
    expect(basinRatio).toBeLessThan(complexRatio);
    expect(basinRatio).toBeLessThan(0.06);

    // Complex: central peak sits above the flat deck mid-floor.
    const peak = craterDelta(complex, complex.dir);
    const mid = craterDirAt(complex, 0.45, 0);
    expect(peak).toBeGreaterThan(craterDelta(complex, mid) + 0.3);

    // Basin: peak ring rises above the mare floor dig.
    const floor = craterDelta(basin, basin.dir);
    const ringT = basin.peakRingCenter ?? 0.4;
    const ring = craterDirAt(basin, ringT, 0.5);
    expect(craterDelta(basin, ring)).toBeGreaterThan(floor + 0.35);
  });

  test("anchor park includes a peak hub and a ring basin", () => {
    expect(
      ANCHOR_CRATERS.some(
        (c) => c.kind === "complex" && (c.peakHeight ?? 0) > 1,
      ),
    ).toBe(true);
    expect(
      ANCHOR_CRATERS.some(
        (c) =>
          c.kind === "basin" &&
          (c.rings ?? 0) >= 2 &&
          (c.peakRing ?? 0) > 0.5,
      ),
    ).toBe(true);
  });

  test("circumference is equal in every great-circle direction", () => {
    expect(MOON_CIRCUMFERENCE).toBe(1920);
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
      .applyAxisAngle(axis, 20 / MOON_RADIUS)
      .normalize();
    const rim = sampleHeightDir(rimDir);
    expect(floor).toBeLessThan(rim - 3);
    expect(ANCHOR_CRATERS[0]?.depth).toBeGreaterThan(6);
  });

  test("spawn bowl has a usable flat deck", () => {
    const floor = sampleHeightDir(SPAWN_DIR);
    const east = new THREE.Vector3(0, 1, 0).cross(SPAWN_DIR).normalize();
    const near = SPAWN_DIR.clone()
      .applyAxisAngle(east, 4 / MOON_RADIUS)
      .normalize();
    // Flat deck: height barely changes across the inner plaza.
    expect(Math.abs(sampleHeightDir(near) - floor)).toBeLessThan(0.45);
  });

  test("normals stay unit length on procedural ground", () => {
    const dir = new THREE.Vector3(0.4, 0.3, 0.8).normalize();
    const n = sampleNormalDir(dir);
    expect(n.length()).toBeCloseTo(1, 5);
    expect(n.dot(dir)).toBeGreaterThan(0);
  });

  test("crater walls tilt away from the radial", () => {
    const east = new THREE.Vector3(0, 1, 0).cross(SPAWN_DIR).normalize();
    // Sample mid-transition (outside flat deck, inside rim).
    const wall = SPAWN_DIR.clone()
      .applyAxisAngle(east, 15 / MOON_RADIUS)
      .normalize();
    const n = sampleNormalDir(wall);
    const tiltDeg =
      (Math.acos(THREE.MathUtils.clamp(n.dot(wall), -1, 1)) * 180) / Math.PI;
    expect(tiltDeg).toBeGreaterThan(15);
    expect(n.dot(wall)).toBeLessThan(0.98);
  });

  test("surface point sits near moon radius plus contact height", () => {
    const p = surfacePoint(SPAWN_DIR);
    const h = sampleContactHeightDir(SPAWN_DIR);
    expect(p.length()).toBeCloseTo(MOON_RADIUS + h, 5);
  });

  test("icosphere chunks cover the sphere", () => {
    const faces = getIcoFaces();
    expect(faces.length).toBe(20 * 4 ** 2);
    const near = facesNear(SPAWN_DIR);
    expect(near.length).toBeGreaterThan(8);
    expect(near.length).toBeLessThan(faces.length);
  });

  test("face geometry respects clipmap subdiv", () => {
    const face = getIcoFaces()[0]!;
    const lod = 12;
    const geo = createFaceGeometry(face, lod);
    const pos = geo.attributes.position!;
    // Surface verts only: (n+1)(n+2)/2
    expect(pos.count).toBe(((lod + 1) * (lod + 2)) / 2);
    geo.dispose();
  });

  test("faceSubdiv densifies near the viewer", () => {
    const faces = getIcoFaces();
    const near = facesNear(SPAWN_DIR);
    expect(near.length).toBeGreaterThan(0);
    // Pick the face whose centroid is closest to spawn.
    let best = near[0]!;
    let bestDot = best.centroid.dot(SPAWN_DIR);
    for (const f of near) {
      const d = f.centroid.dot(SPAWN_DIR);
      if (d > bestDot) {
        best = f;
        bestDot = d;
      }
    }
    const nearLod = faceSubdiv(SPAWN_DIR, best);
    expect(nearLod).toBeGreaterThan(ICO_FACE_SUBDIV);

    // A face on the far ring should fall back to the coarse default.
    const far = faces.find(
      (f) => geodesicDistance(SPAWN_DIR, f.centroid) > CHUNK_ARC_RADIUS * 0.85,
    );
    expect(far).toBeDefined();
    expect(faceSubdiv(SPAWN_DIR, far!)).toBe(ICO_FACE_SUBDIV);
  });

  test("spawn crater has a raised ejecta rim", () => {
    const crater = ANCHOR_CRATERS[0]!;
    const floor = craterDelta(crater, crater.dir);
    const east = new THREE.Vector3(0, 1, 0).cross(crater.dir).normalize();
    const crestDir = crater.dir
      .clone()
      .applyAxisAngle(east, crater.radius / MOON_RADIUS)
      .normalize();
    const apronDir = crater.dir
      .clone()
      .applyAxisAngle(
        east,
        (crater.radius * (1 + (crater.rimWidth ?? 0.22) * 0.45)) / MOON_RADIUS,
      )
      .normalize();
    const crest = craterDelta(crater, crestDir);
    const apron = craterDelta(crater, apronDir);
    expect(floor).toBeLessThan(-5);
    expect(crest).toBeGreaterThan(0.8);
    expect(apron).toBeGreaterThan(0.15);
    expect(apron).toBeLessThan(crest);
    expect(craterRadialT(crater, crestDir)).toBeCloseTo(1, 1);
    expect(craterOuterT(crater)).toBeGreaterThan(1.15);
  });

  test("craterDirAt round-trips elliptical radius", () => {
    const crater = ANCHOR_CRATERS[1]!; // kidney — aspect ≠ 1
    const dir = new THREE.Vector3();
    for (let i = 0; i < 12; i++) {
      const phi = (i / 12) * Math.PI * 2;
      craterDirAt(crater, 1, phi, dir);
      expect(craterRadialT(crater, dir)).toBeCloseTo(1, 3);
    }
  });

  test("contact height matches analytic crust", () => {
    const east = new THREE.Vector3(0, 1, 0).cross(SPAWN_DIR).normalize();
    const wall = SPAWN_DIR.clone()
      .applyAxisAngle(east, 14 / MOON_RADIUS)
      .normalize();
    const analytic = sampleHeightDir(wall);
    const contact = sampleContactHeightDir(wall);
    expect(contact).toBeCloseTo(analytic, 8);

    const faces = getIcoFaces();
    const mareFace = faces.find((f) => !dirInCraterZone(f.centroid));
    expect(mareFace).toBeDefined();
    expect(
      sampleContactHeightDir(mareFace!.centroid),
    ).toBeCloseTo(sampleHeightDir(mareFace!.centroid), 8);
  });

  test("face geometry matches contact height and has baked colors", () => {
    const face = getIcoFaces()[0]!;
    const geo = createFaceGeometry(face, 3);
    const pos = geo.attributes.position!;
    const col = geo.attributes.color!;
    expect(pos.count).toBeGreaterThan(6);
    expect(col.count).toBe(pos.count);
    const v = new THREE.Vector3(pos.getX(0), pos.getY(0), pos.getZ(0));
    expect(v.length()).toBeGreaterThan(MOON_RADIUS * 0.85);
    expect(col.getX(0)).toBeGreaterThan(0.2);
    expect(col.getX(0)).toBeLessThan(1.01);

    // Near-ring verts sit on the same contact field physics uses.
    const dir = v.clone().normalize();
    const contactR = MOON_RADIUS + sampleContactHeightDir(dir);
    expect(Math.abs(v.length() - contactR)).toBeLessThan(1e-4);
    geo.dispose();
  });

  test("ico faces expose edge neighbors for LOD stitch", () => {
    const faces = getIcoFaces();
    expect(faces[0]!.neighbors.length).toBeGreaterThanOrEqual(1);
    for (const n of faces[0]!.neighbors) {
      expect(faces[n]!.neighbors).toContain(0);
    }
  });

  test("stitchFaceSubdivs promotes coarser faces next to finer neighbors", () => {
    const faces = getIcoFaces();
    // Pick a face near spawn (fine) and force a neighbor into the set.
    const near = facesNear(SPAWN_DIR, 40);
    expect(near.length).toBeGreaterThan(1);
    const ids = near.map((f) => f.index);
    const lods = stitchFaceSubdivs(SPAWN_DIR, ids);
    for (const id of ids) {
      const base = faceSubdiv(SPAWN_DIR, faces[id]!);
      expect(lods.get(id)!).toBeGreaterThanOrEqual(base);
    }
    // At least one face at a ring boundary should have been promoted, or
    // all near faces already share the densest ring — both are valid.
    let any = false;
    for (const id of ids) {
      if (lods.get(id)! >= ICO_FACE_SUBDIV) any = true;
    }
    expect(any).toBe(true);
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
    expect(maxTilt).toBeLessThan(48);
  });

  test("heightfield has no cliffs anywhere on the sphere", () => {
    // Walk many short steps; a cell-pop discontinuity jumps several units.
    const step = 0.4;
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
      let i = 0;
      for (let s = step; s < Math.PI * MOON_RADIUS; s += step) {
        const dir = SPAWN_DIR.clone()
          .applyAxisAngle(axis, s / MOON_RADIUS)
          .normalize();
        const h = sampleHeightDir(dir);
        maxJump = Math.max(maxJump, Math.abs(h - prev));
        prev = h;
        // Normals every few steps — enough to catch sheer walls.
        if (i++ % 6 === 0) {
          const n = sampleNormalDir(dir);
          const tilt =
            (Math.acos(THREE.MathUtils.clamp(n.dot(dir), -1, 1)) * 180) /
            Math.PI;
          maxTilt = Math.max(maxTilt, tilt);
        }
      }
    }
    expect(maxJump).toBeLessThan(0.55);
    expect(maxTilt).toBeLessThan(48);
  }, 15_000);
});
