import { MultiplayerClient } from '../net/client.ts';
import { RoomCipher } from '../net/crypto.ts';
import type { MultiplayerConfig, PlayerSnapshot } from '../net/protocol.ts';
import {
    addRemotePlayer,
    clearRemotePlayers,
    removeRemotePlayer,
    updateRemoteTarget,
    getRemotePlayerNames,
} from './remotePlayers.ts';
import { updateMultiplayerStatus, updateMultiplayerPlayers } from '../ui/multiplayer.ts';
import { appendChatMessage } from '../ui/chat.ts';
import { setMultiplayerClient } from '../state.ts';
import { tintLocalDog } from './player.ts';

export async function initMultiplayer(config: MultiplayerConfig) {
    const localName = config.name;

    // Derive the shared E2E cipher from the room key. The relay never receives
    // this key — it lives only in the URL fragment — so only clients in the
    // room can read names, positions, and chat.
    const cipher = await RoomCipher.fromKey(config.roomKey);

    const client = new MultiplayerClient({
        transport: config.transport,
        cipher,
        wsUrl: config.wsUrl ?? undefined,
        apiBase: config.apiBase,
        room: config.roomId,
        name: config.name,
        onStatus: (status, detail) => {
            updateMultiplayerStatus(status, detail, config.roomName);
        },
        onWelcome: (id, color, players) => {
            tintLocalDog(color);
            for (const player of players) addRemotePlayer(player);
            updateMultiplayerPlayers(localName, getRemotePlayerNames());
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
    };
}
