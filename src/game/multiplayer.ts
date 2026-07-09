import { MultiplayerClient } from '../net/client.ts';
import type { PlayerSnapshot } from '../net/protocol.ts';
import {
    addRemotePlayer,
    clearRemotePlayers,
    removeRemotePlayer,
    updateRemoteTarget,
    getRemotePlayerNames,
} from './remotePlayers.ts';
import { updateMultiplayerStatus, updateMultiplayerPlayers } from '../ui/multiplayer.ts';
import { appendChatMessage } from '../ui/chat.ts';
import { multiplayerClient, setMultiplayerClient } from '../state.ts';
import { tintLocalDog } from './player.ts';

export function isLocalMultiplayerId(localId: string, playerId: string) {
    return localId.length > 0 && playerId === localId;
}

export function initMultiplayer(config: {
    transport: 'ws' | 'http';
    wsUrl?: string | null;
    apiBase?: string;
    room: string;
    name: string;
}) {
    multiplayerClient?.disconnect();
    clearRemotePlayers();

    let localId = '';
    let localName = config.name;

    const client = new MultiplayerClient({
        transport: config.transport,
        wsUrl: config.wsUrl ?? undefined,
        apiBase: config.apiBase,
        room: config.room,
        name: config.name,
        onStatus: (status, detail) => {
            updateMultiplayerStatus(status, detail, config.room);
        },
        onWelcome: (id, color, players) => {
            localId = id;
            clearRemotePlayers();
            tintLocalDog(color);
            for (const player of players) {
                if (!isLocalMultiplayerId(localId, player.id)) addRemotePlayer(player, localId);
            }
            updateMultiplayerPlayers(localName, getRemotePlayerNames());
        },
        onPlayerJoined: (player) => {
            if (isLocalMultiplayerId(localId, player.id)) return;
            addRemotePlayer(player, localId);
            updateMultiplayerPlayers(localName, getRemotePlayerNames());
        },
        onPlayerLeft: (id) => {
            if (isLocalMultiplayerId(localId, id)) return;
            removeRemotePlayer(id);
            updateMultiplayerPlayers(localName, getRemotePlayerNames());
        },
        onPlayerState: (id, state) => {
            if (isLocalMultiplayerId(localId, id)) return;
            updateRemoteTarget(id, state);
        },
        onChat: (id, name, text) => {
            appendChatMessage(id, name, text, id === client.id);
        },
    });

    setMultiplayerClient(client);
    client.connect();

    return () => {
        client.disconnect();
        clearRemotePlayers();
        setMultiplayerClient(null);
    };
}

export function buildLocalSnapshot(
    group: { position: { x: number; y: number; z: number }; quaternion: { x: number; y: number; z: number; w: number } },
    heading: number,
    speed: number,
    isGrounded: boolean,
    boardTiltX: number,
    boardTiltZ: number,
): Omit<PlayerSnapshot, 'id' | 'name' | 'color'> {
    return {
        x: group.position.x,
        y: group.position.y,
        z: group.position.z,
        qx: group.quaternion.x,
        qy: group.quaternion.y,
        qz: group.quaternion.z,
        qw: group.quaternion.w,
        heading,
        speed,
        isGrounded,
        boardTiltX,
        boardTiltZ,
    };
}
