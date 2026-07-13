import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { BOARD_CLEARANCE } from "./physics";
import { isValidSnap, normalizeSnap, spawnSnapshot } from "./multiplayer";
import { SPAWN_DIR, surfacePoint } from "./terrain";
import { pickStyle } from "./types";
import type { PlayerSnapshot } from "./types";

function validSnap(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    x: 1,
    y: 2,
    z: 3,
    yaw: 0.1,
    pitch: -0.2,
    roll: 0.05,
    speed: 4,
    fur: "#e8b86d",
    accent: "#ff8fab",
    name: "pup",
    ghost: false,
    ...overrides,
  };
}

describe("isValidSnap", () => {
  test("accepts a well-formed snapshot", () => {
    expect(isValidSnap(validSnap())).toBe(true);
  });

  test("accepts ghost omitted", () => {
    const snap = validSnap();
    delete snap.ghost;
    expect(isValidSnap(snap)).toBe(true);
  });

  test("rejects null / non-objects", () => {
    expect(isValidSnap(null)).toBe(false);
    expect(isValidSnap(undefined)).toBe(false);
    expect(isValidSnap(42)).toBe(false);
  });

  test("rejects missing numeric fields", () => {
    const { yaw: _, ...noYaw } = validSnap();
    expect(isValidSnap(noYaw)).toBe(false);
  });

  test("rejects NaN orientation", () => {
    expect(isValidSnap(validSnap({ yaw: Number.NaN }))).toBe(false);
    expect(isValidSnap(validSnap({ pitch: Number.NaN }))).toBe(false);
    expect(isValidSnap(validSnap({ roll: Number.POSITIVE_INFINITY }))).toBe(
      false,
    );
  });

  test("rejects non-finite speed", () => {
    expect(isValidSnap(validSnap({ speed: Number.NaN }))).toBe(false);
  });

  test("rejects non-string style fields", () => {
    expect(isValidSnap({ ...validSnap(), fur: 1 })).toBe(false);
    expect(isValidSnap({ ...validSnap(), accent: null })).toBe(false);
    expect(isValidSnap({ ...validSnap(), name: undefined })).toBe(false);
  });

  test("rejects non-boolean ghost", () => {
    expect(isValidSnap({ ...validSnap(), ghost: "true" })).toBe(false);
  });
});

describe("normalizeSnap", () => {
  test("fills missing style fields from peer id", () => {
    const { yaw: _, pitch: __, roll: ___, speed: ____, fur: _____, accent: ______, name: _______, ghost: ________, ...posOnly } =
      validSnap();
    const normalized = normalizeSnap(posOnly, "peer-abc");
    expect(normalized).not.toBeNull();
    expect(normalized!.fur).toBeTypeOf("string");
    expect(normalized!.accent).toBeTypeOf("string");
    expect(normalized!.name).toBe("peer-a");
    expect(isValidSnap(normalized)).toBe(true);
  });

  test("rejects missing position", () => {
    expect(normalizeSnap({ yaw: 0 }, "peer")).toBeNull();
  });
});

describe("pickStyle", () => {
  test("always returns fur and accent strings (unsigned hash)", () => {
    for (let i = 0; i < 500; i++) {
      const style = pickStyle(`peer-${i}`);
      expect(typeof style.fur).toBe("string");
      expect(typeof style.accent).toBe("string");
    }
  });
});

describe("spawnSnapshot", () => {
  test("matches createBody surface position on SPAWN_DIR", () => {
    const snap = spawnSnapshot();
    const expected = surfacePoint(SPAWN_DIR, BOARD_CLEARANCE);
    const pos = new THREE.Vector3(snap.x, snap.y, snap.z);
    expect(pos.distanceTo(expected)).toBeLessThan(1e-6);
  });

  test("has finite orientation and style strings", () => {
    const snap = spawnSnapshot();
    expect(Number.isFinite(snap.yaw)).toBe(true);
    expect(Number.isFinite(snap.pitch)).toBe(true);
    expect(Number.isFinite(snap.roll)).toBe(true);
    expect(typeof snap.fur).toBe("string");
    expect(typeof snap.accent).toBe("string");
    expect(typeof snap.name).toBe("string");
    expect(snap.speed).toBe(0);
    expect(snap.ghost).toBe(false);
    expect(isValidSnap(snap)).toBe(true);
  });
});
