import { useEffect, useRef } from 'react';
import { bindMultiplayerPanel } from '../ui/multiplayer.ts';

export function MultiplayerPanel() {
    const statusRef = useRef<HTMLDivElement>(null);
    const playersRef = useRef<HTMLDivElement>(null);
    const hintRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const status = statusRef.current;
        const players = playersRef.current;
        const hint = hintRef.current;
        if (!status || !players || !hint) return;

        return bindMultiplayerPanel({ status, players, hint });
    }, []);

    return (
        <aside id="multiplayer-panel" aria-label="Multiplayer">
            <h2>🐾 Multiplayer</h2>
            <div id="mp-status" ref={statusRef} className="mp-status mp-disconnected" role="status" aria-live="polite">
                Offline
            </div>
            <div id="mp-players" ref={playersRef} className="mp-players" />
            <div id="mp-hint" ref={hintRef} className="mp-hint">
                Add <code>?multiplayer&amp;room=your-room</code> to the URL
            </div>
        </aside>
    );
}
