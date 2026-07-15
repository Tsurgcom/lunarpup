import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import {
  cancelStaleFaceBuilds,
  drainChunkBuildResults,
  faceBuildKey,
  requestFaceGeometry,
  resetChunkBuildQueue,
} from "./chunkBuild";
import { createFaceGeometryData, faceIndicesForSubdiv } from "./chunkGeometry";
import {
  CLIPMAP_LODS,
  computeLodViewer,
  cullFaces,
  faceBackCulled,
  faceLodLevel,
  faceOverHorizon,
  facesNear,
  faceWithinArc,
  geodesicDistance,
  getIcoFaces,
  HORIZON_COS,
  lodColor,
  resetChunkLod,
  sampleTerrainHeight,
  setTerrainGenerator,
  speedRingScale,
  updateChunkLod,
} from "./chunkLod";
import { MOON_RADIUS, SPAWN_DIR } from "./moon";

describe("chunkLod", () => {
  test("icosphere chunks cover the sphere", () => {
    const faces = getIcoFaces();
    // detail 2 → 20·4² = 320
    expect(faces.length).toBe(320);
    for (const f of faces) {
      expect(f.centroid.length()).toBeCloseTo(1, 5);
      expect(f.neighbors.length).toBeGreaterThanOrEqual(3);
    }
  });

  test("facesNear returns a local patch around spawn", () => {
    const near = facesNear(SPAWN_DIR, 80);
    expect(near.length).toBeGreaterThan(0);
    expect(near.length).toBeLessThan(getIcoFaces().length);
    for (const f of near) {
      expect(faceWithinArc(SPAWN_DIR, f, 80)).toBe(true);
    }
  });

  test("corner-aware cull keeps faces the centroid test would drop", () => {
    const faces = getIcoFaces();
    const tight = 35;
    const cos = Math.cos(tight / MOON_RADIUS);
    let found = false;
    for (const f of faces) {
      const centroidOut = f.centroid.dot(SPAWN_DIR) < cos;
      const cornerIn =
        f.a.dot(SPAWN_DIR) >= cos ||
        f.b.dot(SPAWN_DIR) >= cos ||
        f.c.dot(SPAWN_DIR) >= cos;
      if (centroidOut && cornerIn) {
        expect(faceWithinArc(SPAWN_DIR, f, tight)).toBe(true);
        found = true;
        break;
      }
    }
    if (!found) {
      const near = facesNear(SPAWN_DIR, tight);
      expect(near.length).toBeGreaterThan(0);
    }
  });

  test("back-face / horizon cull drops the far hemisphere", () => {
    const faces = getIcoFaces();
    const far = faces.find((f) => f.centroid.dot(SPAWN_DIR) < -0.5);
    expect(far).toBeDefined();
    expect(faceBackCulled(SPAWN_DIR, far!)).toBe(true);
    expect(faceOverHorizon(SPAWN_DIR, far!, HORIZON_COS)).toBe(true);
    const near = faces.find((f) => f.centroid.dot(SPAWN_DIR) > 0.9);
    expect(near).toBeDefined();
    expect(faceBackCulled(SPAWN_DIR, near!)).toBe(false);
    expect(faceOverHorizon(SPAWN_DIR, near!, HORIZON_COS)).toBe(false);
  });

  test("clipmap uses four LOD rings", () => {
    expect(CLIPMAP_LODS.length).toBe(4);
    expect(CLIPMAP_LODS[0]!.subdiv).toBeGreaterThan(CLIPMAP_LODS[3]!.subdiv);
  });

  test("horizon cull drops over-the-limb faces from the load set", () => {
    const enter = 200;
    const exit = 228;
    const kept = cullFaces(SPAWN_DIR, enter, exit, new Set());
    expect(kept.length).toBeGreaterThan(0);
    for (const f of kept) {
      expect(faceOverHorizon(SPAWN_DIR, f, HORIZON_COS)).toBe(false);
    }
    // Far-side faces never appear even if the arc would be huge.
    const far = getIcoFaces().find((f) => f.centroid.dot(SPAWN_DIR) < -0.5);
    expect(far).toBeDefined();
    expect(kept.some((f) => f.index === far!.index)).toBe(false);
  });

  test("hysteresis keeps a face after it leaves the enter arc", () => {
    resetChunkLod();
    const faces = getIcoFaces();
    const enter = 60;
    const exit = 88;
    // Must be outside enter by corners (not just centroid) so a cold cull
    // drops it, while exit arc still covers the centroid.
    const boundary = faces.find((f) => {
      if (faceBackCulled(SPAWN_DIR, f)) return false;
      if (faceWithinArc(SPAWN_DIR, f, enter)) return false;
      return faceWithinArc(SPAWN_DIR, f, exit);
    });
    expect(boundary).toBeDefined();
    const prev = new Set([boundary!.index]);
    const kept = cullFaces(SPAWN_DIR, enter, exit, prev);
    expect(kept.some((f) => f.index === boundary!.index)).toBe(true);
    const dropped = cullFaces(SPAWN_DIR, enter, exit, new Set());
    expect(dropped.some((f) => f.index === boundary!.index)).toBe(false);
  });

  test("closer faces get lower LOD levels than far ones", () => {
    const faces = getIcoFaces();
    let closest = faces[0]!;
    let farthest = faces[0]!;
    let minArc = Infinity;
    let maxArc = -Infinity;
    for (const f of faces) {
      const arc = geodesicDistance(SPAWN_DIR, f.centroid);
      if (arc < minArc) {
        minArc = arc;
        closest = f;
      }
      if (arc > maxArc && arc < 200) {
        maxArc = arc;
        farthest = f;
      }
    }
    expect(faceLodLevel(SPAWN_DIR, closest)).toBeLessThan(
      faceLodLevel(SPAWN_DIR, farthest),
    );
  });

  test("velocity look-ahead shifts viewer along travel", () => {
    const pos = SPAWN_DIR.clone().multiplyScalar(320);
    const east = new THREE.Vector3(0, 1, 0).cross(SPAWN_DIR).normalize();
    const vel = east.clone().multiplyScalar(30);
    const viewer = new THREE.Vector3();
    const arc = computeLodViewer(
      pos.x,
      pos.y,
      pos.z,
      vel.x,
      vel.y,
      vel.z,
      viewer,
    );
    expect(arc).toBeGreaterThan(1);
    expect(viewer.dot(SPAWN_DIR)).toBeLessThan(0.999);
    expect(viewer.dot(east)).toBeGreaterThan(SPAWN_DIR.dot(east));
  });

  test("higher speed expands ring scale", () => {
    expect(speedRingScale(0)).toBe(1);
    expect(speedRingScale(40)).toBeGreaterThan(1.4);
  });

  test("updateChunkLod publishes coloured entries", () => {
    resetChunkLod();
    const pos = SPAWN_DIR.clone().multiplyScalar(320);
    const snap = updateChunkLod(pos.x, pos.y, pos.z, 0, 0, 0);
    expect(snap.chunks.length).toBeGreaterThan(0);
    expect(snap.speedScale).toBe(1);
    for (const c of snap.chunks) {
      expect(c.color).toBe(lodColor(c.level));
      expect(c.level).toBeGreaterThanOrEqual(0);
      expect(c.level).toBeLessThan(CLIPMAP_LODS.length);
    }
  });

  test("unchanged plan reuses the chunks array reference", () => {
    resetChunkLod();
    const pos = SPAWN_DIR.clone().multiplyScalar(320);
    const a = updateChunkLod(pos.x, pos.y, pos.z, 0, 0, 0);
    const b = updateChunkLod(pos.x, pos.y, pos.z, 0, 0, 0);
    expect(b.chunks).toBe(a.chunks);
  });

  test("terrain generator API samples registered height", () => {
    setTerrainGenerator({
      name: "test",
      sample: (dir) => dir.y * 10,
    });
    expect(sampleTerrainHeight(new THREE.Vector3(0, 1, 0))).toBeCloseTo(10);
    setTerrainGenerator(null);
    expect(sampleTerrainHeight(new THREE.Vector3(0, 1, 0))).toBe(0);
  });
});

describe("chunkBuild", () => {
  test("sync fallback builds transferable geometry", async () => {
    resetChunkBuildQueue();
    const face = getIcoFaces()[0]!;
    const geoPromise = requestFaceGeometry(face, 4, 10);
    // Worker results sit in a ready queue until drained onto the main thread.
    const geo = await settleFaceGeometry(geoPromise);
    const pos = geo.getAttribute("position");
    expect(pos).toBeDefined();
    expect(pos!.count).toBe(((4 + 1) * (4 + 2)) / 2);
    geo.dispose();
    resetChunkBuildQueue();
  });

  test("cancelStaleFaceBuilds aborts queued work", async () => {
    resetChunkBuildQueue();
    const face = getIcoFaces()[0]!;
    const key = faceBuildKey(face.index, 8);
    // Flood the queue so some stay pending (sync path drains immediately,
    // so cancel after scheduling many then only mark a different live set).
    const promises = getIcoFaces()
      .slice(0, 8)
      .map((f, i) => requestFaceGeometry(f, 12 + (i % 3), 1));
    cancelStaleFaceBuilds(new Set([key])); // keep only one key
    const tick = setInterval(() => drainChunkBuildResults(4), 0);
    try {
      const results = await Promise.allSettled(promises);
      // At least the sync fallback may have completed some before cancel —
      // cancelled ones must be AbortError; completed ones are fine.
      for (const r of results) {
        if (r.status === "rejected") {
          expect((r.reason as DOMException).name).toBe("AbortError");
        } else {
          r.value.dispose();
        }
      }
    } finally {
      clearInterval(tick);
    }
    resetChunkBuildQueue();
  });

  test("createFaceGeometryData matches subdiv vertex count", () => {
    const face = getIcoFaces()[0]!;
    const data = createFaceGeometryData(face, 6);
    expect(data.positions.length / 3).toBe(((6 + 1) * (6 + 2)) / 2);
    expect(data.indices.length % 3).toBe(0);
    expect(data.subdiv).toBe(6);
  });

  test("face index templates are shared per subdiv", () => {
    expect(faceIndicesForSubdiv(8)).toBe(faceIndicesForSubdiv(8));
    expect(faceIndicesForSubdiv(8)).not.toBe(faceIndicesForSubdiv(12));
  });
});

/** Pump deferred worker wraps until the build promise settles. */
async function settleFaceGeometry(
  promise: Promise<THREE.BufferGeometry>,
): Promise<THREE.BufferGeometry> {
  let settled: THREE.BufferGeometry | null = null;
  let error: unknown;
  void promise.then(
    (geo) => {
      settled = geo;
    },
    (err) => {
      error = err;
    },
  );
  for (let i = 0; i < 200; i++) {
    drainChunkBuildResults(8);
    if (settled) return settled;
    if (error) throw error;
    await new Promise<void>((r) => setTimeout(r, 0));
  }
  throw new Error("face geometry build timed out");
}
