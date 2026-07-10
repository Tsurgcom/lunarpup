import type { ServerWebSocket } from 'bun';
import {
    DEFAULT_ROOM,
    PLAYER_COLORS,
    parseClientMessage,
    type ClientMessage,
    type EncryptedEnvelope,
    type EncryptedPlayerSnapshot,
    type ServerMessage,
} from '../net/protocol.ts';
import type { ModularRouter } from './router.ts';

export interface PlayerConnection {
    connectionId: string;
    id: string;
    name: EncryptedEnvelope;
    color: number;
    room: string;
    ws: ServerWebSocket<PlayerConnection>;
    stateEnvelope: EncryptedEnvelope;
    seq: number;
    lastStateAt: number;
    lastChatAt: number;
}

export interface Room {
    players: Map<string, PlayerConnection>;
    usedColors: Set<number>;
    gamemodeId: string;
}

const rooms = new Map<string, Room>();
const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 50;
const MAX_PLAYERS_PER_ROOM = Number(process.env.MAX_PLAYERS_PER_ROOM) || 16;
const MIN_STATE_INTERVAL_MS = Number(process.env.MIN_STATE_INTERVAL_MS) || 20;
const MIN_CHAT_INTERVAL_MS = 1000;

const EMPTY_ENVELOPE: EncryptedEnvelope = { iv: '', data: '' };

export function ensureRoom(roomId: string, gamemodeId = 'free-skate'): Room {
    let room = rooms.get(roomId);
    if (!room) {
        if (rooms.size >= MAX_ROOMS) throw new Error('Room capacity exceeded');
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

function snapshotFrom(connection: PlayerConnection): EncryptedPlayerSnapshot {
    return {
        id: connection.id,
        color: connection.color,
        name: connection.name,
        state: connection.stateEnvelope,
        seq: connection.seq,
    };
}

function send(ws: ServerWebSocket<PlayerConnection>, message: ServerMessage): void {
    ws.send(JSON.stringify(message));
}

function broadcast(room: Room, message: ServerMessage, exceptId?: string): void {
    for (const [id, connection] of room.players) {
        if (id !== exceptId) send(connection.ws, message);
    }
}

export function createInitialConnection(ws: ServerWebSocket<PlayerConnection>): PlayerConnection {
    return {
        connectionId: crypto.randomUUID(),
        id: '',
        name: EMPTY_ENVELOPE,
        color: PLAYER_COLORS[0],
        room: '',
        ws,
        stateEnvelope: EMPTY_ENVELOPE,
        seq: 0,
        lastStateAt: 0,
        lastChatAt: 0,
    };
}

export function removePlayer(connection: PlayerConnection): void {
    const room = rooms.get(connection.room);
    if (!room) return;
    room.players.delete(connection.id);
    room.usedColors.delete(connection.color);
    broadcast(room, { type: 'player_left', id: connection.id });
    if (room.players.size === 0) rooms.delete(connection.room);
}

function handleJoin(ws: ServerWebSocket<PlayerConnection>, message: Extract<ClientMessage, { type: 'join' }>): void {
    const roomId = message.room.trim() || DEFAULT_ROOM;
    let room: Room;
    try {
        room = ensureRoom(roomId);
    } catch {
        ws.close(1013, 'Room capacity exceeded');
        return;
    }
    if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
        ws.close(1013, 'Room full');
        return;
    }

    const id = crypto.randomUUID();
    const color = pickColor(room);
    const connection: PlayerConnection = {
        connectionId: ws.data.connectionId,
        id,
        name: message.name,
        color,
        room: roomId,
        ws,
        stateEnvelope: message.state,
        seq: message.seq,
        lastStateAt: 0,
        lastChatAt: 0,
    };
    ws.data = connection;
    room.players.set(id, connection);
    room.usedColors.add(color);

    const existing = [...room.players.values()]
        .filter((player) => player.id !== id)
        .map(snapshotFrom);
    send(ws, { type: 'welcome', id, color, room: roomId, players: existing });
    broadcast(room, { type: 'player_joined', player: snapshotFrom(connection) }, id);
    console.log(`[+] player ${id} joined encrypted room "${roomId}" (${room.players.size} players)`);
}

function handleState(connection: PlayerConnection, message: Extract<ClientMessage, { type: 'state' }>): void {
    const now = Date.now();
    if (now - connection.lastStateAt < MIN_STATE_INTERVAL_MS || message.seq <= connection.seq) return;
    connection.lastStateAt = now;
    connection.seq = message.seq;
    connection.stateEnvelope = message.state;
    const room = rooms.get(connection.room);
    if (room) broadcast(room, { type: 'state', id: connection.id, seq: message.seq, state: message.state }, connection.id);
}

function handleChat(connection: PlayerConnection, message: Extract<ClientMessage, { type: 'chat' }>): void {
    const now = Date.now();
    if (now - connection.lastChatAt < MIN_CHAT_INTERVAL_MS) return;
    connection.lastChatAt = now;
    const room = rooms.get(connection.room);
    if (room) broadcast(room, { type: 'chat', id: connection.id, ts: now, payload: message.payload });
}

/** Kept as a pure compatibility gate for server tests; encrypted relay chat uses timing only. */
export function shouldDropChat(recent: { text: string; ts: number } | undefined, text: string, now: number): boolean {
    if (!recent) return false;
    return now - recent.ts < MIN_CHAT_INTERVAL_MS || (recent.text === text && now - recent.ts < 3000);
}

export function registerMultiplayerModule(router: ModularRouter<PlayerConnection>): void {
    router.registerHttp('GET', '/', () => new Response('Lunar Pup multiplayer relay (E2E encrypted)', {
        headers: { 'Content-Type': 'text/plain' },
    }));

    router.registerWebSocket('multiplayer', (ws, payload) => {
        const parsed = typeof payload === 'string' || payload instanceof Buffer
            ? parseClientMessage(payload)
            : parseClientMessage(JSON.stringify(payload));
        if (!parsed) return;
        if (parsed.type === 'join') {
            if (!ws.data.id) handleJoin(ws, parsed);
            return;
        }
        if (!ws.data.id) return;
        if (parsed.type === 'state') handleState(ws.data, parsed);
        else if (parsed.type === 'chat') handleChat(ws.data, parsed);
        else if (parsed.type === 'leave') removePlayer(ws.data);
    });
}

export function getRoomSummaries(): Array<{ roomId: string; gamemodeId: string; playerCount: number }> {
    return [...rooms.entries()].map(([roomId, room]) => ({
        roomId,
        gamemodeId: room.gamemodeId,
        playerCount: room.players.size,
    }));
}
