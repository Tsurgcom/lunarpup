import { getStore } from '@netlify/blobs';
import { DEFAULT_ROOM, PLAYER_COLORS } from './protocol.ts';
import type { ChatMessage, EncryptedEnvelope, EncryptedPlayerSnapshot } from './protocol.ts';

const STORE_NAME = 'lunarpup-mp';
const PLAYER_TTL_MS = 45_000;
const POLL_MS = 50;

export { POLL_MS };

interface RoomIndex {
    players: Record<string, { name: EncryptedEnvelope; color: number; joinedAt: number }>;
    usedColors: number[];
}

/** Per-player stored state. `payload` is an opaque encrypted envelope the relay
 *  cannot read; `seq` is a client-supplied counter used for change-detection. */
type PlayerStateBlob = { payload: EncryptedEnvelope; seq: number; lastSeen: number };

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

export async function joinRoom(
    roomId: string,
    name: EncryptedEnvelope,
    state: EncryptedEnvelope,
) {
    const room = sanitize(roomId);
    const index = await readIndex(room);
    await pruneStalePlayers(room, index);

    const id = crypto.randomUUID();
    const color = pickColor(index);

    // The relay stores the encrypted name + state envelopes verbatim. It never
    // decrypts them, so it cannot learn the player's name or position.
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

    const msg: ChatMessage = { id: playerId, payload, ts: Date.now() };

    const raw = await store().get(chatKey(room), { type: 'text' });
    let messages: ChatMessage[] = [];
    if (raw) {
        try { messages = JSON.parse(raw) as ChatMessage[]; } catch { messages = []; }
    }
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
