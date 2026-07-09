import type { ServerWebSocket } from 'bun';
import {
    DEFAULT_ROOM,
    PLAYER_COLORS,
    parseClientMessage,
    type ClientMessage,
    type PlayerSnapshot,
    type ServerMessage,
} from '../net/protocol.ts';
import type { ModularRouter } from './router.ts';

export interface PlayerConnection {
    id: string;
    name: string;
    color: number;
    room: string;
    ws: ServerWebSocket<PlayerConnection>;
    state: Omit<PlayerSnapshot, 'id' | 'name' | 'color'>;
    lastChat?: { text: string; ts: number };
}

export interface Room {
    players: Map<string, PlayerConnection>;
    usedColors: Set<number>;
    gamemodeId: string;
}

const rooms = new Map<string, Room>();

export function ensureRoom(roomId: string, gamemodeId = 'free-skate'): Room {
    let room = rooms.get(roomId);
    if (!room) {
        room = { players: new Map(), usedColors: new Set(), gamemodeId };
        rooms.set(roomId, room);
    } else if (gamemodeId) {
        room.gamemodeId = gamemodeId;
    }
    return room;
}

function pickColor(room: Room): number {
    for (const color of PLAYER_COLORS) {
        if (!room.usedColors.has(color)) return color;
    }
    return PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)] ?? PLAYER_COLORS[0];
}

function snapshotFrom(conn: PlayerConnection): PlayerSnapshot {
    return { id: conn.id, name: conn.name, color: conn.color, ...conn.state };
}

export function defaultPlayerState(): Omit<PlayerSnapshot, 'id' | 'name' | 'color'> {
    return {
        x: 0, y: 0, z: 0,
        qx: 0, qy: 0, qz: 0, qw: 1,
        heading: 0, speed: 0, isGrounded: true,
        boardTiltX: 0, boardTiltZ: 0,
    };
}

function send(ws: ServerWebSocket<PlayerConnection>, msg: ServerMessage): void {
    ws.send(JSON.stringify(msg));
}

function broadcast(room: Room, msg: ServerMessage, exceptId?: string): void {
    for (const [id, conn] of room.players) {
        if (id !== exceptId) send(conn.ws, msg);
    }
}

export function createInitialConnection(ws: ServerWebSocket<PlayerConnection>): PlayerConnection {
    return {
        id: '',
        name: '',
        color: PLAYER_COLORS[0],
        room: '',
        ws,
        state: defaultPlayerState(),
    };
}

export function removePlayer(conn: PlayerConnection): void {
    const room = rooms.get(conn.room);
    if (!room) return;
    room.players.delete(conn.id);
    room.usedColors.delete(conn.color);
    broadcast(room, { type: 'player_left', id: conn.id });
    if (room.players.size === 0) rooms.delete(conn.room);
}

function handleJoin(ws: ServerWebSocket<PlayerConnection>, msg: Extract<ClientMessage, { type: 'join' }>): void {
    const roomId = msg.room.trim() || DEFAULT_ROOM;
    const room = ensureRoom(roomId);
    const id = crypto.randomUUID();
    const color = pickColor(room);
    const name = msg.name.trim().slice(0, 24) || `Pup${Math.floor(Math.random() * 900 + 100)}`;
    const conn: PlayerConnection = { id, name, color, room: roomId, ws, state: defaultPlayerState() };
    ws.data = conn;
    room.players.set(id, conn);
    room.usedColors.add(color);
    const existing = [...room.players.values()].filter(player => player.id !== id).map(snapshotFrom);
    send(ws, { type: 'welcome', id, color, room: roomId, players: existing });
    broadcast(room, { type: 'player_joined', player: snapshotFrom(conn) }, id);
    console.log(`[+] ${name} joined room "${roomId}" (${room.players.size} players, gamemode ${room.gamemodeId})`);
}

function handleState(conn: PlayerConnection, msg: Extract<ClientMessage, { type: 'state' }>): void {
    conn.state = msg.state;
    const room = rooms.get(conn.room);
    if (!room) return;
    broadcast(room, { type: 'state', id: conn.id, state: msg.state }, conn.id);
}

function handleChat(conn: PlayerConnection, msg: Extract<ClientMessage, { type: 'chat' }>): void {
    const text = msg.text.trim().slice(0, 200);
    if (!text) return;
    const room = rooms.get(conn.room);
    if (!room) return;

    const now = Date.now();
    const recent = conn.lastChat;
    if (recent && now - recent.ts < 1000) return;
    if (recent && recent.text === text && now - recent.ts < 3000) return;
    conn.lastChat = { text, ts: now };

    broadcast(room, {
        type: 'chat',
        id: conn.id,
        name: conn.name,
        text,
        ts: now,
    });
}

export function registerMultiplayerModule(router: ModularRouter<PlayerConnection>): void {
    router.registerHttp('GET', '/', () => new Response('Lunar Pup multiplayer WebSocket server', {
        headers: { 'Content-Type': 'text/plain' },
    }));

    router.registerWebSocket('multiplayer', (ws, payload) => {
        const parsed = typeof payload === 'string' || payload instanceof Buffer ? parseClientMessage(payload) : parseClientMessage(JSON.stringify(payload));
        if (!parsed) return;
        if (parsed.type === 'join') {
            if (ws.data.id) return;
            handleJoin(ws, parsed);
            return;
        }
        if (!ws.data.id) return;
        if (parsed.type === 'state') handleState(ws.data, parsed);
        else if (parsed.type === 'chat') handleChat(ws.data, parsed);
    });
}

export function getRoomSummaries(): Array<{ roomId: string; gamemodeId: string; playerCount: number }> {
    return [...rooms.entries()].map(([roomId, room]) => ({ roomId, gamemodeId: room.gamemodeId, playerCount: room.players.size }));
}
