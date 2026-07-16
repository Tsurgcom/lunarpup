import type { MessageAction, Room } from "@trystero-p2p/core";
import { selfId } from "@trystero-p2p/nostr";
import { useCallback, useEffect, useState } from "react";
import {
  createEmitter,
  introduceWithRetry,
  joinTrysteroRoom,
  safeSend,
} from "./netSession";
import {
  allReady,
  applyMemberLeave,
  applyPartyMessage,
  canHostStart,
  createPartyState,
  isValidPartyMessage,
  membersList,
  type PartyMember,
  type PartyMessage,
  type PartyState,
  sanitizeWorldId,
  upsertMember,
} from "./party";

export type PartyApi = {
  members: PartyMember[];
  selfId: string;
  hostId: string | null;
  isHost: boolean;
  ready: boolean;
  allReady: boolean;
  canStart: boolean;
  started: boolean;
  world: string | null;
  /** Increments on each host start (and late-join started state). */
  startSeq: number;
  setReady: (ready: boolean) => void;
  /** Host only — broadcast start with chosen world. */
  start: (world: string) => void;
  setPlayerName: (name: string) => void;
};

type PartyAction = MessageAction<PartyMessage>;

type PartySession = {
  partyId: string;
  room: Room;
  partyAction: PartyAction;
  refs: number;
  leaveTimer: ReturnType<typeof setTimeout> | null;
  /** True when this tab created the party (sticky host seed). */
  isCreator: boolean;
};

const { emit, subscribe: subscribeSession } = createEmitter();

let session: PartySession | null = null;
let localPlayerName = selfId.slice(0, 6);
let localReady = false;
let partyState: PartyState = createPartyState();
/** Bumps on each accepted `start` / started `state` so App can detect re-starts. */
let startSeq = 0;

function clearPartyState(): void {
  partyState = createPartyState();
  localReady = false;
  startSeq = 0;
}

function syncSelfMember(): void {
  partyState = {
    ...partyState,
    members: upsertMember(
      partyState.members,
      selfId,
      localPlayerName,
      localReady,
    ),
  };
}

function syncPayload(): PartyMessage {
  return {
    t: "sync",
    name: localPlayerName,
    ready: localReady,
    ...(partyState.hostId === selfId ? { host: true as const } : {}),
  };
}

function statePayload(): PartyMessage {
  return {
    t: "state",
    started: partyState.started,
    world: partyState.world,
  };
}

function introduceToPeer(action: PartyAction, peerId: string): void {
  introduceWithRetry(() => {
    if (!session) return;
    safeSend(action, syncPayload(), peerId);
    if (partyState.hostId === selfId) {
      safeSend(action, statePayload(), peerId);
    }
  });
}

function handlePartyMessage(msg: unknown, peerId: string): void {
  if (!isValidPartyMessage(msg)) return;
  const prevHost = partyState.hostId;
  const wasStarted = partyState.started;
  const prevWorld = partyState.world;
  partyState = applyPartyMessage(partyState, peerId, msg);
  if (
    partyState.started &&
    (!wasStarted || partyState.world !== prevWorld || msg.t === "start")
  ) {
    startSeq += 1;
  }
  // If we just became host via re-election elsewhere, announce.
  if (prevHost !== selfId && partyState.hostId === selfId && session) {
    safeSend(session.partyAction, syncPayload());
  }
  emit();
}

function wireRoom(room: Room, partyAction: PartyAction): void {
  room.onPeerJoin = (peerId: string) => {
    introduceToPeer(partyAction, peerId);
    emit();
  };

  room.onPeerLeave = (peerId: string) => {
    const wasHost = partyState.hostId === peerId;
    partyState = applyMemberLeave(partyState, peerId);
    if (wasHost && partyState.hostId === selfId && session) {
      // We won re-election — claim sticky host.
      safeSend(session.partyAction, syncPayload());
      if (partyState.started) {
        safeSend(session.partyAction, statePayload());
      }
    }
    emit();
  };

  partyAction.onMessage = (msg, { peerId }) => {
    handlePartyMessage(msg, peerId);
  };
}

function destroySession(target: PartySession): void {
  if (session !== target) return;
  session = null;
  clearPartyState();
  try {
    void target.room.leave();
  } catch {
    /* ignore */
  }
  emit();
}

function ensureSession(partyId: string, isCreator: boolean): PartySession {
  if (session?.partyId === partyId) return session;

  if (session) {
    const prev = session;
    if (prev.leaveTimer) clearTimeout(prev.leaveTimer);
    destroySession(prev);
  }

  clearPartyState();
  const room = joinTrysteroRoom(partyId, () => emit());
  const partyAction = room.makeAction<PartyMessage>("party");

  if (isCreator) {
    partyState = {
      ...partyState,
      hostId: selfId,
    };
  }
  syncSelfMember();

  session = {
    partyId,
    room,
    partyAction,
    refs: 0,
    leaveTimer: null,
    isCreator,
  };
  wireRoom(room, partyAction);
  safeSend(partyAction, syncPayload());
  emit();
  return session;
}

function acquireSession(partyId: string, isCreator: boolean): PartySession {
  const s = ensureSession(partyId, isCreator);
  if (s.leaveTimer) {
    clearTimeout(s.leaveTimer);
    s.leaveTimer = null;
  }
  s.refs += 1;
  wireRoom(s.room, s.partyAction);
  syncSelfMember();
  safeSend(s.partyAction, syncPayload());
  emit();
  return s;
}

function releaseSession(partyId: string): void {
  if (!session || session.partyId !== partyId) return;
  session.refs = Math.max(0, session.refs - 1);
  if (session.refs > 0) return;

  const target = session;
  target.leaveTimer = setTimeout(() => {
    if (session === target && session.refs <= 0) {
      destroySession(target);
    }
  }, 300);
}

function broadcastLocalName(name: string): void {
  localPlayerName = name;
  syncSelfMember();
  if (session) {
    safeSend(session.partyAction, syncPayload());
  }
  emit();
}

export function setPartyPlayerName(name: string): void {
  broadcastLocalName(name);
}

function setLocalReady(ready: boolean): void {
  localReady = ready;
  syncSelfMember();
  if (session) {
    safeSend(session.partyAction, { t: "ready", ready });
    safeSend(session.partyAction, syncPayload());
  }
  emit();
}

function broadcastStart(world: string): void {
  if (!session) return;
  const members = membersList(partyState.members);
  if (!canHostStart(members, selfId, partyState.hostId)) return;
  const worldId = sanitizeWorldId(world);
  partyState = {
    ...partyState,
    started: true,
    world: worldId,
  };
  startSeq += 1;
  safeSend(session.partyAction, { t: "start", world: worldId });
  emit();
}

/**
 * @param isCreator — true when this tab created the party (sticky host).
 */
export function useParty(
  partyId: string | null,
  enabled = true,
  playerName?: string,
  isCreator = false,
): PartyApi {
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [ready, setReadyState] = useState(false);
  const [started, setStarted] = useState(false);
  const [hostId, setHostId] = useState<string | null>(null);
  const [world, setWorld] = useState<string | null>(null);
  const [startSeqState, setStartSeqState] = useState(0);

  useEffect(() => {
    if (!enabled || playerName === undefined) return;
    if (playerName !== localPlayerName) {
      broadcastLocalName(playerName);
    }
  }, [enabled, playerName]);

  useEffect(() => {
    if (!enabled || !partyId) {
      setMembers([]);
      setReadyState(false);
      setStarted(false);
      setHostId(null);
      setWorld(null);
      setStartSeqState(0);
      return;
    }

    try {
      acquireSession(partyId, isCreator);
    } catch {
      return;
    }

    const sync = () => {
      if (!session || session.partyId !== partyId) {
        setMembers([]);
        setReadyState(false);
        setStarted(false);
        setHostId(null);
        setWorld(null);
        setStartSeqState(0);
        return;
      }
      setMembers(membersList(partyState.members));
      setReadyState(localReady);
      setStarted(partyState.started);
      setHostId(partyState.hostId);
      setWorld(partyState.world);
      setStartSeqState(startSeq);
    };

    sync();
    const unsub = subscribeSession(sync);
    const poll = window.setInterval(sync, 500);

    return () => {
      window.clearInterval(poll);
      unsub();
      releaseSession(partyId);
    };
  }, [partyId, enabled, isCreator]);

  const setReady = useCallback(
    (next: boolean) => {
      if (!enabled) return;
      setLocalReady(next);
    },
    [enabled],
  );

  const start = useCallback(
    (nextWorld: string) => {
      if (!enabled) return;
      broadcastStart(nextWorld);
    },
    [enabled],
  );

  const setPlayerName = useCallback(
    (name: string) => {
      if (!enabled) return;
      broadcastLocalName(name);
    },
    [enabled],
  );

  const list = members;
  const canStart = canHostStart(list, selfId, hostId);

  return {
    members: list,
    selfId,
    hostId,
    isHost: hostId === selfId,
    ready,
    allReady: allReady(list),
    canStart,
    started,
    world,
    startSeq: startSeqState,
    setReady,
    start,
    setPlayerName,
  };
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (!session) return;
    const target = session;
    session = null;
    clearPartyState();
    void target.room.leave().catch(() => {});
    emit();
  });
}
