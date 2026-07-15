import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import {
  ANCHOR_CRATERS,
  craterDelta,
  craterRadialT,
  getCraterCatalog,
  heightQualityForSubdiv,
  sampleHeightDir,
  skateBowlShape,
} from "./lunarTerrain";
import { SPAWN_DIR } from "./moon";

describe("lunarTerrain", () => {
  test("heightQualityForSubdiv maps clipmap rings", () => {
    expect(heightQualityForSubdiv(6)).toBe("far");
    expect(heightQualityForSubdiv(8)).toBe("far");
    expect(heightQualityForSubdiv(12)).toBe("mid");
    expect(heightQualityForSubdiv(24)).toBe("mid");
    expect(heightQualityForSubdiv(48)).toBe("near");
  });

  test("far quality is cheaper but still digs the spawn bowl", () => {
    const near = sampleHeightDir(SPAWN_DIR, "near");
    const far = sampleHeightDir(SPAWN_DIR, "far");
    expect(near).toBeLessThan(-6);
    expect(far).toBeLessThan(-6);
  });

  test("spawn plaza digs a deep bowl", () => {
    const h = sampleHeightDir(SPAWN_DIR);
    expect(h).toBeLessThan(-6);
  });

  test("anchor craters include a massive far basin", () => {
    const mega = ANCHOR_CRATERS.reduce((a, b) => (a.depth > b.depth ? a : b));
    expect(mega.depth).toBeGreaterThan(15);
    expect(mega.radius).toBeGreaterThan(60);
    // Floor dig (peak may lift the exact center above −depth).
    expect(craterDelta(mega, mega.dir)).toBeLessThan(-mega.depth * 0.7);
  });

  test("skate bowl is 1 on the floor and 0 at the rim", () => {
    expect(skateBowlShape(0)).toBeCloseTo(1, 5);
    expect(skateBowlShape(0.05, 0.12)).toBeCloseTo(1, 5);
    expect(skateBowlShape(1)).toBeCloseTo(0, 5);
  });

  test("craterRadialT is 0 at center and ~1 at rim", () => {
    const crater = ANCHOR_CRATERS[0]!;
    expect(craterRadialT(crater, crater.dir)).toBeCloseTo(0, 5);
    // Step out along +X tangent ≈ east at spawn.
    const rim = crater.dir
      .clone()
      .add(new THREE.Vector3(1, 0, 0).multiplyScalar(0.05))
      .normalize();
    // Just sanity — distance grows off-center.
    expect(craterRadialT(crater, rim)).toBeGreaterThan(0.2);
  });

  test("procedural catalog is populated", () => {
    expect(getCraterCatalog().length).toBeGreaterThan(40);
  });

  test("mare away from spawn is not a flat zero field", () => {
    const far = new THREE.Vector3(-0.7, 0.2, -0.6).normalize();
    const h = sampleHeightDir(far);
    expect(Number.isFinite(h)).toBe(true);
    // Should have some relief (mare and/or a procedural bowl).
    expect(Math.abs(h)).toBeGreaterThan(0.05);
  });
});
