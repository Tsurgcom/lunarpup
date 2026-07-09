import { useEffect, useRef } from 'react';
import { bindMultiplayerPanel } from '../ui/multiplayer.ts';
import { getMultiplayerConfig } from '../net/protocol.ts';

export function MultiplayerPanel() {
    const statusRef = useRef<HTMLDivElement>(null);
    const playersRef = useRef<HTMLDivElement>(null);
    const hintRef = useRef<HTMLDivElement>(null);
    const roomsRef = useRef<HTMLDivElement>(null);
    const refreshRef = useRef<HTMLButtonElement>(null);
    const createFormRef = useRef<HTMLFormElement>(null);
    const roomInputRef = useRef<HTMLInputElement>(null);
    const gamemodeRef = useRef<HTMLSelectElement>(null);

    useEffect(() => {
        const status = statusRef.current;
        const players = playersRef.current;
        const hint = hintRef.current;
        const rooms = roomsRef.current;
        const refreshButton = refreshRef.current;
        const createForm = createFormRef.current;
        const roomInput = roomInputRef.current;
        const gamemodeInput = gamemodeRef.current;
        if (!status || !players || !hint || !rooms || !refreshButton || !createForm || !roomInput || !gamemodeInput) return;

        const config = getMultiplayerConfig();
        return bindMultiplayerPanel({
            status,
            players,
            hint,
            rooms,
            refreshButton,
            createForm,
            roomInput,
            gamemodeInput,
            options: {
                room: config.room,
                name: config.name,
                wsUrl: config.wsUrl,
                onJoinRoom: (roomId) => {
                    const url = new URL(location.href);
                    url.searchParams.set('multiplayer', '');
                    url.searchParams.set('room', roomId);
                    if (!url.searchParams.has('name')) url.searchParams.set('name', config.name);
                    location.href = url.href;
                },
            },
        });
    }, []);

    return (
        <aside id="multiplayer-panel" className="lp-panel lp-gameplay" aria-label="Multiplayer">
            <h2 className="lp-panel-title">🐾 Multiplayer</h2>
            <div id="mp-status" ref={statusRef} className="mp-status mp-disconnected" role="status" aria-live="polite">
                Offline
            </div>
            <div id="mp-players" ref={playersRef} className="mp-players" />
            <div className="mp-lobby" aria-label="Room browser">
                <div className="mp-lobby-header">
                    <strong>Rooms</strong>
                    <button id="mp-refresh" ref={refreshRef} className="lp-button" type="button">Refresh</button>
                </div>
                <div id="mp-rooms" ref={roomsRef} className="mp-rooms" role="list" aria-live="polite">Loading rooms…</div>
                <form id="mp-create" ref={createFormRef} className="mp-create">
                    <label>
                        Room
                        <input id="mp-room-id" ref={roomInputRef} className="lp-field" name="room" type="text" autoComplete="off" maxLength={32} placeholder="lunar-park" />
                    </label>
                    <label>
                        Gamemode
                        <select id="mp-gamemode" ref={gamemodeRef} className="lp-field" name="gamemode" defaultValue="free-skate">
                            <option value="free-skate">Free skate</option>
                            <option value="checkpoint-race">Checkpoint race</option>
                            <option value="trick-attack">Trick attack</option>
                        </select>
                    </label>
                    <button className="lp-button lp-button-primary" type="submit">Create room</button>
                </form>
            </div>
            <div className="mp-hint" id="mp-hint" ref={hintRef}>
                Choose a room to join, or keep free-skate drop-in with <code>?multiplayer</code>.
            </div>
        </aside>
    );
}
