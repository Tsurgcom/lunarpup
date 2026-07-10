import type { ServerWebSocket } from 'bun';
import {
    validateRoomClientMessage,
    type RoomClientMessage,
    type RoomServerMessage,
    type RoomStateBroadcast,
    type RoomSummary,
} from '../contracts/roomProtocol.ts';
import { getRoomSummaries, type PlayerConnection } from './multiplayer.ts';
import type { ModularRouter } from './router.ts';

interface LobbyRoom {
    roomId: string;
    gamemodeId: string;
    hostId: string;
    members: Map<string, ServerWebSocket<PlayerConnection>>;
}

const lobbyRooms = new Map<string, LobbyRoom>();
const memberRoomByPlayerId = new Map<string, string>();

function parsePayload(payload: unknown): unknown {
    if (typeof payload === 'string' || payload instanceof Buffer) {
        try { return JSON.parse(String(payload)); } catch { return null; }
    }
    return payload;
}

function send(ws: ServerWebSocket<PlayerConnection>, message: RoomServerMessage): void {
    ws.send(JSON.stringify(message));
}

function roomState(room: LobbyRoom): RoomStateBroadcast {
    return {
        type: 'room_state',
        roomId: room.roomId,
        gamemodeId: room.gamemodeId,
        players: [...room.members.keys()],
    };
}

function broadcast(room: LobbyRoom, message: RoomServerMessage): void {
    for (const ws of room.members.values()) send(ws, message);
}

function summaries(): RoomSummary[] {
    const byId = new Map<string, RoomSummary>();
    for (const summary of getRoomSummaries()) byId.set(summary.roomId, summary);
    for (const room of lobbyRooms.values()) {
        const existing = byId.get(room.roomId);
        byId.set(room.roomId, {
            roomId: room.roomId,
            gamemodeId: room.gamemodeId,
            playerCount: Math.max(existing?.playerCount ?? 0, room.members.size),
        });
    }
    return [...byId.values()].sort((a, b) => a.roomId.localeCompare(b.roomId));
}

function getLobbyRoom(roomId: string, gamemodeId = 'free-skate', hostId = ''): LobbyRoom {
    let room = lobbyRooms.get(roomId);
    if (!room) {
        room = { roomId, gamemodeId, hostId, members: new Map() };
        lobbyRooms.set(roomId, room);
    }
    return room;
}

function leaveCurrentRoom(playerId: string): LobbyRoom | null {
    const currentRoomId = memberRoomByPlayerId.get(playerId);
    if (!currentRoomId) return null;
    const room = lobbyRooms.get(currentRoomId);
    memberRoomByPlayerId.delete(playerId);
    if (!room) return null;
    room.members.delete(playerId);
    if (room.hostId === playerId) room.hostId = room.members.keys().next().value ?? '';
    return room;
}

function joinRoom(ws: ServerWebSocket<PlayerConnection>, room: LobbyRoom, playerId: string): void {
    const previous = leaveCurrentRoom(playerId);
    if (previous) {
        broadcast(previous, roomState(previous));
        if (previous.members.size === 0) lobbyRooms.delete(previous.roomId);
    }
    room.members.set(playerId, ws);
    memberRoomByPlayerId.set(playerId, room.roomId);
    if (!room.hostId) room.hostId = playerId;
    broadcast(room, roomState(room));
}

function handleRoomMessage(ws: ServerWebSocket<PlayerConnection>, message: RoomClientMessage): void {
    if (message.type === 'list_rooms') {
        send(ws, { type: 'room_list', rooms: summaries() });
        return;
    }

    const roomId = message.roomId.trim();
    const playerId = ws.data.connectionId;
    if (!roomId || !playerId) return;

    if (message.type === 'create_room') {
        const gamemodeId = message.gamemodeId.trim() || 'free-skate';
        const room = getLobbyRoom(roomId, gamemodeId, playerId);
        room.gamemodeId = gamemodeId;
        room.hostId = playerId;
        joinRoom(ws, room, playerId);
        return;
    }

    const room = getLobbyRoom(roomId);
    if (message.type === 'join_room') {
        joinRoom(ws, room, playerId);
        return;
    }

    if (message.type === 'leave_room') {
        const previous = leaveCurrentRoom(playerId);
        if (previous) {
            broadcast(previous, roomState(previous));
            if (previous.members.size === 0) lobbyRooms.delete(previous.roomId);
        }
        send(ws, { type: 'room_list', rooms: summaries() });
        return;
    }

    if (message.type === 'start_gamemode') {
        if (!room.members.has(playerId) || room.hostId !== playerId) return;
        broadcast(room, {
            type: 'start_gamemode',
            roomId: room.roomId,
            gamemodeId: room.gamemodeId,
            hostId: playerId,
        });
    }
}

export function removeRoomMembershipsForConnection(connection: PlayerConnection): void {
    const playerId = connection.connectionId;
    if (!playerId) return;
    const roomId = memberRoomByPlayerId.get(playerId);
    if (!roomId) return;
    const room = lobbyRooms.get(roomId);
    if (!room || room.members.get(playerId) !== connection.ws) return;

    memberRoomByPlayerId.delete(playerId);
    room.members.delete(playerId);
    if (room.hostId === playerId) room.hostId = room.members.keys().next().value ?? '';
    if (room.members.size === 0) {
        lobbyRooms.delete(room.roomId);
        return;
    }
    broadcast(room, roomState(room));
}

export function registerRoomsModule(router: ModularRouter<PlayerConnection>): void {
    router.registerHttp('GET', '/rooms', () => Response.json({ rooms: summaries() }));

    router.registerWebSocket('room', (ws, payload) => {
        const parsed = validateRoomClientMessage(parsePayload(payload));
        if (!parsed.ok) return;
        handleRoomMessage(ws, parsed.value);
    });
}

export function resetRoomsForTests(): void {
    lobbyRooms.clear();
    memberRoomByPlayerId.clear();
}
