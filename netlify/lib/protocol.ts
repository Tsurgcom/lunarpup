export const DEFAULT_ROOM = 'lunar-park';

export const PLAYER_COLORS = [
    0xffb703,
    0x4cc9f0,
    0xf72585,
    0x80ff72,
    0xb5179e,
    0xff6b35,
    0x48cae4,
    0xe9c46a,
] as const;

/**
 * Opaque encrypted payload. The relay stores and forwards these verbatim; it
 * never has the key to open them. Both fields are base64url strings produced
 * client-side with AES-GCM.
 */
export interface EncryptedEnvelope {
    iv: string;
    data: string;
}

/** A player as stored/forwarded by the relay. `name` and `state` are encrypted
 *  envelopes; `id`, `color` and `seq` stay plaintext for routing, colour
 *  coordination, and change-detection. */
export interface EncryptedPlayerSnapshot {
    id: string;
    color: number;
    name: EncryptedEnvelope;
    state: EncryptedEnvelope;
    seq: number;
}

export interface ChatMessage {
    id: string;
    /** Encrypted `{ name, text }` payload — the relay cannot read it. */
    payload: EncryptedEnvelope;
    ts: number;
}

export type ClientMessage =
    | { type: 'join'; room: string; name: EncryptedEnvelope; state: EncryptedEnvelope; seq: number }
    | { type: 'state'; room: string; id?: string; seq: number; state: EncryptedEnvelope }
    | { type: 'leave'; room: string; id?: string }
    | { type: 'chat'; room: string; id?: string; payload: EncryptedEnvelope };

export type ServerMessage =
    | { type: 'welcome'; id: string; color: number; room: string; players: EncryptedPlayerSnapshot[] }
    | { type: 'player_joined'; player: EncryptedPlayerSnapshot }
    | { type: 'player_left'; id: string }
    | { type: 'state'; id: string; seq: number; state: EncryptedEnvelope }
    | { type: 'chat'; id: string; ts: number; payload: EncryptedEnvelope };
