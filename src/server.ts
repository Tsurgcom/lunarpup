import type { ServerWebSocket } from 'bun';
import {
    DEFAULT_ROOM,
    DEFAULT_WS_PORT,
    PLAYER_COLORS,
    parseClientMessage,
    type ClientMessage,
    type EncryptedEnvelope,
    type EncryptedPlayerSnapshot,
    type ServerMessage,
} from './net/protocol.ts';

/**
 * Dev-only multiplayer relay (Bun WebSocket). Like the Netlify functions, this
 * is a *blind relay*: it stores and forwards encrypted name/state/chat envelopes
 * without ever holding the room key, so it cannot read player names, positions,
 * or chat. It only assigns opaque player ids + colours and routes by room id.
 */
interface PlayerConnection {
    id: string;
    name: EncryptedEnvelope;
    color: number;
    room: string;
    ws: ServerWebSocket<PlayerConnection>;
    stateEnvelope: EncryptedEnvelope;
    seq: number;
}

interface Room {
    players: Map<string, PlayerConnection>;
    usedColors: Set<number>;
}

const rooms = new Map<string, Room>();

function getRoom(roomId: string): Room {
    let room = rooms.get(roomId);
    if (!room) {
        room = { players: new Map(), usedColors: new Set() };
        rooms.set(roomId, room);
    }
    return room;
}

function pickColor(room: Room): number {
    for (const color of PLAYER_COLORS) {
        if (!room.usedColors.has(color)) return color;
    }
    return PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]!;
}

function snapshotFrom(conn: PlayerConnection): EncryptedPlayerSnapshot {
    return { id: conn.id, color: conn.color, name: conn.name, state: conn.stateEnvelope, seq: conn.seq };
}

function send(ws: ServerWebSocket<PlayerConnection>, msg: ServerMessage) {
    ws.send(JSON.stringify(msg));
}

function broadcast(room: Room, msg: ServerMessage, exceptId?: string) {
    for (const [id, conn] of room.players) {
        if (id !== exceptId) send(conn.ws, msg);
    }
}

function removePlayer(conn: PlayerConnection) {
    const room = rooms.get(conn.room);
    if (!room) return;

    room.players.delete(conn.id);
    room.usedColors.delete(conn.color);
    broadcast(room, { type: 'player_left', id: conn.id });

    if (room.players.size === 0) {
        rooms.delete(conn.room);
    }
}

function handleJoin(ws: ServerWebSocket<PlayerConnection>, msg: Extract<ClientMessage, { type: 'join' }>) {
    const roomId = msg.room.trim() || DEFAULT_ROOM;
    const room = getRoom(roomId);
    const id = crypto.randomUUID();
    const color = pickColor(room);

    const conn: PlayerConnection = {
        id,
        name: msg.name,
        color,
        room: roomId,
        ws,
        stateEnvelope: msg.state,
        seq: msg.seq,
    };

    ws.data = conn;
    room.players.set(id, conn);
    room.usedColors.add(color);

    const existing = [...room.players.values()]
        .filter(p => p.id !== id)
        .map(snapshotFrom);

    send(ws, { type: 'welcome', id, color, room: roomId, players: existing });
    broadcast(room, { type: 'player_joined', player: snapshotFrom(conn) }, id);

    // Name is encrypted, so we log only the opaque id — server logs carry no
    // player names.
    console.log(`[+] player ${id} joined room "${roomId}" (${room.players.size} players)`);
}

function handleState(conn: PlayerConnection, msg: Extract<ClientMessage, { type: 'state' }>) {
    conn.stateEnvelope = msg.state;
    conn.seq = msg.seq;
    const room = rooms.get(conn.room);
    if (!room) return;
    broadcast(room, { type: 'state', id: conn.id, seq: msg.seq, state: msg.state }, conn.id);
}

function handleChat(conn: PlayerConnection, msg: Extract<ClientMessage, { type: 'chat' }>) {
    const room = rooms.get(conn.room);
    if (!room) return;
    broadcast(room, {
        type: 'chat',
        id: conn.id,
        ts: Date.now(),
        payload: msg.payload,
    });
}

const port = Number(process.env.PORT) || DEFAULT_WS_PORT;

const server = Bun.serve<PlayerConnection>({
    port,
    fetch(req, server) {
        if (server.upgrade(req)) return undefined;
        return new Response('Lunar Pup multiplayer relay (E2E encrypted)', {
            headers: { 'Content-Type': 'text/plain' },
        });
    },
    websocket: {
        open(ws) {
            ws.data = {
                id: '',
                name: { iv: '', data: '' },
                color: PLAYER_COLORS[0]!,
                room: '',
                ws,
                stateEnvelope: { iv: '', data: '' },
                seq: 0,
            };
        },
        message(ws, message) {
            const parsed = parseClientMessage(message);
            if (!parsed) return;

            if (parsed.type === 'join') {
                if (ws.data.id) return;
                handleJoin(ws, parsed);
                return;
            }

            if (!ws.data.id) return;

            if (parsed.type === 'state') {
                handleState(ws.data, parsed);
            } else if (parsed.type === 'chat') {
                handleChat(ws.data, parsed);
            }
        },
        close(ws) {
            if (!ws.data.id) return;
            console.log(`[-] player ${ws.data.id} left room "${ws.data.room}"`);
            removePlayer(ws.data);
        },
    },
});

console.log(`Lunar Pup multiplayer relay listening on ws://localhost:${server.port}`);
