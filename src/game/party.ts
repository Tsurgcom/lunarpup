export type PartyMessage =
  | { t: "sync"; name: string; ready: boolean; host?: boolean }
  | { t: "ready"; ready: boolean }
  | { t: "start"; world: string }
  | { t: "state"; started: boolean; world: string | null };

export type PartyMember = {
  id: string;
  name: string;
  ready: boolean;
};

export type PartyState = {
  members: Map<string, PartyMember>;
  hostId: string | null;
  started: boolean;
  world: string | null;
};

export function createPartyState(): PartyState {
  return {
    members: new Map(),
    hostId: null,
    started: false,
    world: null,
  };
}

export function isValidWorldId(world: unknown): world is string {
  return typeof world === "string" && world.trim().length > 0;
}

export function sanitizeWorldId(raw: string, fallback = "moon-bowl"): string {
  const trimmed = raw.trim();
  return trimmed || fallback;
}

export function isValidPartyMessage(msg: unknown): msg is PartyMessage {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  if (m.t === "sync") {
    return (
      typeof m.name === "string" &&
      typeof m.ready === "boolean" &&
      (m.host === undefined || typeof m.host === "boolean")
    );
  }
  if (m.t === "ready") return typeof m.ready === "boolean";
  if (m.t === "start") return isValidWorldId(m.world);
  if (m.t === "state") {
    return (
      typeof m.started === "boolean" &&
      (m.world === null || isValidWorldId(m.world))
    );
  }
  return false;
}

/** Lexicographically lowest id — used when sticky host leaves. */
export function electHost(memberIds: readonly string[]): string | null {
  if (memberIds.length === 0) return null;
  let best = memberIds[0] ?? null;
  if (best === null) return null;
  for (let i = 1; i < memberIds.length; i++) {
    const id = memberIds[i];
    if (id !== undefined && id < best) best = id;
  }
  return best;
}

export function allReady(members: readonly PartyMember[]): boolean {
  return members.length > 0 && members.every((m) => m.ready);
}

export function canHostStart(
  members: readonly PartyMember[],
  selfId: string,
  hostId: string | null,
): boolean {
  return hostId === selfId && allReady(members);
}

export function upsertMember(
  members: Map<string, PartyMember>,
  id: string,
  name: string,
  ready: boolean,
): Map<string, PartyMember> {
  const next = new Map(members);
  next.set(id, { id, name, ready });
  return next;
}

export function removeMember(
  members: Map<string, PartyMember>,
  id: string,
): Map<string, PartyMember> {
  if (!members.has(id)) return members;
  const next = new Map(members);
  next.delete(id);
  return next;
}

export function setMemberReady(
  members: Map<string, PartyMember>,
  id: string,
  ready: boolean,
): Map<string, PartyMember> {
  const existing = members.get(id);
  if (!existing) return members;
  if (existing.ready === ready) return members;
  const next = new Map(members);
  next.set(id, { ...existing, ready });
  return next;
}

export function membersList(members: Map<string, PartyMember>): PartyMember[] {
  return [...members.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Drop a peer. If they were sticky host, re-elect lex-lowest among remaining.
 */
export function applyMemberLeave(
  state: PartyState,
  peerId: string,
): PartyState {
  const members = removeMember(state.members, peerId);
  if (members === state.members) return state;
  let hostId = state.hostId;
  if (hostId === peerId) {
    hostId = electHost([...members.keys()]);
  }
  return { ...state, members, hostId };
}

/**
 * Apply a validated party message from `peerId`.
 * Non-host `start` / `state` are ignored.
 */
export function applyPartyMessage(
  state: PartyState,
  peerId: string,
  msg: PartyMessage,
): PartyState {
  if (msg.t === "sync") {
    const members = upsertMember(state.members, peerId, msg.name, msg.ready);
    const hostId = msg.host === true ? peerId : state.hostId;
    return { ...state, members, hostId };
  }

  if (msg.t === "ready") {
    return {
      ...state,
      members: setMemberReady(state.members, peerId, msg.ready),
    };
  }

  if (msg.t === "start") {
    if (state.hostId !== null && peerId !== state.hostId) return state;
    // Allow start before host is known if sender is sole/claimed host later —
    // only accept when host matches or host is unset and we'll trust sender.
    if (state.hostId === null) {
      return {
        ...state,
        hostId: peerId,
        started: true,
        world: sanitizeWorldId(msg.world),
      };
    }
    return {
      ...state,
      started: true,
      world: sanitizeWorldId(msg.world),
    };
  }

  // state — host snapshot for late joiners
  if (state.hostId !== null && peerId !== state.hostId) return state;
  if (state.hostId === null) {
    return {
      ...state,
      hostId: peerId,
      started: msg.started,
      world: msg.world ? sanitizeWorldId(msg.world) : null,
    };
  }
  return {
    ...state,
    started: msg.started,
    world: msg.world ? sanitizeWorldId(msg.world) : null,
  };
}
