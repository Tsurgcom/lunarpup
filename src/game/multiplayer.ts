import type { MessageAction, Room } from "@trystero-p2p/core";
import { joinRoom, selfId } from "@trystero-p2p/nostr";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { SPAWN_DIR, spawnPosition } from "./moon";
import { boardAxes } from "./movement";
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

const _spawnFwd = new THREE.Vector3();
const _spawnRight = new THREE.Vector3();
const _spawnLook = new THREE.Matrix4();
const _spawnQuat = new THREE.Quaternion();
const _spawnEuler = new THREE.Euler();

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

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Gate peer poses before they land in peerStore / RemotePlayers. */
export function isValidSnap(snap: unknown): snap is PlayerSnapshot {
  if (!snap || typeof snap !== "object") return false;
  const s = snap as Record<string, unknown>;
  if (
    !isFiniteNumber(s.x) ||
    !isFiniteNumber(s.y) ||
    !isFiniteNumber(s.z) ||
    !isFiniteNumber(s.yaw) ||
    !isFiniteNumber(s.pitch) ||
    !isFiniteNumber(s.roll) ||
    !isFiniteNumber(s.speed)
  ) {
    return false;
  }
  if (
    typeof s.fur !== "string" ||
    typeof s.accent !== "string" ||
    typeof s.name !== "string"
  ) {
    return false;
  }
  if (s.ghost !== undefined && typeof s.ghost !== "boolean") return false;
  return true;
}

/** Accept partial wire payloads — fill style/orientation defaults from peer id. */
export function normalizeSnap(
  snap: unknown,
  peerId: string,
): PlayerSnapshot | null {
  if (!snap || typeof snap !== "object") return null;
  const s = snap as Record<string, unknown>;
  if (!isFiniteNumber(s.x) || !isFiniteNumber(s.y) || !isFiniteNumber(s.z)) {
    return null;
  }
  const style = pickStyle(peerId);
  const normalized: PlayerSnapshot = {
    x: s.x,
    y: s.y,
    z: s.z,
    yaw: isFiniteNumber(s.yaw) ? s.yaw : 0,
    pitch: isFiniteNumber(s.pitch) ? s.pitch : 0,
    roll: isFiniteNumber(s.roll) ? s.roll : 0,
    speed: isFiniteNumber(s.speed) ? s.speed : 0,
    fur: typeof s.fur === "string" ? s.fur : style.fur,
    accent: typeof s.accent === "string" ? s.accent : style.accent,
    name: typeof s.name === "string" ? s.name : peerId.slice(0, 6),
    ghost: typeof s.ghost === "boolean" ? s.ghost : false,
  };
  return isValidSnap(normalized) ? normalized : null;
}

/**
 * Hello pose matching createPlayer() position + Player's YXZ euler broadcast.
 * Used before the local Player loop sends its first real snapshot.
 */
export function spawnSnapshot(): PlayerSnapshot {
  const style = pickStyle(selfId);
  const pos = spawnPosition();
  boardAxes(0, SPAWN_DIR, _spawnFwd, _spawnRight);
  _spawnLook.makeBasis(_spawnRight, SPAWN_DIR, _spawnFwd);
  _spawnQuat.setFromRotationMatrix(_spawnLook);
  _spawnEuler.setFromQuaternion(_spawnQuat, "YXZ");
  return {
    x: pos.x,
    y: pos.y,
    z: pos.z,
    yaw: _spawnEuler.y,
    pitch: _spawnEuler.x,
    roll: _spawnEuler.z,
    speed: 0,
    fur: style.fur,
    accent: style.accent,
    name: selfId.slice(0, 6),
    ghost: false,
  };
}

function safeSend(
  action: PupAction,
  snap: PlayerSnapshot,
  peerId?: string,
): void {
  const send = peerId
    ? action.send(snap, { target: peerId })
    : action.send(snap);
  void send.catch(() => {
    /* data channel may not be open yet */
  });
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
  // Burst presence while discovering peers so late joiners see us immediately.
  let ticks = 0;
  target.helloTimer = setInterval(() => {
    if (!session || session !== target) {
      stopHello(target);
      return;
    }
    // Once peers are present, Player's 20 Hz snapshots are enough.
    if (peerIdsFromRoom(session.room).length > 0) {
      stopHello(target);
      return;
    }
    if (session.lastSnap) safeSend(session.action, session.lastSnap);
    ticks += 1;
    // Fast for 8s, then slow heartbeat while still alone on the relay.
    if (ticks === 40 && target.helloTimer) {
      clearInterval(target.helloTimer);
      target.helloTimer = setInterval(() => {
        if (!session || session !== target || !session.lastSnap) return;
        if (peerIdsFromRoom(session.room).length === 0) {
          safeSend(session.action, session.lastSnap);
        } else {
          stopHello(target);
        }
      }, 2000);
    }
  }, 200);
}

function wireRoom(room: Room, action: PupAction): void {
  room.onPeerJoin = (peerId: string) => {
    introduceToPeer(action, peerId);
    if (session) stopHello(session);
    emit();
  };

  room.onPeerLeave = (peerId: string) => {
    removePeer(peerId);
    emit();
  };

  // Pose updates go to peerStore only — no React emit (roster/status via join/leave).
  action.onMessage = (snap, { peerId }) => {
    const normalized = normalizeSnap(snap, peerId);
    if (!normalized) return;
    upsertPeer(peerId, normalized);
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
    {
      onJoinError: (details) => {
        console.warn(`${APP_ID} join error:`, details.error);
        emit();
      },
    },
  );
  const action = room.makeAction<PlayerSnapshot>("pup");
  const snap = spawnSnapshot();
  session = {
    roomId,
    room,
    action,
    refs: 0,
    lastSnap: snap,
    leaveTimer: null,
    helloTimer: null,
  };
  wireRoom(room, action);
  // Announce spawn pose immediately so peers can see us on open
  safeSend(action, snap);
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

export function useMultiplayer(roomId: string, enabled = true): RoomApi {
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
      const count = getPeerCount();
      setPeerCount((prev) => (prev === count ? prev : count));
      const next = getStatus();
      setStatus((prev) => (prev === next.status ? prev : next.status));
      setStatusDetail((prev) => (prev === next.detail ? prev : next.detail));
    };

    sync();
    const unsub = subscribeSession(sync);
    // Slow safety poll — join/leave already emit; peerStore handles poses.
    const poll = window.setInterval(sync, 2000);

    return () => {
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

// Dev HMR reloads this module — leave the old Trystero room so peers can reconnect.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (!session) return;
    const target = session;
    session = null;
    stopHello(target);
    clearPeers();
    void target.room.leave().catch(() => {});
    emit();
  });
}
