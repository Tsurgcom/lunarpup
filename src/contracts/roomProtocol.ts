import { fail, isRecord, ok, readArray, readEnum, readNumber, readString, type ValidationResult, type Validator } from './validators.ts';

export const roomClientMessageTypes = ['create_room', 'join_room', 'leave_room', 'list_rooms'] as const;
export type RoomClientMessageType = (typeof roomClientMessageTypes)[number];

export interface CreateRoomMessage { type: 'create_room'; roomId: string; gamemodeId: string; playerId: string }
export interface JoinRoomMessage { type: 'join_room'; roomId: string; playerId: string }
export interface LeaveRoomMessage { type: 'leave_room'; roomId: string; playerId: string }
export interface ListRoomsMessage { type: 'list_rooms' }
export type RoomClientMessage = CreateRoomMessage | JoinRoomMessage | LeaveRoomMessage | ListRoomsMessage;

export interface RoomSummary {
    roomId: string;
    gamemodeId: string;
    playerCount: number;
}

export interface RoomStateBroadcast {
    type: 'room_state';
    roomId: string;
    gamemodeId: string;
    players: string[];
}

export interface RoomListMessage {
    type: 'room_list';
    rooms: RoomSummary[];
}

export type RoomServerMessage = RoomStateBroadcast | RoomListMessage;

function validateRoomSummary(value: unknown, path = 'rooms[]'): ValidationResult<RoomSummary> {
    if (!isRecord(value)) return fail(`${path} must be an object`);
    const roomId = readString(value, 'roomId', `${path}.roomId`);
    if (!roomId.ok) return roomId;
    const gamemodeId = readString(value, 'gamemodeId', `${path}.gamemodeId`);
    if (!gamemodeId.ok) return gamemodeId;
    const playerCount = readNumber(value, 'playerCount', `${path}.playerCount`);
    if (!playerCount.ok) return playerCount;
    return ok({ roomId: roomId.value, gamemodeId: gamemodeId.value, playerCount: playerCount.value });
}

const validateStringItem: Validator<string> = (value, path = 'item') => {
    return typeof value === 'string' ? ok(value) : fail(`${path} must be a string`);
};

export function validateRoomClientMessage(value: unknown): ValidationResult<RoomClientMessage> {
    if (!isRecord(value)) return fail('room message must be an object');
    const type = readEnum(value, 'type', roomClientMessageTypes);
    if (!type.ok) return type;
    if (type.value === 'list_rooms') return ok({ type: 'list_rooms' });
    const roomId = readString(value, 'roomId');
    if (!roomId.ok) return roomId;
    const playerId = readString(value, 'playerId');
    if (!playerId.ok) return playerId;
    if (type.value === 'create_room') {
        const gamemodeId = readString(value, 'gamemodeId');
        if (!gamemodeId.ok) return gamemodeId;
        return ok({ type: 'create_room', roomId: roomId.value, gamemodeId: gamemodeId.value, playerId: playerId.value });
    }
    return ok({ type: type.value, roomId: roomId.value, playerId: playerId.value });
}

export function validateRoomServerMessage(value: unknown): ValidationResult<RoomServerMessage> {
    if (!isRecord(value)) return fail('room server message must be an object');
    if (value.type === 'room_list') {
        const rooms = readArray(value, 'rooms', validateRoomSummary);
        if (!rooms.ok) return rooms;
        return ok({ type: 'room_list', rooms: rooms.value });
    }
    if (value.type === 'room_state') {
        const roomId = readString(value, 'roomId');
        if (!roomId.ok) return roomId;
        const gamemodeId = readString(value, 'gamemodeId');
        if (!gamemodeId.ok) return gamemodeId;
        const players = readArray(value, 'players', validateStringItem);
        if (!players.ok) return players;
        return ok({ type: 'room_state', roomId: roomId.value, gamemodeId: gamemodeId.value, players: players.value });
    }
    return fail('type must be room_state or room_list');
}
