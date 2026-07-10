import { beforeEach, describe, expect, test } from 'bun:test';
import type { ServerWebSocket } from 'bun';
import type { RoomServerMessage } from '../contracts/roomProtocol.ts';
import { createInitialConnection, type PlayerConnection } from './multiplayer.ts';
import { registerRoomsModule, removeRoomMembershipsForConnection, resetRoomsForTests } from './rooms.ts';
import { ModularRouter } from './router.ts';

function makeWs(id = '') {
    const messages: RoomServerMessage[] = [];
    const ws = {
        data: undefined as unknown as PlayerConnection,
        send(raw: string) {
            messages.push(JSON.parse(raw) as RoomServerMessage);
        },
    } as ServerWebSocket<PlayerConnection>;
    ws.data = createInitialConnection(ws);
    if (id) ws.data.connectionId = id;
    return { ws, messages };
}

function sendRoom(router: ModularRouter<PlayerConnection>, ws: ServerWebSocket<PlayerConnection>, payload: Record<string, unknown>) {
    expect(router.dispatchWebSocket(ws, { channel: 'room', ...payload })).toBe(true);
}

function latestState(messages: RoomServerMessage[]) {
    const states = messages.filter((message): message is Extract<RoomServerMessage, { type: 'room_state' }> => message.type === 'room_state');
    return states.at(-1);
}

describe('rooms module', () => {
    beforeEach(() => resetRoomsForTests());

    test('create/list/join round-trip', async () => {
        const router = new ModularRouter<PlayerConnection>();
        registerRoomsModule(router);
        const host = makeWs('host');
        const guest = makeWs('guest');

        sendRoom(router, host.ws, { type: 'create_room', roomId: 'moon', gamemodeId: 'trick-attack', playerId: 'host' });
        const listed = await router.handleHttp(new Request('http://localhost/rooms'), { server: {} as never, upgrade: () => false });
        expect(listed?.status).toBe(200);
        expect(await listed?.json()).toEqual({ rooms: [{ roomId: 'moon', gamemodeId: 'trick-attack', playerCount: 1 }] });

        sendRoom(router, guest.ws, { type: 'join_room', roomId: 'moon', playerId: 'guest' });
        expect(latestState(host.messages)).toEqual({ type: 'room_state', roomId: 'moon', gamemodeId: 'trick-attack', players: ['host', 'guest'] });
        expect(latestState(guest.messages)).toEqual({ type: 'room_state', roomId: 'moon', gamemodeId: 'trick-attack', players: ['host', 'guest'] });
    });

    test('simulated room members never receive another room broadcast', () => {
        const router = new ModularRouter<PlayerConnection>();
        registerRoomsModule(router);
        const a1 = makeWs('a1');
        const a2 = makeWs('a2');
        const b1 = makeWs('b1');

        sendRoom(router, a1.ws, { type: 'create_room', roomId: 'a', gamemodeId: 'free-skate', playerId: 'a1' });
        sendRoom(router, b1.ws, { type: 'create_room', roomId: 'b', gamemodeId: 'checkpoint-race', playerId: 'b1' });
        b1.messages.length = 0;

        sendRoom(router, a2.ws, { type: 'join_room', roomId: 'a', playerId: 'a2' });

        expect(latestState(a1.messages)?.players).toEqual(['a1', 'a2']);
        expect(latestState(a2.messages)?.players).toEqual(['a1', 'a2']);
        expect(b1.messages).toEqual([]);
    });

    test('host start relays to room members only', () => {
        const router = new ModularRouter<PlayerConnection>();
        registerRoomsModule(router);
        const host = makeWs('host');
        const guest = makeWs('guest');
        const other = makeWs('other');

        sendRoom(router, host.ws, { type: 'create_room', roomId: 'start-room', gamemodeId: 'trick-attack', playerId: 'host' });
        sendRoom(router, guest.ws, { type: 'join_room', roomId: 'start-room', playerId: 'guest' });
        sendRoom(router, other.ws, { type: 'create_room', roomId: 'other-room', gamemodeId: 'free-skate', playerId: 'other' });
        host.messages.length = 0;
        guest.messages.length = 0;
        other.messages.length = 0;

        sendRoom(router, host.ws, { type: 'start_gamemode', roomId: 'start-room', playerId: 'host' });

        expect(host.messages).toEqual([{ type: 'start_gamemode', roomId: 'start-room', gamemodeId: 'trick-attack', hostId: 'host' }]);
        expect(guest.messages).toEqual([{ type: 'start_gamemode', roomId: 'start-room', gamemodeId: 'trick-attack', hostId: 'host' }]);
        expect(other.messages).toEqual([]);
    });

    test('disconnect removes the member and deletes an empty lobby', async () => {
        const router = new ModularRouter<PlayerConnection>();
        registerRoomsModule(router);
        const host = makeWs('host');

        sendRoom(router, host.ws, { type: 'create_room', roomId: 'ephemeral', gamemodeId: 'free-skate', playerId: 'host' });
        removeRoomMembershipsForConnection(host.ws.data);

        const listed = await router.handleHttp(new Request('http://localhost/rooms'), { server: {} as never, upgrade: () => false });
        expect(await listed?.json()).toEqual({ rooms: [] });
    });

    test('disconnect transfers host authority to the next connected member', () => {
        const router = new ModularRouter<PlayerConnection>();
        registerRoomsModule(router);
        const host = makeWs('host');
        const guest = makeWs('guest');

        sendRoom(router, host.ws, { type: 'create_room', roomId: 'handoff', gamemodeId: 'trick-attack', playerId: 'host' });
        sendRoom(router, guest.ws, { type: 'join_room', roomId: 'handoff', playerId: 'guest' });
        guest.messages.length = 0;
        removeRoomMembershipsForConnection(host.ws.data);
        sendRoom(router, guest.ws, { type: 'start_gamemode', roomId: 'handoff', playerId: 'guest' });

        expect(guest.messages).toContainEqual({ type: 'room_state', roomId: 'handoff', gamemodeId: 'trick-attack', players: ['guest'] });
        expect(guest.messages).toContainEqual({ type: 'start_gamemode', roomId: 'handoff', gamemodeId: 'trick-attack', hostId: 'guest' });
    });

    test('ignores spoofed player ids and removes temporary socket membership on close', async () => {
        const router = new ModularRouter<PlayerConnection>();
        registerRoomsModule(router);
        const attacker = makeWs('attacker');
        const temporary = makeWs('temporary');

        sendRoom(router, attacker.ws, { type: 'create_room', roomId: 'spoofed', gamemodeId: 'free-skate', playerId: 'victim' });
        sendRoom(router, temporary.ws, { type: 'create_room', roomId: 'ghost', gamemodeId: 'free-skate', playerId: 'temp' });
        expect(latestState(attacker.messages)?.players).toEqual(['attacker']);
        expect(latestState(temporary.messages)?.players).toEqual(['temporary']);
        removeRoomMembershipsForConnection(attacker.ws.data);
        removeRoomMembershipsForConnection(temporary.ws.data);

        const listed = await router.handleHttp(new Request('http://localhost/rooms'), { server: {} as never, upgrade: () => false });
        expect(await listed?.json()).toEqual({ rooms: [] });
    });
});
