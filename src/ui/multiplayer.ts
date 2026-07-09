import type { RoomSummary } from '../contracts/roomProtocol.ts';
import type { MultiplayerStatus } from '../net/client.ts';
import { getApiBaseUrl } from '../net/protocol.ts';

export interface MultiplayerPanelOptions {
    room: string;
    name: string;
    wsUrl?: string | null;
    onJoinRoom: (roomId: string) => void;
}

export interface MultiplayerPanelBinding {
    status: HTMLDivElement;
    players: HTMLDivElement;
    hint: HTMLDivElement;
    rooms: HTMLDivElement;
    refreshButton: HTMLButtonElement;
    createForm: HTMLFormElement;
    roomInput: HTMLInputElement;
    gamemodeInput: HTMLSelectElement;
    options: MultiplayerPanelOptions;
}

let activeBinding: MultiplayerPanelBinding | null = null;
let selectedRoom = '';

export function bindMultiplayerPanel(binding: MultiplayerPanelBinding) {
    activeBinding = binding;
    selectedRoom = binding.options.room;

    const onRefresh = () => void refreshRooms();
    const onSubmit = (event: Event) => {
        event.preventDefault();
        const roomId = binding.roomInput.value.trim() || 'lunar-park';
        const gamemodeId = binding.gamemodeInput.value.trim() || 'free-skate';
        void createRoom(roomId, gamemodeId);
    };

    binding.refreshButton.addEventListener('click', onRefresh);
    binding.createForm.addEventListener('submit', onSubmit);

    void refreshRooms();

    return () => {
        binding.refreshButton.removeEventListener('click', onRefresh);
        binding.createForm.removeEventListener('submit', onSubmit);
        if (activeBinding === binding) activeBinding = null;
    };
}

export function updateRoomBrowser(rooms: RoomSummary[]) {
    renderRooms(rooms);
}

export function updateMultiplayerHint(html: string) {
    if (activeBinding) activeBinding.hint.innerHTML = html;
}

export function updateMultiplayerStatus(status: MultiplayerStatus, detail?: string, room?: string) {
    if (!activeBinding) return;

    const labels: Record<MultiplayerStatus, string> = {
        disconnected: 'Offline',
        connecting: 'Connecting…',
        connected: room ? `Connected · ${room}` : 'Connected',
        error: detail || 'Connection error',
    };

    activeBinding.status.textContent = status === 'error' && detail ? detail : labels[status];
    activeBinding.status.className = `mp-status mp-${status}`;
}

export function updateMultiplayerPlayers(localName: string, remoteNames: string[]) {
    if (!activeBinding) return;

    const all = [localName, ...remoteNames];
    activeBinding.players.textContent = all.length > 1
        ? `${all.length} pups: ${all.join(', ')}`
        : `Just you (${localName})`;
}

async function refreshRooms() {
    if (!activeBinding) return;
    const rooms = activeBinding.rooms;
    rooms.textContent = 'Loading rooms…';
    try {
        const res = await fetch(roomHttpUrl());
        if (!res.ok) throw new Error(`Room list failed (${res.status})`);
        const body = await res.json() as { rooms?: RoomSummary[] };
        renderRooms(body.rooms ?? []);
    } catch {
        rooms.innerHTML = '<div class="mp-empty">Room list unavailable. You can still use <code>?multiplayer</code> for free-skate drop-in.</div>';
    }
}

async function createRoom(roomId: string, gamemodeId: string) {
    if (!activeBinding) return;
    const options = activeBinding.options;
    const target = options.wsUrl ?? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
    const ws = new WebSocket(target);
    ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ channel: 'room', type: 'create_room', roomId, gamemodeId, playerId: options.name || 'Pup' }));
        ws.close();
        joinRoom(roomId);
    }, { once: true });
    ws.addEventListener('error', () => joinRoom(roomId), { once: true });
}

function roomHttpUrl() {
    const wsUrl = activeBinding?.options.wsUrl;
    if (!wsUrl) return `${getApiBaseUrl()}/rooms`;
    const url = new URL(wsUrl);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.pathname = '/rooms';
    url.search = '';
    return url.href;
}

function renderRooms(rooms: RoomSummary[]) {
    if (!activeBinding) return;
    const container = activeBinding.rooms;
    if (rooms.length === 0) {
        container.innerHTML = '<div class="mp-empty">No rooms yet. Create one or drop into free skate.</div>';
        return;
    }

    container.replaceChildren(...rooms.map((room) => {
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
    activeBinding?.options.onJoinRoom(roomId);
}

function escapeHtml(value: string) {
    return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] ?? char));
}
