import { describe, expect, test } from "bun:test";
import {
  allReady,
  applyMemberLeave,
  applyPartyMessage,
  canHostStart,
  createPartyState,
  electHost,
  isValidPartyMessage,
  type PartyMember,
  removeMember,
  sanitizeWorldId,
  setMemberReady,
  upsertMember,
} from "./party";

function member(id: string, name: string, ready = false): PartyMember {
  return { id, name, ready };
}

describe("isValidPartyMessage", () => {
  test("accepts sync / ready / start / state", () => {
    expect(
      isValidPartyMessage({ t: "sync", name: "A", ready: true, host: true }),
    ).toBe(true);
    expect(isValidPartyMessage({ t: "ready", ready: false })).toBe(true);
    expect(isValidPartyMessage({ t: "start", world: "moon-bowl" })).toBe(true);
    expect(
      isValidPartyMessage({ t: "state", started: true, world: "crater" }),
    ).toBe(true);
    expect(
      isValidPartyMessage({ t: "state", started: false, world: null }),
    ).toBe(true);
  });

  test("rejects garbage", () => {
    expect(isValidPartyMessage(null)).toBe(false);
    expect(isValidPartyMessage({ t: "member", name: "A", ready: true })).toBe(
      false,
    );
    expect(isValidPartyMessage({ t: "start" })).toBe(false);
    expect(isValidPartyMessage({ t: "start", world: "  " })).toBe(false);
    expect(isValidPartyMessage({ t: "ready" })).toBe(false);
    expect(isValidPartyMessage({ t: "nope" })).toBe(false);
  });
});

describe("sanitizeWorldId", () => {
  test("trims and falls back", () => {
    expect(sanitizeWorldId("  crater  ")).toBe("crater");
    expect(sanitizeWorldId("")).toBe("moon-bowl");
  });
});

describe("electHost", () => {
  test("picks lexicographically lowest id", () => {
    expect(electHost(["z", "a", "m"])).toBe("a");
  });

  test("empty → null", () => {
    expect(electHost([])).toBeNull();
  });
});

describe("ready / start gate", () => {
  test("allReady requires everyone ready", () => {
    expect(allReady([])).toBe(false);
    expect(allReady([member("a", "A", true)])).toBe(true);
    expect(allReady([member("a", "A", true), member("b", "B", false)])).toBe(
      false,
    );
  });

  test("canHostStart only for host when all ready", () => {
    const roster = [member("a", "A", true), member("b", "B", true)];
    expect(canHostStart(roster, "a", "a")).toBe(true);
    expect(canHostStart(roster, "b", "a")).toBe(false);
    expect(
      canHostStart([member("a", "A", true), member("b", "B", false)], "a", "a"),
    ).toBe(false);
  });
});

describe("applyPartyMessage", () => {
  test("sync upserts roster and sticky host claim", () => {
    let state = createPartyState();
    state = applyPartyMessage(state, "peer1", {
      t: "sync",
      name: "Nova",
      ready: true,
      host: true,
    });
    expect(state.hostId).toBe("peer1");
    expect(state.members.get("peer1")).toEqual({
      id: "peer1",
      name: "Nova",
      ready: true,
    });
    state = applyPartyMessage(state, "peer2", {
      t: "sync",
      name: "Pup",
      ready: false,
    });
    expect(state.hostId).toBe("peer1");
    expect(state.members.get("peer2")?.name).toBe("Pup");
  });

  test("ready updates existing member", () => {
    let state = createPartyState();
    state = {
      ...state,
      members: upsertMember(state.members, "p", "Pup", false),
      hostId: "p",
    };
    state = applyPartyMessage(state, "p", { t: "ready", ready: true });
    expect(state.members.get("p")?.ready).toBe(true);
  });

  test("start from host sets started + world", () => {
    let state = createPartyState();
    state = {
      ...state,
      members: upsertMember(state.members, "host", "H", true),
      hostId: "host",
    };
    state = applyPartyMessage(state, "host", {
      t: "start",
      world: "moon-bowl",
    });
    expect(state.started).toBe(true);
    expect(state.world).toBe("moon-bowl");
  });

  test("start from non-host is ignored", () => {
    let state = createPartyState();
    state = {
      ...state,
      members: upsertMember(
        upsertMember(state.members, "a", "A", true),
        "b",
        "B",
        true,
      ),
      hostId: "a",
    };
    state = applyPartyMessage(state, "b", { t: "start", world: "x" });
    expect(state.started).toBe(false);
    expect(state.world).toBeNull();
  });

  test("state from host updates late joiner", () => {
    let state = createPartyState();
    state = { ...state, hostId: "host" };
    state = applyPartyMessage(state, "host", {
      t: "state",
      started: true,
      world: "crater-2",
    });
    expect(state.started).toBe(true);
    expect(state.world).toBe("crater-2");
  });

  test("state from non-host is ignored", () => {
    let state = createPartyState();
    state = { ...state, hostId: "host" };
    state = applyPartyMessage(state, "other", {
      t: "state",
      started: true,
      world: "x",
    });
    expect(state.started).toBe(false);
  });
});

describe("applyMemberLeave", () => {
  test("re-elects host when sticky host leaves", () => {
    let state = createPartyState();
    state = {
      ...state,
      members: upsertMember(
        upsertMember(state.members, "a", "A", true),
        "z",
        "Z",
        true,
      ),
      hostId: "a",
    };
    state = applyMemberLeave(state, "a");
    expect(state.hostId).toBe("z");
    expect(state.members.has("a")).toBe(false);
  });
});

describe("roster helpers", () => {
  test("removeMember drops peer", () => {
    const map = upsertMember(new Map(), "x", "X", false);
    expect(removeMember(map, "x").has("x")).toBe(false);
  });

  test("setMemberReady is a no-op when unchanged", () => {
    const map = upsertMember(new Map(), "x", "X", true);
    expect(setMemberReady(map, "x", true)).toBe(map);
  });
});
