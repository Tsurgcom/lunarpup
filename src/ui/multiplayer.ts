import type { MultiplayerStatus } from '../net/client.ts';

export interface MultiplayerPanelBinding {
    status: HTMLDivElement;
    players: HTMLDivElement;
    hint: HTMLDivElement;
}

let activeBinding: MultiplayerPanelBinding | null = null;

export function bindMultiplayerPanel(binding: MultiplayerPanelBinding) {
    activeBinding = binding;

    return () => {
        if (activeBinding === binding) activeBinding = null;
    };
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
