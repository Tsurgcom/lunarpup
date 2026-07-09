import { generateRoomKey, deriveRoomId } from './crypto.ts';
import type { EncryptedEnvelope } from './crypto.ts';

export type { EncryptedEnvelope } from './crypto.ts';

export const DEFAULT_WS_PORT = 3001;
export const DEFAULT_ROOM = 'lunar-park';
export const STATE_SEND_INTERVAL_MS = 50;
export const CONNECT_TIMEOUT_MS = 5000;

export const PLAYER_COLORS = [
    0xffb703, // gold (local default)
    0x4cc9f0, // cyan
    0xf72585, // pink
    0x80ff72, // green
    0xb5179e, // purple
    0xff6b35, // orange
    0x48cae4, // sky
    0xe9c46a, // sand
] as const;

/** Plaintext player snapshot — only ever held in memory on a client, after
 *  decrypting an {@link EncryptedPlayerSnapshot} from the wire. */
export interface PlayerSnapshot {
    id: string;
    name: string;
    color: number;
    x: number;
    y: number;
    z: number;
    qx: number;
    qy: number;
    qz: number;
    qw: number;
    heading: number;
    speed: number;
    isGrounded: boolean;
    boardTiltX: number;
    boardTiltZ: number;
}

export type MultiplayerTransport = 'ws' | 'http';

export interface ChatMessage {
    id: string;
    name: string;
    text: string;
    ts: number;
}

/** A player as it appears on the wire / in server storage: name and state are
 *  encrypted envelopes the relay cannot read. `id`, `color` and `seq` stay
 *  plaintext (routing / colour coordination / change-detection). */
export interface EncryptedPlayerSnapshot {
    id: string;
    color: number;
    name: EncryptedEnvelope;
    state: EncryptedEnvelope;
    seq: number;
}

export type ClientMessage =
    | { type: 'join'; room: string; name: EncryptedEnvelope; state: EncryptedEnvelope; seq: number }
    | { type: 'state'; room?: string; id?: string; seq: number; state: EncryptedEnvelope }
    | { type: 'leave'; room?: string; id?: string }
    | { type: 'chat'; room?: string; id?: string; payload: EncryptedEnvelope };

export type ServerMessage =
    | { type: 'welcome'; id: string; color: number; room: string; players: EncryptedPlayerSnapshot[] }
    | { type: 'player_joined'; player: EncryptedPlayerSnapshot }
    | { type: 'player_left'; id: string }
    | { type: 'state'; id: string; seq: number; state: EncryptedEnvelope }
    | { type: 'chat'; id: string; ts: number; payload: EncryptedEnvelope };

type ClientState = Extract<ClientMessage, { type: 'state' }>['state'];

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === 'string';
}

function isClientState(value: unknown): value is ClientState {
    if (!isRecord(value)) return false;

    const numericFields: Array<keyof Omit<ClientState, 'isGrounded'>> = [
        'x', 'y', 'z', 'qx', 'qy', 'qz', 'qw',
        'heading', 'speed', 'boardTiltX', 'boardTiltZ',
    ];

    return numericFields.every((field) => Number.isFinite(value[field]))
        && typeof value.isGrounded === 'boolean';
}

export function parseClientMessage(raw: string | Buffer): ClientMessage | null {
    try {
        const msg: unknown = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
        if (!isRecord(msg)) return null;

        switch (msg.type) {
            case 'join':
                return typeof msg.room === 'string' && typeof msg.name === 'string'
                    ? { type: 'join', room: msg.room, name: msg.name }
                    : null;
            case 'state':
                return isOptionalString(msg.room) && isOptionalString(msg.id) && isClientState(msg.state)
                    ? { type: 'state', room: msg.room, id: msg.id, state: msg.state }
                    : null;
            case 'leave':
                return isOptionalString(msg.room) && isOptionalString(msg.id)
                    ? { type: 'leave', room: msg.room, id: msg.id }
                    : null;
            case 'chat':
                return isOptionalString(msg.room) && isOptionalString(msg.id) && typeof msg.text === 'string'
                    ? { type: 'chat', room: msg.room, id: msg.id, text: msg.text }
                    : null;
            default:
                return null;
        }
    } catch {
        return null;
    }
}

export function isLocalDevHost(): boolean {
    const host = location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

/** Resolves WebSocket URL from ?ws= or localhost dev default; null when using HTTP transport. */
export function getWsUrl(port = DEFAULT_WS_PORT): string | null {
    const params = new URLSearchParams(location.search);
    const explicit = params.get('ws')?.trim();
    if (explicit) return explicit;

    if (isLocalDevHost()) {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${proto}//${location.hostname}:${port}`;
    }

    return null;
}

export function getMultiplayerTransport(): MultiplayerTransport {
    const params = new URLSearchParams(location.search);
    if (params.get('ws')?.trim()) return 'ws';
    if (isLocalDevHost()) return 'ws';
    return 'http';
}

export interface MultiplayerConfig {
    enabled: boolean;
    /** Cosmetic display label (from ?room=). Not used for routing. */
    roomName: string;
    /** Server-side routing id, derived from the room key. The server sees only this. */
    roomId: string;
    /** E2E room key (base64url). Lives in the URL fragment; never sent to the server. */
    roomKey: string;
    name: string;
    transport: MultiplayerTransport;
    wsUrl: string | null;
    apiBase: string;
}

/**
 * Resolve multiplayer config. The room key is read from the URL *fragment*
 * (`#k=…`); if absent a fresh key is generated and written back to the fragment
 * so the current URL is immediately shareable as an invite. The server-side
 * routing room id is derived (SHA-256) from the key so the server can route
 * players that share a key without ever learning the key.
 */
export async function getMultiplayerConfig(): Promise<MultiplayerConfig> {
    const params = new URLSearchParams(location.search);
    const enabled = params.has('multiplayer') || params.has('mp');
    const roomName = params.get('room')?.trim() || DEFAULT_ROOM;
    const name = (params.get('name')?.trim() || `Pup${Math.floor(Math.random() * 900 + 100)}`).slice(0, 24);
    const transport = getMultiplayerTransport();
    const wsUrl = transport === 'ws' ? getWsUrl() : null;
    const apiBase = params.get('api')?.trim() || '/api/mp';

    // Room key: URL fragment is never transmitted to the server.
    let roomKey = readFragmentKey();
    if (!roomKey) {
        roomKey = generateRoomKey();
        writeFragmentKey(roomKey);
    }
    const roomId = await deriveRoomId(roomKey);

    return { enabled, roomName, roomId, roomKey, name, transport, wsUrl, apiBase };
}

function readFragmentKey(): string | null {
    const hash = location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    return params.get('k')?.trim() || null;
}

function writeFragmentKey(key: string) {
    const hash = location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    params.set('k', key);
    // Replace state so we don't spam the browser history.
    history.replaceState(null, '', `#${params.toString()}`);
}
