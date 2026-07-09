import { getStore } from '@netlify/blobs';
import { DEFAULT_ROOM, PLAYER_COLORS } from './protocol.ts';
import type { ChatMessage, PlayerSnapshot } from './protocol.ts';

const STORE_NAME = 'lunarpup-mp';
const PLAYER_TTL_MS = 45_000;
const POLL_MS = 50;
export const MAX_ROOM_PLAYERS = 32;

export { POLL_MS };

interface RoomIndex {
    players: Record<string, { name: string; color: number; joinedAt: number }>;
    usedColors: number[];
}

type PlayerStateBlob = Omit<PlayerSnapshot, 'id' | 'name' | 'color'> & { lastSeen: number };

export class RoomFullError extends Error {
    constructor() {
        super('Room is full');
        this.name = 'RoomFullError';
    }
}

function store() {
    return getStore({ name: STORE_NAME, consistency: 'strong' });
}

function roomKey(roomId: string) {
    return `room/${sanitize(roomId)}/index`;
}

function stateKey(roomId: string, playerId: string) {
    return `room/${sanitize(roomId)}/state/${playerId}`;
}

function chatKey(roomId: string) {
    return `room/${sanitize(roomId)}/chat`;
}

const MAX_CHAT_MESSAGES = 80;
const CHAT_MIN_INTERVAL_MS = 1000;
const CHAT_DEDUPE_WINDOW_MS = 3000;

function sanitize(value: string) {
    return value.trim().slice(0, 64).replace(/[^a-zA-Z0-9_-]/g, '_') || DEFAULT_ROOM;
}

function defaultState(): PlayerStateBlob {
    return {
        x: 0, y: 0, z: 0,
        qx: 0, qy: 0, qz: 0, qw: 1,
        heading: 0, speed: 0, isGrounded: true,
        boardTiltX: 0, boardTiltZ: 0,
        lastSeen: Date.now(),
    };
}

function pickColor(index: RoomIndex): number {
    for (const color of PLAYER_COLORS) {
        if (!index.usedColors.includes(color)) return color;
    }
    return PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]!;
}

async function readIndex(roomId: string): Promise<RoomIndex> {
    const raw = await store().get(roomKey(roomId), { type: 'text' });
    if (!raw) return { players: {}, usedColors: [] };
    try {
        return JSON.parse(raw) as RoomIndex;
    } catch {
        return { players: {}, usedColors: [] };
    }
}

async function writeIndex(roomId: string, index: RoomIndex) {
    await store().set(roomKey(roomId), JSON.stringify(index));
}

export async function joinRoom(roomId: string, name: string) {
    const room = sanitize(roomId);
    const index = await readIndex(room);
    await pruneStalePlayers(room, index);

    if (Object.keys(index.players).length >= MAX_ROOM_PLAYERS) {
        throw new RoomFullError();
    }

    const id = crypto.randomUUID();
    const color = pickColor(index);
    const trimmedName = name.trim().slice(0, 24) || `Pup${Math.floor(Math.random() * 900 + 100)}`;

    index.players[id] = { name: trimmedName, color, joinedAt: Date.now() };
    if (!index.usedColors.includes(color)) index.usedColors.push(color);
    await writeIndex(room, index);
    await store().set(stateKey(room, id), JSON.stringify(defaultState()));

    const players: PlayerSnapshot[] = [];
    for (const [pid, meta] of Object.entries(index.players)) {
        if (pid === id) continue;
        const stateRaw = await store().get(stateKey(room, pid), { type: 'text' });
        const state = stateRaw ? JSON.parse(stateRaw) as PlayerStateBlob : defaultState();
        players.push(snapshotFrom(pid, meta, state));
    }

    return {
        id,
        color,
        room,
        name: trimmedName,
        players,
    };
}

export async function updatePlayerState(
    roomId: string,
    playerId: string,
    state: Omit<PlayerSnapshot, 'id' | 'name' | 'color'>,
) {
    const room = sanitize(roomId);
    const index = await readIndex(room);
    if (!index.players[playerId]) return false;

    if (!isValidState(state)) return false;

    const blob: PlayerStateBlob = { ...state, lastSeen: Date.now() };
    await store().set(stateKey(room, playerId), JSON.stringify(blob));
    return true;
}

export async function leaveRoom(roomId: string, playerId: string) {
    const room = sanitize(roomId);
    const index = await readIndex(room);
    if (!index.players[playerId]) return false;

    const { color } = index.players[playerId];
    delete index.players[playerId];
    index.usedColors = index.usedColors.filter(c => c !== color);
    await writeIndex(room, index);
    await store().delete(stateKey(room, playerId));
    return true;
}

export async function appendChat(roomId: string, playerId: string, text: string): Promise<ChatMessage | null> {
    const room = sanitize(roomId);
    const index = await readIndex(room);
    if (!index.players[playerId]) return null;

    const trimmed = text.trim().slice(0, 200);
    if (!trimmed) return null;

    const raw = await store().get(chatKey(room), { type: 'text' });
    let messages: ChatMessage[] = [];
    if (raw) {
        try { messages = JSON.parse(raw) as ChatMessage[]; } catch { messages = []; }
    }

    const now = Date.now();
    const lastFromPlayer = [...messages].reverse().find(m => m.id === playerId);
    if (lastFromPlayer) {
        if (now - lastFromPlayer.ts < CHAT_MIN_INTERVAL_MS) return null;
        if (lastFromPlayer.text === trimmed && now - lastFromPlayer.ts < CHAT_DEDUPE_WINDOW_MS) return null;
    }

    const msg: ChatMessage = {
        id: playerId,
        name: index.players[playerId].name,
        text: trimmed,
        ts: now,
    };

    messages.push(msg);
    if (messages.length > MAX_CHAT_MESSAGES) {
        messages = messages.slice(-MAX_CHAT_MESSAGES);
    }
    await store().set(chatKey(room), JSON.stringify(messages));
    return msg;
}

export async function readChatSince(roomId: string, sinceTs: number): Promise<ChatMessage[]> {
    const room = sanitize(roomId);
    const raw = await store().get(chatKey(room), { type: 'text' });
    if (!raw) return [];
    try {
        const messages = JSON.parse(raw) as ChatMessage[];
        return messages.filter(m => m.ts > sinceTs);
    } catch {
        return [];
    }
}

export async function readRoomSnapshots(roomId: string, exceptId?: string) {
    const room = sanitize(roomId);
    const index = await readIndex(room);
    const snapshots: PlayerSnapshot[] = [];

    for (const [pid, meta] of Object.entries(index.players)) {
        if (pid === exceptId) continue;
        const stateRaw = await store().get(stateKey(room, pid), { type: 'text' });
        const state = stateRaw ? JSON.parse(stateRaw) as PlayerStateBlob : defaultState();
        snapshots.push(snapshotFrom(pid, meta, state));
    }

    return { index, snapshots };
}

async function pruneStalePlayers(roomId: string, index: RoomIndex) {
    const now = Date.now();
    let changed = false;

    for (const [pid] of Object.entries(index.players)) {
        const stateRaw = await store().get(stateKey(roomId, pid), { type: 'text' });
        const state = stateRaw ? JSON.parse(stateRaw) as PlayerStateBlob : null;
        if (!state || now - state.lastSeen > PLAYER_TTL_MS) {
            const color = index.players[pid]?.color;
            delete index.players[pid];
            if (color !== undefined) {
                index.usedColors = index.usedColors.filter(c => c !== color);
            }
            await store().delete(stateKey(roomId, pid));
            changed = true;
        }
    }

    if (changed) await writeIndex(roomId, index);
}

function snapshotFrom(
    id: string,
    meta: { name: string; color: number },
    state: PlayerStateBlob,
): PlayerSnapshot {
    const { lastSeen: _lastSeen, ...rest } = state;
    return { id, name: meta.name, color: meta.color, ...rest };
}

export function stateFingerprint(state: Omit<PlayerSnapshot, 'id' | 'name' | 'color'>) {
    return [
        state.x, state.y, state.z,
        state.qx, state.qy, state.qz, state.qw,
        state.heading, state.speed, state.isGrounded ? 1 : 0,
        state.boardTiltX, state.boardTiltZ,
    ].map(n => Number(n).toFixed(3)).join('|');
}

function isValidState(state: Omit<PlayerSnapshot, 'id' | 'name' | 'color'>) {
    const numericValues = [
        state.x, state.y, state.z,
        state.qx, state.qy, state.qz, state.qw,
        state.heading, state.speed,
        state.boardTiltX, state.boardTiltZ,
    ];
    return numericValues.every(Number.isFinite) && typeof state.isGrounded === 'boolean';
}
