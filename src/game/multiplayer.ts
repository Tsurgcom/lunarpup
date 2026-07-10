import { useCallback, useEffect, useMemo, useState } from "react";
import { joinRoom, selfId } from "@trystero-p2p/nostr";
import type { MessageAction, Room } from "@trystero-p2p/core";
import { clearPeers, removePeer, upsertPeer } from "./peerStore";
import type { PlayerSnapshot } from "./types";
import { pickStyle } from "./types";

const APP_ID = "lunarpup-moon-bowl-v1";

/** Small, fast Nostr relay set — full default list is slow to dial. */
const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://yabu.me/v2",
  "wss://nostr.data.haus",
  "wss://relay.mostr.pub",
  "wss://purplerelay.com",
];

export type MultiplayerStatus = "connecting" | "ready" | "error";

type RoomApi = {
  peerCount: number;
  selfId: string;
  status: MultiplayerStatus;
  statusDetail: string;
  sendState: (snap: PlayerSnapshot) => void;
  style: { fur: string; accent: string };
};

type PupAction = MessageAction<PlayerSnapshot>;

type Session = {
  roomId: string;
  room: Room;
  action: PupAction;
  refs: number;
  lastSnap: PlayerSnapshot | null;
  leaveTimer: ReturnType<typeof setTimeout> | null;
  helloTimer: ReturnType<typeof setInterval> | null;
};

type SessionListener = () => void;

let session: Session | null = null;
const listeners = new Set<SessionListener>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribeSession(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function peerIdsFromRoom(room: Room): string[] {
  return Object.keys(room.getPeers());
}

function isValidSnap(snap: unknown): snap is PlayerSnapshot {
  if (!snap || typeof snap !== "object") return false;
  const s = snap as PlayerSnapshot;
  return (
    typeof s.x === "number" &&
    typeof s.y === "number" &&
    typeof s.z === "number" &&
    Number.isFinite(s.x) &&
    Number.isFinite(s.y) &&
    Number.isFinite(s.z)
  );
}

function styleForSelf(): { fur: string; accent: string } {
  return pickStyle(selfId);
}

function spawnSnapshot(): PlayerSnapshot {
  const style = styleForSelf();
  return {
    x: 0,
    y: 2,
    z: 14,
    yaw: Math.PI,
    pitch: 0,
    roll: 0,
    speed: 0,
    fur: style.fur,
    accent: style.accent,
    name: selfId.slice(0, 6),
    ghost: false,
  };
}

function safeSend(action: PupAction, snap: PlayerSnapshot, peerId?: string): void {
  try {
    if (peerId) action.send(snap, { target: peerId });
    else action.send(snap);
  } catch {
    /* channel may not be ready yet */
  }
}

/** Data channel can lag handshake — retry the intro pose a few times. */
function introduceToPeer(action: PupAction, peerId: string): void {
  const push = () => {
    if (!session?.lastSnap) return;
    safeSend(action, session.lastSnap, peerId);
  };
  push();
  window.setTimeout(push, 50);
  window.setTimeout(push, 200);
  window.setTimeout(push, 600);
  window.setTimeout(push, 1500);
}

function stopHello(target: Session): void {
  if (target.helloTimer) {
    clearInterval(target.helloTimer);
    target.helloTimer = null;
  }
}

function startHello(target: Session): void {
  stopHello(target);
  // Burst presence while discovering peers so late joiners see us immediately
  let ticks = 0;
  target.helloTimer = setInterval(() => {
    if (!session || session !== target) {
      stopHello(target);
      return;
    }
    if (session.lastSnap) safeSend(session.action, session.lastSnap);
    ticks += 1;
    // Fast for 8s, then slow heartbeat
    if (ticks === 40 && target.helloTimer) {
      clearInterval(target.helloTimer);
      target.helloTimer = setInterval(() => {
        if (!session || session !== target || !session.lastSnap) return;
        if (peerIdsFromRoom(session.room).length === 0) {
          safeSend(session.action, session.lastSnap);
        }
      }, 2000);
    }
  }, 200);
}

function wireRoom(room: Room, action: PupAction): void {
  room.onPeerJoin = (peerId: string) => {
    introduceToPeer(action, peerId);
    emit();
  };

  room.onPeerLeave = (peerId: string) => {
    removePeer(peerId);
    emit();
  };

  action.onMessage = (snap, { peerId }) => {
    if (!isValidSnap(snap)) return;
    upsertPeer(peerId, snap);
    emit();
  };
}

function destroySession(target: Session): void {
  if (session !== target) return;
  stopHello(target);
  session = null;
  clearPeers();
  try {
    void target.room.leave();
  } catch {
    /* ignore */
  }
  emit();
}

function ensureSession(roomId: string): Session {
  if (session?.roomId === roomId) return session;

  if (session) {
    const prev = session;
    if (prev.leaveTimer) clearTimeout(prev.leaveTimer);
    destroySession(prev);
  }

  clearPeers();
  const room = joinRoom(
    {
      appId: APP_ID,
      relayConfig: { urls: RELAYS, redundancy: 4 },
    },
    roomId,
  );
  const action = room.makeAction<PlayerSnapshot>("pup");
  session = {
    roomId,
    room,
    action,
    refs: 0,
    lastSnap: spawnSnapshot(),
    leaveTimer: null,
    helloTimer: null,
  };
  wireRoom(room, action);
  // Announce spawn pose immediately so peers can see us on open
  safeSend(action, session.lastSnap!);
  startHello(session);
  emit();
  return session;
}

function acquireSession(roomId: string): Session {
  const s = ensureSession(roomId);
  if (s.leaveTimer) {
    clearTimeout(s.leaveTimer);
    s.leaveTimer = null;
  }
  s.refs += 1;
  wireRoom(s.room, s.action);
  // Re-broadcast on (re)mount so a just-opened tab is visible right away
  if (s.lastSnap) safeSend(s.action, s.lastSnap);
  emit();
  return s;
}

function releaseSession(roomId: string): void {
  if (!session || session.roomId !== roomId) return;
  session.refs = Math.max(0, session.refs - 1);
  if (session.refs > 0) return;

  const target = session;
  target.leaveTimer = setTimeout(() => {
    if (session === target && session.refs <= 0) {
      destroySession(target);
    }
  }, 300);
}

function sendSnapshot(snap: PlayerSnapshot): void {
  if (!session) return;
  session.lastSnap = snap;
  safeSend(session.action, snap);
}

function getPeerCount(): number {
  if (!session) return 0;
  return peerIdsFromRoom(session.room).length;
}

function getStatus(): { status: MultiplayerStatus; detail: string } {
  if (!session) {
    return { status: "connecting", detail: "offline" };
  }
  const n = getPeerCount();
  if (n > 0) {
    return {
      status: "ready",
      detail: n === 1 ? "1 pup connected" : `${n} pups connected`,
    };
  }
  return { status: "connecting", detail: "looking for pups…" };
}

export function useMultiplayer(
  roomId: string,
  enabled = true,
): RoomApi {
  const style = useMemo(() => pickStyle(selfId), []);
  const [peerCount, setPeerCount] = useState(0);
  const [status, setStatus] = useState<MultiplayerStatus>("connecting");
  const [statusDetail, setStatusDetail] = useState(
    enabled ? "joining room…" : "offline",
  );

  useEffect(() => {
    if (!enabled) {
      setPeerCount(0);
      setStatus("connecting");
      setStatusDetail("offline");
      return;
    }

    try {
      acquireSession(roomId);
    } catch (err) {
      setStatus("error");
      setStatusDetail(err instanceof Error ? err.message : "failed to join");
      return;
    }

    const sync = () => {
      setPeerCount(getPeerCount());
      const next = getStatus();
      setStatus(next.status);
      setStatusDetail(next.detail);
    };

    sync();
    const unsub = subscribeSession(sync);
    // Poll quickly at first so the HUD updates as soon as WebRTC lands
    let poll = window.setInterval(sync, 150);
    const slow = window.setTimeout(() => {
      window.clearInterval(poll);
      poll = window.setInterval(sync, 500);
    }, 8000);

    return () => {
      window.clearTimeout(slow);
      window.clearInterval(poll);
      unsub();
      releaseSession(roomId);
    };
  }, [roomId, enabled]);

  const sendState = useCallback(
    (snap: PlayerSnapshot) => {
      if (!enabled) return;
      sendSnapshot(snap);
    },
    [enabled],
  );

  return {
    peerCount,
    selfId,
    status,
    statusDetail,
    sendState,
    style,
  };
}
