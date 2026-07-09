import type { EquippedCosmetics } from '../cosmetics/registry.ts';

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
    cosmetics?: EquippedCosmetics;
}

export type MultiplayerTransport = 'ws' | 'http';

export interface ChatMessage {
    id: string;
    name: string;
    text: string;
    ts: number;
}

export type ClientMessage =
    | { type: 'join'; room: string; name: string }
    | { type: 'state'; room?: string; id?: string; state: Omit<PlayerSnapshot, 'id' | 'name' | 'color'> }
    | { type: 'leave'; room?: string; id?: string }
    | { type: 'chat'; room?: string; id?: string; text: string };

export type ServerMessage =
    | { type: 'welcome'; id: string; color: number; room: string; players: PlayerSnapshot[] }
    | { type: 'player_joined'; player: PlayerSnapshot }
    | { type: 'player_left'; id: string }
    | { type: 'state'; id: string; state: Omit<PlayerSnapshot, 'id' | 'name' | 'color'> }
    | { type: 'chat'; id: string; name: string; text: string; ts: number };

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

/**
 * HTTP base URL for the game API server (rooms, cosmetics, lootbox, agent events).
 * Derived from the WebSocket server host (so `?ws=` overrides both), mapped to
 * http(s). Empty string means same-origin — for deployments that proxy the API.
 */
export function getApiBaseUrl(port = DEFAULT_WS_PORT): string {
    const ws = getWsUrl(port);
    if (ws) {
        const url = new URL(ws);
        url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
        url.pathname = '';
        url.search = '';
        return url.href.replace(/\/+$/, '');
    }

    return '';
}

export function getMultiplayerTransport(): MultiplayerTransport {
    const params = new URLSearchParams(location.search);
    if (params.get('ws')?.trim()) return 'ws';
    if (isLocalDevHost()) return 'ws';
    return 'http';
}

export function getMultiplayerConfig(): {
    enabled: boolean;
    room: string;
    name: string;
    transport: MultiplayerTransport;
    wsUrl: string | null;
    apiBase: string;
} {
    const params = new URLSearchParams(location.search);
    const enabled = params.has('multiplayer') || params.has('mp');
    const room = params.get('room')?.trim() || DEFAULT_ROOM;
    const name = params.get('name')?.trim() || `Pup${Math.floor(Math.random() * 900 + 100)}`;
    const transport = getMultiplayerTransport();
    const wsUrl = transport === 'ws' ? getWsUrl() : null;
    const apiBase = params.get('api')?.trim() || '/api/mp';
    return { enabled, room, name, transport, wsUrl, apiBase };
}
