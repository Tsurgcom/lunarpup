import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  fallbackPlayerName,
  loadPlayerName,
  sanitizePlayerName,
  savePlayerName,
} from "./playerName";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });
});

afterEach(() => {
  store.clear();
});

describe("fallbackPlayerName", () => {
  test("prefixes Pup with last 4 of id", () => {
    expect(fallbackPlayerName("abcdef12")).toBe("Pupef12");
  });
});

describe("sanitizePlayerName", () => {
  test("trims and collapses spaces", () => {
    expect(sanitizePlayerName("  Moon   Pup  ", "X")).toBe("Moon Pup");
  });

  test("strips illegal characters and clamps length", () => {
    expect(sanitizePlayerName("Hi@Pup!!!", "X")).toBe("HiPup");
    expect(sanitizePlayerName("abcdefghijklmnopqrs", "X")).toBe(
      "abcdefghijklmnop",
    );
  });

  test("allows letters numbers spaces underscore hyphen", () => {
    expect(sanitizePlayerName("Pup_1-2", "X")).toBe("Pup_1-2");
  });

  test("empty or stripped-only falls back", () => {
    expect(sanitizePlayerName("", "Pupab12")).toBe("Pupab12");
    expect(sanitizePlayerName("   ", "Pupab12")).toBe("Pupab12");
    expect(sanitizePlayerName("@@@", "Pupab12")).toBe("Pupab12");
  });
});

describe("load/savePlayerName", () => {
  test("round-trips a sanitized name", () => {
    savePlayerName("CraterKid");
    expect(loadPlayerName("fallback")).toBe("CraterKid");
  });

  test("missing key returns fallback", () => {
    expect(loadPlayerName("Pupzzzz")).toBe("Pupzzzz");
  });

  test("corrupt stored value is sanitized", () => {
    localStorage.setItem("lunarpup:playerName:v1", "  bad@@@name  ");
    expect(loadPlayerName("X")).toBe("badname");
  });
});
