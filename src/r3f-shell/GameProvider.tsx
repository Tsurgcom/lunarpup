import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
    type RefObject,
} from 'react';
import type { MultiplayerStatus } from '../net/client.ts';
import { getMultiplayerConfig, isLocalDevHost } from '../net/protocol.ts';
import { createGameRuntime } from '../game/runtime.ts';
import {
    findRemotePlayerByName,
    getRemotePlayerNames,
    initMultiplayer,
    isLocalMultiplayerId,
    upsertRemotePlayer,
    removeRemotePlayerRecord,
    clearRemotePlayerRecords,
} from '../game/multiplayer.ts';
import type { GameRuntime, RemotePlayerRecord } from '../game/types.ts';
import { teleportPlayer } from '../game/simulation.ts';
import { groundClearance } from '../config.ts';
import { alignPlayerToTerrain, getTerrainHeight } from '../game/terrain.ts';

export type ChatLine = {
    id: string;
    kind: 'self' | 'remote' | 'system';
    text: string;
};

type GameContextValue = {
    runtime: RefObject<GameRuntime>;
    ready: RefObject<boolean>;
    remotePlayersRef: RefObject<Map<string, RemotePlayerRecord>>;
    remotePlayerIds: string[];
    multiplayerConfig: ReturnType<typeof getMultiplayerConfig>;
    mpStatus: MultiplayerStatus;
    mpStatusDetail?: string;
    mpRoom?: string;
    mpHint: string;
    mpPlayers: string;
    chatLines: ChatLine[];
    appendChatLine: (kind: ChatLine['kind'], text: string) => void;
    submitChatMessage: (text: string) => boolean;
    handleTpCommand: (raw: string) => void;
    registerPlayerParts: (parts: NonNullable<GameRuntime['parts']>) => void;
};

const GameContext = createContext<GameContextValue | null>(null);

const MAX_LOG_LINES = 60;
const OUTGOING_MIN_INTERVAL_MS = 1000;
const DEDUPE_WINDOW_MS = 3000;
const TP_BROADCAST_INTERVAL_MS = 5000;

export function GameProvider({ children }: { children: ReactNode }) {
    const runtime = useRef(createGameRuntime());
    const ready = useRef(false);
    const remotePlayersRef = useRef(new Map<string, RemotePlayerRecord>());
    const [remotePlayerIds, setRemotePlayerIds] = useState<string[]>([]);
    const multiplayerConfig = useMemo(() => getMultiplayerConfig(), []);
    const [mpStatus, setMpStatus] = useState<MultiplayerStatus>('disconnected');
    const [mpStatusDetail, setMpStatusDetail] = useState<string | undefined>();
    const [mpRoom, setMpRoom] = useState<string | undefined>();
    const [mpHint, setMpHint] = useState(
        'Add <code>?multiplayer&amp;room=your-room</code> to the URL',
    );
    const [mpPlayers, setMpPlayers] = useState(`Just you (${multiplayerConfig.name})`);
    const [chatLines, setChatLines] = useState<ChatLine[]>([]);
    const lastOutgoingAt = useRef(0);
    const lastTpBroadcastAt = useRef(0);
    const recentMessages = useRef<{ text: string; at: number }[]>([]);
    const disconnectMultiplayer = useRef<(() => void) | null>(null);
    const chatLineId = useRef(0);
    const localPlayerIdRef = useRef('');

    const syncRemoteIds = useCallback(() => {
        setRemotePlayerIds([...remotePlayersRef.current.keys()]);
    }, []);

    const refreshPlayerList = useCallback((localName: string) => {
        const remoteNames = getRemotePlayerNames(remotePlayersRef.current);
        setMpPlayers(remoteNames.length > 0
            ? `${remoteNames.length + 1} pups: ${localName}, ${remoteNames.join(', ')}`
            : `Just you (${localName})`);
    }, []);

    const appendChatLine = useCallback((kind: ChatLine['kind'], text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;

        const now = Date.now();
        const isDuplicate = recentMessages.current.some(
            (entry) => entry.text === trimmed && now - entry.at < DEDUPE_WINDOW_MS,
        );
        if (isDuplicate) return;

        recentMessages.current.push({ text: trimmed, at: now });
        if (recentMessages.current.length > 30) recentMessages.current.shift();

        chatLineId.current += 1;
        setChatLines((current) => [...current.slice(-(MAX_LOG_LINES - 1)), {
            id: String(chatLineId.current),
            kind,
            text: trimmed,
        }]);
    }, []);

    const registerPlayerParts = useCallback((parts: NonNullable<GameRuntime['parts']>) => {
        runtime.current.parts = parts;
        const root = parts.playerGroup ?? parts.group;
        root.position.set(0, getTerrainHeight(0, 0) + groundClearance, 0);
        runtime.current.physics.heading = 0;
        alignPlayerToTerrain(root, runtime.current.physics, runtime.current.scratch);
        ready.current = true;

        if (!multiplayerConfig.enabled) return;

        const mpConfig = multiplayerConfig;
        if (mpConfig.transport === 'ws' && !mpConfig.wsUrl) {
            setMpStatus('error');
            setMpStatusDetail('Multiplayer server not configured');
            setMpHint(
                isLocalDevHost()
                    ? 'Start the server with <code>bun run dev:server</code> (port 3001).'
                    : 'Add <code>&amp;ws=wss://your-ws-host.example.com</code> to use an external WebSocket server.',
            );
            return;
        }

        disconnectMultiplayer.current?.();
        clearRemotePlayerRecords(remotePlayersRef.current);
        syncRemoteIds();

        disconnectMultiplayer.current = initMultiplayer(
            runtime.current,
            parts,
            mpConfig,
            {
                onStatus: (status, detail, room) => {
                    setMpStatus(status);
                    setMpStatusDetail(detail);
                    setMpRoom(room);
                },
                onPlayers: (localName, remoteNames) => {
                    setMpPlayers(remoteNames.length > 0
                        ? `${remoteNames.length + 1} pups: ${localName}, ${remoteNames.join(', ')}`
                        : `Just you (${localName})`);
                },
                onChat: (id, name, text, isSelf) => {
                    appendChatLine(isSelf ? 'self' : 'remote', `${name}: ${text}`);
                },
                onWelcome: (id, _color, players) => {
                    localPlayerIdRef.current = id;
                    clearRemotePlayerRecords(remotePlayersRef.current);
                    for (const player of players) {
                        upsertRemotePlayer(remotePlayersRef.current, player, id);
                    }
                    syncRemoteIds();
                    refreshPlayerList(mpConfig.name);
                    if (mpConfig.transport === 'http') {
                        setMpHint('Multiplayer runs on Netlify (SSE + Blobs). Share this URL with friends.');
                    }
                },
                onPlayerJoined: (player) => {
                    if (upsertRemotePlayer(remotePlayersRef.current, player, localPlayerIdRef.current)) {
                        syncRemoteIds();
                        refreshPlayerList(mpConfig.name);
                    }
                },
                onPlayerLeft: (id) => {
                    if (isLocalMultiplayerId(localPlayerIdRef.current, id)) return;
                    removeRemotePlayerRecord(remotePlayersRef.current, id);
                    syncRemoteIds();
                    refreshPlayerList(mpConfig.name);
                },
                onPlayerState: (id, state) => {
                    if (isLocalMultiplayerId(localPlayerIdRef.current, id)) return;
                    const remote = remotePlayersRef.current.get(id);
                    if (!remote) return;
                    Object.assign(remote.target, state);
                },
            },
        );
    }, [appendChatLine, multiplayerConfig, refreshPlayerList, syncRemoteIds]);

    useEffect(() => () => {
        disconnectMultiplayer.current?.();
        disconnectMultiplayer.current = null;
        ready.current = false;
    }, []);

    const submitChatMessage = useCallback((text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return false;

        if (trimmed.startsWith('/tp')) {
            return false;
        }

        const client = runtime.current.multiplayerClient;
        if (!client?.isConnected) {
            appendChatLine('system', 'Not connected to multiplayer.');
            return false;
        }

        const now = Date.now();
        if (now - lastOutgoingAt.current < OUTGOING_MIN_INTERVAL_MS || !client.sendChat(trimmed)) {
            appendChatLine('system', 'Slow down — one message per second.');
            return false;
        }

        lastOutgoingAt.current = now;
        return true;
    }, [appendChatLine]);

    const handleTpCommand = useCallback((raw: string) => {
        const parts = raw.trim().split(/\s+/);
        const client = runtime.current.multiplayerClient;
        const localName = multiplayerConfig.name;

        const maybeBroadcastTp = (text: string) => {
            if (!client?.isConnected) return;
            const now = Date.now();
            if (now - lastTpBroadcastAt.current < TP_BROADCAST_INTERVAL_MS || !client.sendChat(text)) return;
            lastTpBroadcastAt.current = now;
            lastOutgoingAt.current = now;
        };

        if (parts.length === 2) {
            const targetName = parts[1]!;
            const remote = findRemotePlayerByName(remotePlayersRef.current, targetName);
            if (!remote) {
                appendChatLine('system', `Player "${targetName}" not found.`);
                return;
            }
            teleportPlayer(runtime.current, remote.current.x, remote.current.z);
            appendChatLine('system', `You teleported to ${remote.name}.`);
            maybeBroadcastTp(`* ${localName} teleported to ${remote.name}`);
            return;
        }

        if (parts.length >= 3) {
            const x = Number(parts[1]);
            const z = Number(parts[2]);
            if (!Number.isFinite(x) || !Number.isFinite(z)) {
                appendChatLine('system', 'Usage: /tp x z  or  /tp playername');
                return;
            }
            teleportPlayer(runtime.current, x, z);
            appendChatLine('system', `You teleported to (${x.toFixed(0)}, ${z.toFixed(0)}).`);
            maybeBroadcastTp(`* ${localName} teleported to (${x.toFixed(0)}, ${z.toFixed(0)})`);
            return;
        }

        appendChatLine('system', 'Usage: /tp x z  or  /tp playername');
    }, [appendChatLine, multiplayerConfig.name]);

    const value = useMemo<GameContextValue>(() => ({
        runtime,
        ready,
        remotePlayersRef,
        remotePlayerIds,
        multiplayerConfig,
        mpStatus,
        mpStatusDetail,
        mpRoom,
        mpHint,
        mpPlayers,
        chatLines,
        appendChatLine,
        submitChatMessage,
        handleTpCommand,
        registerPlayerParts,
    }), [
        appendChatLine,
        chatLines,
        handleTpCommand,
        mpHint,
        mpPlayers,
        mpRoom,
        mpStatus,
        mpStatusDetail,
        multiplayerConfig,
        registerPlayerParts,
        remotePlayerIds,
        submitChatMessage,
    ]);

    return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
    const context = useContext(GameContext);
    if (!context) throw new Error('useGame must be used within GameProvider');
    return context;
}

export function useGameRuntime() {
    return useGame().runtime.current;
}
