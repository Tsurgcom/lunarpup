import { MultiplayerClient } from '../net/client.ts';
import type { PlayerSnapshot } from '../net/protocol.ts';
import type { EquippedCosmetics } from '../cosmetics/registry.ts';
import {
    addRemotePlayer,
    clearRemotePlayers,
    removeRemotePlayer,
    updateRemoteTarget,
    getRemotePlayerNames,
} from './remotePlayers.ts';
import { updateMultiplayerStatus, updateMultiplayerPlayers, updateRoomBrowser, updateMultiplayerHint } from '../ui/multiplayer.ts';
import { appendChatMessage } from '../ui/chat.ts';
import { setMultiplayerClient } from '../state.ts';
import { tintLocalDog } from './player.ts';

let localEquippedCosmetics: EquippedCosmetics | undefined;

export function setLocalEquippedCosmetics(equipped: EquippedCosmetics): void {
    localEquippedCosmetics = { ...equipped };
}

export function initMultiplayer(config: {
    transport: 'ws' | 'http';
    wsUrl?: string | null;
    apiBase?: string;
    room: string;
    name: string;
}) {
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
            tintLocalDog(color);
            for (const player of players) addRemotePlayer(player);
            updateMultiplayerPlayers(localName, getRemotePlayerNames());
            client.joinLobbyRoom(config.room, id);
            client.listRooms();
        },
        onPlayerJoined: (player) => {
            addRemotePlayer(player);
            updateMultiplayerPlayers(localName, getRemotePlayerNames());
        },
        onPlayerLeft: (id) => {
            removeRemotePlayer(id);
            updateMultiplayerPlayers(localName, getRemotePlayerNames());
        },
        onPlayerState: (id, state) => {
            updateRemoteTarget(id, state);
        },
        onChat: (id, name, text) => {
            appendChatMessage(id, name, text, id === client.id);
        },
        onRoomList: (rooms) => {
            updateRoomBrowser(rooms);
        },
        onRoomState: (roomId, gamemodeId, players) => {
            if (roomId === config.room) {
                updateMultiplayerHint(`${gamemodeId} lobby · ${players.length} pup${players.length === 1 ? '' : 's'} ready.`);
            }
        },
        onGamemodeStart: (roomId, gamemodeId, hostId) => {
            if (roomId === config.room) {
                appendChatMessage(hostId, 'Host', `started ${gamemodeId}`, false);
            }
        },
    });

    setMultiplayerClient(client);
    client.connect();

    window.addEventListener('beforeunload', () => {
        client.disconnect();
        clearRemotePlayers();
    });
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
        cosmetics: localEquippedCosmetics,
    };
}
