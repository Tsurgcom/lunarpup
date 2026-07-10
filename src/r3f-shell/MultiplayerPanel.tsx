import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { RoomSummary } from '../contracts/roomProtocol.ts';
import { getApiBaseUrl } from '../net/protocol.ts';
import { useGame } from './GameProvider.tsx';

const STATUS_LABELS = {
    disconnected: 'Offline',
    connecting: 'Connecting…',
    connected: 'Connected',
    error: 'Connection error',
} as const;

export function MultiplayerPanel() {
    const { multiplayerConfig, mpStatus, mpStatusDetail, mpRoom, mpPlayers, mpHint } = useGame();
    const [rooms, setRooms] = useState<RoomSummary[]>([]);
    const [loadingRooms, setLoadingRooms] = useState(false);
    const [roomsError, setRoomsError] = useState('');

    const refreshRooms = useCallback(async () => {
        setLoadingRooms(true);
        setRoomsError('');
        try {
            const response = await fetch(`${getApiBaseUrl()}/rooms`);
            if (!response.ok) throw new Error(`Room list failed (${response.status})`);
            const payload = await response.json() as { rooms?: RoomSummary[] };
            setRooms(payload.rooms ?? []);
        } catch (error) {
            setRoomsError(error instanceof Error ? error.message : 'Room list unavailable');
        } finally {
            setLoadingRooms(false);
        }
    }, []);

    useEffect(() => {
        void refreshRooms();
    }, [refreshRooms]);

    function joinRoom(roomId: string) {
        const url = new URL(location.href);
        url.searchParams.set('multiplayer', '');
        url.searchParams.set('room', roomId);
        if (!url.searchParams.has('name') && multiplayerConfig?.name) url.searchParams.set('name', multiplayerConfig.name);
        location.href = url.href;
    }

    function createRoom(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const roomId = String(form.get('room') || 'lunar-park').trim() || 'lunar-park';
        const gamemodeId = String(form.get('gamemode') || 'free-skate');
        const wsUrl = multiplayerConfig?.wsUrl;
        if (!wsUrl) {
            joinRoom(roomId);
            return;
        }
        const socket = new WebSocket(wsUrl);
        socket.addEventListener('open', () => {
            socket.send(JSON.stringify({
                channel: 'room',
                type: 'create_room',
                roomId,
                gamemodeId,
                playerId: multiplayerConfig?.name ?? 'Pup',
            }));
            socket.close();
            joinRoom(roomId);
        }, { once: true });
        socket.addEventListener('error', () => joinRoom(roomId), { once: true });
    }

    const statusText = mpStatus === 'error' && mpStatusDetail
        ? mpStatusDetail
        : mpStatus === 'connected' && mpRoom
            ? `${STATUS_LABELS.connected} · ${mpRoom}`
            : STATUS_LABELS[mpStatus];

    return (
        <section id="multiplayer-panel" className="lp-view-section" aria-label="Multiplayer">
            <div id="mp-status" className={`mp-status mp-${mpStatus}`} role="status" aria-live="polite">{statusText}</div>
            <div id="mp-players" className="mp-players">{mpPlayers}</div>
            <div className="mp-lobby" aria-label="Room browser">
                <div className="mp-lobby-header">
                    <strong>Rooms</strong>
                    <button className="lp-button" type="button" onClick={() => void refreshRooms()}>Refresh</button>
                </div>
                <div id="mp-rooms" className="mp-rooms" role="list" aria-live="polite">
                    {loadingRooms && <div className="mp-empty">Loading rooms…</div>}
                    {!loadingRooms && roomsError && <div className="mp-empty">{roomsError}</div>}
                    {!loadingRooms && !roomsError && rooms.length === 0 && <div className="mp-empty">No rooms yet. Create one or share your private invite URL.</div>}
                    {!loadingRooms && rooms.map((room) => (
                        <button className="lp-button mp-room" type="button" key={room.roomId} onClick={() => joinRoom(room.roomId)}>
                            <span>{room.roomId}</span>
                            <small>{room.gamemodeId} · {room.playerCount} pup{room.playerCount === 1 ? '' : 's'}</small>
                        </button>
                    ))}
                </div>
                <form className="mp-create" onSubmit={createRoom}>
                    <label>Room<input className="lp-field" name="room" maxLength={32} placeholder="lunar-park" /></label>
                    <label>Gamemode<select className="lp-field" name="gamemode" defaultValue="free-skate">
                        <option value="free-skate">Free skate</option>
                        <option value="checkpoint-race">Checkpoint race</option>
                        <option value="trick-attack">Trick attack</option>
                    </select></label>
                    <button className="lp-button lp-button-primary" type="submit">Create room</button>
                </form>
            </div>
            <div id="mp-hint" className="mp-hint" dangerouslySetInnerHTML={{ __html: mpHint }} />
        </section>
    );
}
