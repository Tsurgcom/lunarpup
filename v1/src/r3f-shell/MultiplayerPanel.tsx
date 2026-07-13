import { useGame } from './GameProvider.tsx';

const STATUS_LABELS = {
    disconnected: 'Offline',
    connecting: 'Connecting…',
    connected: 'Connected',
    error: 'Connection error',
} as const;

export function MultiplayerPanel() {
    const { mpStatus, mpStatusDetail, mpRoom, mpPlayers, mpHint } = useGame();

    const statusText = mpStatus === 'error' && mpStatusDetail
        ? mpStatusDetail
        : mpStatus === 'connected' && mpRoom
            ? `${STATUS_LABELS.connected} · ${mpRoom}`
            : STATUS_LABELS[mpStatus];

    return (
        <aside id="multiplayer-panel" aria-label="Multiplayer">
            <h2>🐾 Multiplayer</h2>
            <div id="mp-status" className={`mp-status mp-${mpStatus}`} role="status" aria-live="polite">
                {statusText}
            </div>
            <div id="mp-players" className="mp-players">{mpPlayers}</div>
            <div id="mp-hint" className="mp-hint" dangerouslySetInnerHTML={{ __html: mpHint }} />
        </aside>
    );
}
