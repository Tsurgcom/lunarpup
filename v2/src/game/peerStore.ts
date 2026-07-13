import type { PlayerSnapshot } from "./types";

type RosterListener = () => void;

const peers = new Map<string, PlayerSnapshot>();
const rosterListeners = new Set<RosterListener>();
let rosterRevision = 0;
let cachedIds: string[] = [];

function emitRoster(): void {
  rosterRevision += 1;
  cachedIds = [...peers.keys()];
  for (const listener of rosterListeners) listener();
}

/** High-frequency pose updates — no React notify. */
export function upsertPeer(peerId: string, snap: PlayerSnapshot): void {
  const isNew = !peers.has(peerId);
  peers.set(peerId, snap);
  if (isNew) emitRoster();
}

export function removePeer(peerId: string): void {
  if (!peers.delete(peerId)) return;
  emitRoster();
}

export function clearPeers(): void {
  if (peers.size === 0) return;
  peers.clear();
  emitRoster();
}

export function getPeer(peerId: string): PlayerSnapshot | undefined {
  return peers.get(peerId);
}

export function getPeerIds(): string[] {
  return cachedIds;
}

export function getRosterRevision(): number {
  return rosterRevision;
}

export function subscribeRoster(listener: RosterListener): () => void {
  rosterListeners.add(listener);
  return () => {
    rosterListeners.delete(listener);
  };
}
