import type { RoomSummary } from '../contracts/roomProtocol.ts';
import type { MultiplayerStatus } from '../net/client.ts';
import { getApiBaseUrl } from '../net/protocol.ts';

interface MultiplayerUIOptions {
    enabled: boolean;
    room: string;
    name: string;
    apiBase: string;
    wsUrl?: string | null;
    onJoinRoom: (roomId: string) => void;
}

let statusEl: HTMLDivElement | null = null;
let playersEl: HTMLDivElement | null = null;
let roomsEl: HTMLDivElement | null = null;
let selectedRoom = '';
let uiOptions: MultiplayerUIOptions | null = null;

export function setupMultiplayerUI(options?: MultiplayerUIOptions) {
    uiOptions = options ?? null;
    selectedRoom = options?.room ?? '';

    const panel = document.createElement('div');
    panel.id = 'multiplayer-panel';
    panel.className = 'lp-panel lp-gameplay';
    panel.innerHTML = `
        <h2 class="lp-panel-title">Multiplayer</h2>
        <div id="mp-status" class="mp-status mp-disconnected">Offline</div>
        <div id="mp-players" class="mp-players"></div>
        <div class="mp-lobby" aria-label="Room browser">
            <div class="mp-lobby-header">
                <strong>Rooms</strong>
                <button id="mp-refresh" class="lp-button" type="button">Refresh</button>
            </div>
            <div id="mp-rooms" class="mp-rooms" role="list" aria-live="polite">Loading rooms…</div>
            <form id="mp-create" class="mp-create">
                <label>
                    Room
                    <input id="mp-room-id" class="lp-field" name="room" type="text" autocomplete="off" maxlength="32" placeholder="lunar-park">
                </label>
                <label>
                    Gamemode
                    <select id="mp-gamemode" class="lp-field" name="gamemode">
                        <option value="free-skate">Free skate</option>
                        <option value="checkpoint-race">Checkpoint race</option>
                        <option value="trick-attack">Trick attack</option>
                    </select>
                </label>
                <button class="lp-button lp-button-primary" type="submit">Create room</button>
            </form>
        </div>
        <div class="mp-hint" id="mp-hint">Choose a room to join, or keep free-skate drop-in with <code>?multiplayer</code>.</div>
    `;
    document.body.appendChild(panel);
    statusEl = panel.querySelector('#mp-status');
    playersEl = panel.querySelector('#mp-players');
    roomsEl = panel.querySelector('#mp-rooms');

    panel.querySelector('#mp-refresh')?.addEventListener('click', () => void refreshRooms());
    panel.querySelector('#mp-create')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const roomInput = panel.querySelector<HTMLInputElement>('#mp-room-id');
        const gamemodeInput = panel.querySelector<HTMLSelectElement>('#mp-gamemode');
        const roomId = roomInput?.value.trim() || 'lunar-park';
        const gamemodeId = gamemodeInput?.value.trim() || 'free-skate';
        void createRoom(roomId, gamemodeId);
    });

    void refreshRooms();
}

export function updateRoomBrowser(rooms: RoomSummary[]) {
    renderRooms(rooms);
}

export function updateMultiplayerHint(html: string) {
    const hint = document.getElementById('mp-hint');
    if (hint) hint.innerHTML = html;
}

export function updateMultiplayerStatus(status: MultiplayerStatus, detail?: string, room?: string) {
    if (!statusEl) return;

    const labels: Record<MultiplayerStatus, string> = {
        disconnected: 'Offline',
        connecting: 'Connecting…',
        connected: room ? `Connected · ${room}` : 'Connected',
        error: detail || 'Connection error',
    };

    statusEl.textContent = status === 'error' && detail ? detail : labels[status];
    statusEl.className = `mp-status mp-${status}`;
}

export function updateMultiplayerPlayers(localName: string, remoteNames: string[]) {
    if (!playersEl) return;
    const all = [localName, ...remoteNames];
    playersEl.textContent = all.length > 1
        ? `${all.length} pups: ${all.join(', ')}`
        : `Just you (${localName})`;
}

async function refreshRooms() {
    if (!roomsEl) return;
    roomsEl.textContent = 'Loading rooms…';
    try {
        const res = await fetch(roomHttpUrl());
        if (!res.ok) throw new Error(`Room list failed (${res.status})`);
        const body = await res.json() as { rooms?: RoomSummary[] };
        renderRooms(body.rooms ?? []);
    } catch {
        roomsEl.innerHTML = '<div class="mp-empty">Room list unavailable. You can still use <code>?multiplayer</code> for free-skate drop-in.</div>';
    }
}

async function createRoom(roomId: string, gamemodeId: string) {
    if (!uiOptions) return;
    const target = uiOptions.wsUrl ?? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
    const ws = new WebSocket(target);
    ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ channel: 'room', type: 'create_room', roomId, gamemodeId, playerId: uiOptions?.name ?? 'Pup' }));
        ws.close();
        joinRoom(roomId);
    }, { once: true });
    ws.addEventListener('error', () => joinRoom(roomId), { once: true });
}

function roomHttpUrl() {
    if (!uiOptions?.wsUrl) return `${getApiBaseUrl()}/rooms`;
    const url = new URL(uiOptions.wsUrl);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.pathname = '/rooms';
    url.search = '';
    return url.href;
}

function renderRooms(rooms: RoomSummary[]) {
    if (!roomsEl) return;
    if (rooms.length === 0) {
        roomsEl.innerHTML = '<div class="mp-empty">No rooms yet. Create one or drop into free skate.</div>';
        return;
    }

    roomsEl.replaceChildren(...rooms.map((room) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = room.roomId === selectedRoom ? 'lp-button mp-room mp-room-selected' : 'lp-button mp-room';
        item.innerHTML = `<span>${escapeHtml(room.roomId)}</span><small>${escapeHtml(room.gamemodeId)} · ${room.playerCount} pup${room.playerCount === 1 ? '' : 's'}</small>`;
        item.addEventListener('click', () => joinRoom(room.roomId));
        return item;
    }));
}

function joinRoom(roomId: string) {
    selectedRoom = roomId;
    uiOptions?.onJoinRoom(roomId);
}

function escapeHtml(value: string) {
    return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] ?? char));
}
