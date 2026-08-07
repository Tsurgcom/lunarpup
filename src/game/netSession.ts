import type { DataPayload, MessageAction, Room } from "@trystero-p2p/core";
import { joinRoom } from "@trystero-p2p/nostr";

export const APP_ID = "lunarpup-moon-bowl-v1";

/** Small, fast Nostr relay set — full default list is slow to dial. */
export const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://yabu.me/v2",
  "wss://nostr.data.haus",
  "wss://relay.mostr.pub",
  "wss://purplerelay.com",
];

export type SessionListener = () => void;

export function peerIdsFromRoom(room: Room): string[] {
  return Object.keys(room.getPeers());
}

export function joinTrysteroRoom(
  roomId: string,
  onJoinError?: (details: { error: unknown }) => void,
): Room {
  return joinRoom(
    {
      appId: APP_ID,
      relayConfig: { urls: RELAYS, redundancy: 4 },
    },
    roomId,
    {
      onJoinError: (details) => {
        console.warn(`${APP_ID} join error:`, details.error);
        onJoinError?.(details);
      },
    },
  );
}

export function safeSend<T extends DataPayload>(
  action: MessageAction<T>,
  payload: T,
  peerId?: string,
): void {
  const send = peerId
    ? action.send(payload, { target: peerId })
    : action.send(payload);
  void send.catch(() => {
    /* data channel may not be open yet */
  });
}

/** Data channel can lag handshake — retry a few times. */
export function introduceWithRetry(push: () => void): void {
  push();
  window.setTimeout(push, 50);
  window.setTimeout(push, 200);
  window.setTimeout(push, 600);
  window.setTimeout(push, 1500);
}

export function createEmitter() {
  const listeners = new Set<SessionListener>();
  return {
    emit(): void {
      for (const listener of listeners) listener();
    },
    subscribe(listener: SessionListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
