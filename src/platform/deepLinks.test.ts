import { describe, expect, test } from "bun:test";
import { parseDeepLink, partyInviteUrl } from "../platform/deepLinks";

describe("parseDeepLink", () => {
  test("parses lunarpup party and world schemes", () => {
    expect(parseDeepLink("lunarpup://party/pup-abc123")).toEqual({
      kind: "party",
      id: "pup-abc123",
    });
    expect(parseDeepLink("lunarpup://world/moon-bowl")).toEqual({
      kind: "world",
      id: "moon-bowl",
    });
  });

  test("parses https query invites", () => {
    expect(
      parseDeepLink("https://example.com/?party=pup-xyz&world=other"),
    ).toEqual({ kind: "party", id: "pup-xyz" });
    expect(parseDeepLink("https://example.com/?world=crater")).toEqual({
      kind: "world",
      id: "crater",
    });
  });

  test("returns null for unrelated URLs", () => {
    expect(parseDeepLink("https://example.com/")).toBeNull();
    expect(parseDeepLink("")).toBeNull();
  });
});

describe("partyInviteUrl", () => {
  test("falls back to lunarpup scheme without a window", () => {
    expect(partyInviteUrl("pup-test01")).toBe("lunarpup://party/pup-test01");
  });
});
