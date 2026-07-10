import { MultiplayerClient } from '../net/client.ts';
import { RoomCipher } from '../net/crypto.ts';
import type { PlayerSnapshot } from '../net/protocol.ts';
import type { MultiplayerStatus } from '../net/client.ts';
import { tintVoxelDog } from './dogTint.ts';
import type { GameRuntime, RemotePlayerRecord, VoxelDogParts } from './types.ts';
import type { EquippedCosmetics } from '../cosmetics/registry.ts';

let localEquippedCosmetics: EquippedCosmetics | undefined;

export function setLocalEquippedCosmetics(equipped: EquippedCosmetics): void {
    localEquippedCosmetics = { ...equipped };
}

export function isLocalMultiplayerId(localId: string, playerId: string) {
    return localId.length > 0 && playerId === localId;
}

export interface MultiplayerHandlers {
    onStatus: (status: MultiplayerStatus, detail?: string, room?: string) => void;
    onPlayers: (localName: string, remoteNames: string[]) => void;
    onChat: (id: string, name: string, text: string, isSelf: boolean) => void;
    onWelcome: (id: string, color: number, players: PlayerSnapshot[]) => void;
    onPlayerJoined: (player: PlayerSnapshot) => void;
    onPlayerLeft: (id: string) => void;
    onPlayerState: (id: string, state: Omit<PlayerSnapshot, 'id' | 'name' | 'color'>) => void;
}

export function createRemotePlayerRecord(player: PlayerSnapshot): RemotePlayerRecord {
    return {
        id: player.id,
        name: player.name,
        color: player.color,
        target: { ...player },
        current: { ...player },
    };
}

export function upsertRemotePlayer(
    map: Map<string, RemotePlayerRecord>,
    player: PlayerSnapshot,
    localId: string,
): boolean {
    if (isLocalMultiplayerId(localId, player.id)) return false;
    if (map.has(player.id)) return false;
    map.set(player.id, createRemotePlayerRecord(player));
    return true;
}

export function removeRemotePlayerRecord(map: Map<string, RemotePlayerRecord>, id: string) {
    map.delete(id);
}

export function clearRemotePlayerRecords(map: Map<string, RemotePlayerRecord>) {
    map.clear();
}

export function getRemotePlayerNames(map: Map<string, RemotePlayerRecord>): string[] {
    return [...map.values()].map((player) => player.name);
}

export function findRemotePlayerByName(map: Map<string, RemotePlayerRecord>, name: string) {
    const lower = name.toLowerCase();
    for (const remote of map.values()) {
        if (remote.name.toLowerCase() === lower) return remote;
    }
    return undefined;
}

export async function initMultiplayer(
    runtime: GameRuntime,
    parts: VoxelDogParts,
    config: {
        transport: 'ws' | 'http';
        wsUrl?: string | null;
        apiBase?: string;
        roomId: string;
        roomKey: string;
        roomName: string;
        name: string;
    },
    handlers: MultiplayerHandlers,
): Promise<() => void> {
    runtime.multiplayerClient?.disconnect();

    let localId = '';
    const cipher = await RoomCipher.fromKey(config.roomKey);

    const client = new MultiplayerClient({
        transport: config.transport,
        cipher,
        wsUrl: config.wsUrl ?? undefined,
        apiBase: config.apiBase,
        room: config.roomId,
        name: config.name,
        onStatus: (status, detail) => handlers.onStatus(status, detail, config.roomName),
        onWelcome: (id, color, players) => {
            localId = id;
            tintVoxelDog(parts.dog, color);
            handlers.onWelcome(id, color, players);
        },
        onPlayerJoined: (player) => {
            if (isLocalMultiplayerId(localId, player.id)) return;
            handlers.onPlayerJoined(player);
        },
        onPlayerLeft: (id) => {
            if (isLocalMultiplayerId(localId, id)) return;
            handlers.onPlayerLeft(id);
        },
        onPlayerState: (id, state) => {
            if (isLocalMultiplayerId(localId, id)) return;
            handlers.onPlayerState(id, state);
        },
        onChat: (id, name, text) => {
            handlers.onChat(id, name, text, id === client.id);
        },
    });

    runtime.multiplayerClient = client;
    client.connect();

    return () => {
        client.disconnect();
        runtime.multiplayerClient = null;
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
        cosmetics: localEquippedCosmetics,
    };
}
