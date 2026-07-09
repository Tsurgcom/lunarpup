import type { MultiplayerStatus } from '../net/client.ts';

let statusEl: HTMLDivElement | null = null;
let playersEl: HTMLDivElement | null = null;

export function setupMultiplayerUI() {
    const panel = document.createElement('div');
    panel.id = 'multiplayer-panel';
    panel.innerHTML = `
        <h2>🐾 Multiplayer</h2>
        <div id="mp-status" class="mp-status mp-disconnected">Offline</div>
        <div id="mp-players" class="mp-players"></div>
        <div class="mp-hint" id="mp-hint">Add <code>?multiplayer&room=your-room</code> to the URL</div>
    `;
    document.body.appendChild(panel);
    statusEl = panel.querySelector('#mp-status');
    playersEl = panel.querySelector('#mp-players');
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
