import type { MultiplayerStatus } from '../net/client.ts';

export interface MultiplayerPanelBinding {
    status: HTMLDivElement;
    players: HTMLDivElement;
    hint: HTMLDivElement;
}

let activeBinding: MultiplayerPanelBinding | null = null;
let disposeLegacyPanel: (() => void) | null = null;

/**
 * Connect the imperative multiplayer callbacks to a rendered panel. The returned
 * cleanup only clears this binding when it still owns the active panel, which keeps
 * React effect cleanup safe when a newer panel has already mounted.
 */
export function bindMultiplayerPanel(binding: MultiplayerPanelBinding) {
    activeBinding = binding;

    return () => {
        if (activeBinding === binding) activeBinding = null;
    };
}

export function setupMultiplayerUI() {
    disposeLegacyPanel?.();
    document.getElementById('multiplayer-panel')?.remove();

    const panel = document.createElement('aside');
    panel.id = 'multiplayer-panel';
    panel.setAttribute('aria-label', 'Multiplayer');
    panel.innerHTML = `
        <h2>🐾 Multiplayer</h2>
        <div id="mp-status" class="mp-status mp-disconnected" role="status" aria-live="polite">Offline</div>
        <div id="mp-players" class="mp-players"></div>
        <div class="mp-hint" id="mp-hint">Add <code>?multiplayer&room=your-room</code> to the URL</div>
    `;
    document.body.appendChild(panel);

    const status = panel.querySelector<HTMLDivElement>('#mp-status');
    const players = panel.querySelector<HTMLDivElement>('#mp-players');
    const hint = panel.querySelector<HTMLDivElement>('#mp-hint');
    if (!status || !players || !hint) {
        panel.remove();
        return () => undefined;
    }

    const unbind = bindMultiplayerPanel({ status, players, hint });
    disposeLegacyPanel = () => {
        unbind();
        panel.remove();
        if (disposeLegacyPanel) disposeLegacyPanel = null;
    };
    return disposeLegacyPanel;
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
