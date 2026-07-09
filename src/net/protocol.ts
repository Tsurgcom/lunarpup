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

export function parseClientMessage(raw: string | Buffer): ClientMessage | null {
    try {
        const msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString()) as ClientMessage;
        if (!msg || typeof msg !== 'object' || !('type' in msg)) return null;
        return msg;
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
