export const DEFAULT_WS_PORT = 3001;
export const DEFAULT_ROOM = 'lunar-park';
export const STATE_SEND_INTERVAL_MS = 50;

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
}

export type ClientMessage =
    | { type: 'join'; room: string; name: string }
    | { type: 'state'; state: Omit<PlayerSnapshot, 'id' | 'name' | 'color'> };

export type ServerMessage =
    | { type: 'welcome'; id: string; color: number; room: string; players: PlayerSnapshot[] }
    | { type: 'player_joined'; player: PlayerSnapshot }
    | { type: 'player_left'; id: string }
    | { type: 'state'; id: string; state: Omit<PlayerSnapshot, 'id' | 'name' | 'color'> };

export function parseClientMessage(raw: string | Buffer): ClientMessage | null {
    try {
        const msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString()) as ClientMessage;
        if (!msg || typeof msg !== 'object' || !('type' in msg)) return null;
        return msg;
    } catch {
        return null;
    }
}

export function getWsUrl(port = DEFAULT_WS_PORT): string {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.hostname}:${port}`;
}

export function getMultiplayerConfig(): { enabled: boolean; room: string; name: string; wsUrl: string } {
    const params = new URLSearchParams(location.search);
    const enabled = params.has('multiplayer') || params.has('mp');
    const room = params.get('room')?.trim() || DEFAULT_ROOM;
    const name = params.get('name')?.trim() || `Pup${Math.floor(Math.random() * 900 + 100)}`;
    const wsUrl = params.get('ws')?.trim() || getWsUrl();
    return { enabled, room, name, wsUrl };
}
