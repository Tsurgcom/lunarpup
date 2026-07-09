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

export interface ChatMessage {
    id: string;
    name: string;
    text: string;
    ts: number;
}

export type ClientMessage =
    | { type: 'join'; room: string; name: string }
    | { type: 'state'; room: string; id?: string; state: Omit<PlayerSnapshot, 'id' | 'name' | 'color'> }
    | { type: 'leave'; room: string; id?: string }
    | { type: 'chat'; room: string; id?: string; text: string };

export type ServerMessage =
    | { type: 'welcome'; id: string; color: number; room: string; players: PlayerSnapshot[] }
    | { type: 'player_joined'; player: PlayerSnapshot }
    | { type: 'player_left'; id: string }
    | { type: 'state'; id: string; state: Omit<PlayerSnapshot, 'id' | 'name' | 'color'> }
    | { type: 'chat'; id: string; name: string; text: string; ts: number };
