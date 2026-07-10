import { getStore } from '@netlify/blobs';
import { DEFAULT_ROOM, PLAYER_COLORS } from './protocol.ts';
import type { ChatMessage, EncryptedEnvelope, EncryptedPlayerSnapshot } from './protocol.ts';

const STORE_NAME = 'lunarpup-mp';
const PLAYER_TTL_MS = 45_000;
const POLL_MS = 100;
const ROOM_INDEX_KEY = 'rooms/index';
const ROOM_INDEX_TTL_MS = 60 * 60 * 1000;
export const MAX_ROOM_PLAYERS = 32;
export const MAX_ROOMS = 50;

export { POLL_MS };

interface RoomIndex {
    players: Record<string, { name: EncryptedEnvelope; color: number; joinedAt: number }>;
    usedColors: number[];
}

type PlayerStateBlob = { payload: EncryptedEnvelope; seq: number; lastSeen: number };

export class RoomFullError extends Error {
    constructor() {
        super('Room is full');
        this.name = 'RoomFullError';
    }
}

export class RoomCapError extends Error {
    constructor() {
        super('Room capacity exceeded');
        this.name = 'RoomCapError';
    }
}

interface RoomIndexEntry {
    id: string;
    lastActive: number;
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

async function readRoomIndex(): Promise<RoomIndexEntry[]> {
    const raw = await store().get(ROOM_INDEX_KEY, { type: 'text' });
    if (!raw) return [];
    try {
        return JSON.parse(raw) as RoomIndexEntry[];
    } catch {
        return [];
    }
}

async function writeRoomIndex(entries: RoomIndexEntry[]) {
    await store().set(ROOM_INDEX_KEY, JSON.stringify(entries));
}

async function touchRoomIndex(roomId: string) {
    const now = Date.now();
    const pruned = (await readRoomIndex()).filter((entry) => now - entry.lastActive < ROOM_INDEX_TTL_MS);
    const existing = pruned.find((entry) => entry.id === roomId);
    if (existing) {
        existing.lastActive = now;
        await writeRoomIndex(pruned);
        return;
    }
    if (pruned.length >= MAX_ROOMS) {
        throw new RoomCapError();
    }
    pruned.push({ id: roomId, lastActive: now });
    await writeRoomIndex(pruned);
}

export async function joinRoom(
    roomId: string,
    name: EncryptedEnvelope,
    state: EncryptedEnvelope,
) {
    const room = sanitize(roomId);
    await touchRoomIndex(room);
    const index = await readIndex(room);
    await pruneStalePlayers(room, index);

    if (Object.keys(index.players).length >= MAX_ROOM_PLAYERS) {
        throw new RoomFullError();
    }

    const id = crypto.randomUUID();
    const color = pickColor(index);

    index.players[id] = { name, color, joinedAt: Date.now() };
    if (!index.usedColors.includes(color)) index.usedColors.push(color);
    await writeIndex(room, index);
    await store().set(stateKey(room, id), JSON.stringify({ payload: state, seq: 0, lastSeen: Date.now() } as PlayerStateBlob));

    const players: EncryptedPlayerSnapshot[] = [];
    for (const [pid, meta] of Object.entries(index.players)) {
        if (pid === id) continue;
        const stateRaw = await store().get(stateKey(room, pid), { type: 'text' });
        const blob = stateRaw ? JSON.parse(stateRaw) as PlayerStateBlob : null;
        if (!blob) continue;
        players.push(snapshotFrom(pid, meta, blob));
    }

    return { id, color, room, players };
}

export async function updatePlayerState(
    roomId: string,
    playerId: string,
    seq: number,
    state: EncryptedEnvelope,
) {
    const room = sanitize(roomId);
    const index = await readIndex(room);
    if (!index.players[playerId]) return false;

    const blob: PlayerStateBlob = { payload: state, seq, lastSeen: Date.now() };
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

export async function appendChat(
    roomId: string,
    playerId: string,
    payload: EncryptedEnvelope,
): Promise<ChatMessage | null> {
    const room = sanitize(roomId);
    const index = await readIndex(room);
    if (!index.players[playerId]) return null;

    const raw = await store().get(chatKey(room), { type: 'text' });
    let messages: ChatMessage[] = [];
    if (raw) {
        try { messages = JSON.parse(raw) as ChatMessage[]; } catch { messages = []; }
    }

    const now = Date.now();
    const lastFromPlayer = [...messages].reverse().find(m => m.id === playerId);
    if (lastFromPlayer) {
        if (now - lastFromPlayer.ts < CHAT_MIN_INTERVAL_MS) return null;
        const lastPayload = JSON.stringify(lastFromPlayer.payload);
        const nextPayload = JSON.stringify(payload);
        if (lastPayload === nextPayload && now - lastFromPlayer.ts < CHAT_DEDUPE_WINDOW_MS) return null;
    }

    const msg: ChatMessage = { id: playerId, payload, ts: now };

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
    const snapshots: EncryptedPlayerSnapshot[] = [];

    for (const [pid, meta] of Object.entries(index.players)) {
        if (pid === exceptId) continue;
        const stateRaw = await store().get(stateKey(room, pid), { type: 'text' });
        const blob = stateRaw ? JSON.parse(stateRaw) as PlayerStateBlob : null;
        if (!blob) continue;
        snapshots.push(snapshotFrom(pid, meta, blob));
    }

    return { index, snapshots };
}

async function pruneStalePlayers(roomId: string, index: RoomIndex) {
    const now = Date.now();
    let changed = false;

    for (const [pid] of Object.entries(index.players)) {
        const stateRaw = await store().get(stateKey(roomId, pid), { type: 'text' });
        const blob = stateRaw ? JSON.parse(stateRaw) as PlayerStateBlob : null;
        if (!blob || now - blob.lastSeen > PLAYER_TTL_MS) {
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
    meta: { name: EncryptedEnvelope; color: number },
    blob: PlayerStateBlob,
): EncryptedPlayerSnapshot {
    return { id, color: meta.color, name: meta.name, state: blob.payload, seq: blob.seq };
}
