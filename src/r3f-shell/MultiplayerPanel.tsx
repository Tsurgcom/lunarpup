import { useState } from 'react';
import { useGame } from './GameProvider.tsx';
import { buildPrivateInviteUrl } from './privateInvite.ts';

const STATUS_LABELS = {
    disconnected: 'Offline',
    connecting: 'Connecting…',
    connected: 'Connected',
    error: 'Connection error',
} as const;

export function MultiplayerPanel() {
    const { mpStatus, mpStatusDetail, mpRoom, mpPlayers, mpHint } = useGame();
    const [copyStatus, setCopyStatus] = useState('');

    async function copyInvite() {
        const invite = buildPrivateInviteUrl(location.href);
        if (!invite) {
            setCopyStatus('Private key is still initializing. Try again.');
            return;
        }
        try {
            await navigator.clipboard.writeText(invite);
            setCopyStatus('Private invite copied. Anyone with this link can join.');
        } catch {
            setCopyStatus('Copy failed. Copy the full browser URL, including #k=.');
        }
    }

    const statusText = mpStatus === 'error' && mpStatusDetail
        ? mpStatusDetail
        : mpStatus === 'connected' && mpRoom
            ? `${STATUS_LABELS.connected} · ${mpRoom}`
            : STATUS_LABELS[mpStatus];

    return (
        <section id="multiplayer-panel" className="lp-view-section" aria-label="Private multiplayer">
            <div id="mp-status" className={`mp-status mp-${mpStatus}`} role="status" aria-live="polite">{statusText}</div>
            <div id="mp-players" className="mp-players">{mpPlayers}</div>
            <div className="mp-lobby" aria-label="Private invite">
                <div className="mp-lobby-header"><strong>Private session</strong></div>
                <p className="mp-empty">
                    Multiplayer is invite-only for now. Routing comes from the secret <code>#k=</code> fragment,
                    so room names alone cannot join a session.
                </p>
                <button className="lp-button lp-button-primary" type="button" onClick={() => void copyInvite()}>
                    Copy private invite
                </button>
                {copyStatus && <p role="status" className="mp-hint">{copyStatus}</p>}
                <button className="lp-button" type="button" disabled title="Planned for Concern 22">
                    Public rooms unavailable
                </button>
            </div>
            <div id="mp-hint" className="mp-hint" dangerouslySetInnerHTML={{ __html: mpHint }} />
        </section>
    );
}
