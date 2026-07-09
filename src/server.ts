import type { ServerWebSocket } from 'bun';
import {
    DEFAULT_ROOM,
    DEFAULT_WS_PORT,
    PLAYER_COLORS,
    parseClientMessage,
    type ClientMessage,
    type PlayerSnapshot,
    type ServerMessage,
} from './net/protocol.ts';

interface PlayerConnection {
    id: string;
    name: string;
    color: number;
    room: string;
    ws: ServerWebSocket<PlayerConnection>;
    state: Omit<PlayerSnapshot, 'id' | 'name' | 'color'>;
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

function snapshotFrom(conn: PlayerConnection): PlayerSnapshot {
    return { id: conn.id, name: conn.name, color: conn.color, ...conn.state };
}

function defaultState(): Omit<PlayerSnapshot, 'id' | 'name' | 'color'> {
    return {
        x: 0, y: 0, z: 0,
        qx: 0, qy: 0, qz: 0, qw: 1,
        heading: 0, speed: 0, isGrounded: true,
        boardTiltX: 0, boardTiltZ: 0,
    };
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
    const name = msg.name.trim().slice(0, 24) || `Pup${Math.floor(Math.random() * 900 + 100)}`;

    const conn: PlayerConnection = {
        id,
        name,
        color,
        room: roomId,
        ws,
        state: defaultState(),
    };

    ws.data = conn;
    room.players.set(id, conn);
    room.usedColors.add(color);

    const existing = [...room.players.values()]
        .filter(p => p.id !== id)
        .map(snapshotFrom);

    send(ws, { type: 'welcome', id, color, room: roomId, players: existing });
    broadcast(room, { type: 'player_joined', player: snapshotFrom(conn) }, id);

    console.log(`[+] ${name} joined room "${roomId}" (${room.players.size} players)`);
}

function handleState(conn: PlayerConnection, msg: Extract<ClientMessage, { type: 'state' }>) {
    conn.state = msg.state;
    const room = rooms.get(conn.room);
    if (!room) return;
    broadcast(room, { type: 'state', id: conn.id, state: msg.state }, conn.id);
}

const port = Number(process.env.PORT) || DEFAULT_WS_PORT;

const server = Bun.serve<PlayerConnection>({
    port,
    fetch(req, server) {
        if (server.upgrade(req)) return undefined;
        return new Response('Lunar Pup multiplayer WebSocket server', {
            headers: { 'Content-Type': 'text/plain' },
        });
    },
    websocket: {
        open(ws) {
            ws.data = {
                id: '',
                name: '',
                color: PLAYER_COLORS[0],
                room: '',
                ws,
                state: defaultState(),
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
            }
        },
        close(ws) {
            if (!ws.data.id) return;
            console.log(`[-] ${ws.data.name} left room "${ws.data.room}"`);
            removePlayer(ws.data);
        },
    },
});

console.log(`Lunar Pup multiplayer server listening on ws://localhost:${server.port}`);
