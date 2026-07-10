import { DEFAULT_WS_PORT } from './net/protocol.ts';
import { createInitialConnection, registerMultiplayerModule, removePlayer, type PlayerConnection } from './server/multiplayer.ts';
import { loadEnabledExtensions } from './extensions/server.ts';
import { registerRoomsModule, removeRoomMembershipsForConnection } from './server/rooms.ts';
import { registerCosmeticsModule } from './server/cosmetics.ts';
import { registerGamemodeModule } from './server/gamemodes.ts';
import { registerLootboxModule } from './server/lootbox.ts';
import { ModularRouter } from './server/router.ts';
import { registerWalletModule } from './server/wallet.ts';
import { createStorageServices } from './contracts/services.ts';
import { registerLeaderboardModule } from './server/leaderboard.ts';

export async function createServerRouter(): Promise<ModularRouter<PlayerConnection>> {
    const router = new ModularRouter<PlayerConnection>();
    const storage = createStorageServices();
    const walletAuth = registerWalletModule(router);
    registerRoomsModule(router);
    registerMultiplayerModule(router);
    await loadEnabledExtensions(router, { storage });
    registerGamemodeModule(router, { ledger: storage.eventLedger });
    registerCosmeticsModule(router, { currency: storage.currencyInventory, ledger: storage.eventLedger, walletAuth });
    registerLootboxModule(router, { currency: storage.currencyInventory, ledger: storage.eventLedger, walletAuth });
    registerLeaderboardModule(router, { ledger: storage.eventLedger });
    return router;
}

const router = await createServerRouter();
const port = Number(process.env.PORT) || DEFAULT_WS_PORT;
const ALLOWED_WS_ORIGINS = (
    // Canonical MP_ALLOWED_ORIGINS (matches netlify/lib/cors.ts + MP_SESSION_SECRET);
    // ALLOWED_ORIGINS kept as a fallback so one operator setting hardens both the WS
    // server and the Netlify CORS instead of silently covering only half.
    process.env.MP_ALLOWED_ORIGINS
    ?? process.env.ALLOWED_ORIGINS
    ?? 'http://localhost:3000,http://127.0.0.1:3000'
).split(',').map((origin) => origin.trim()).filter(Boolean);
const GLOBAL_MAX_CONNECTIONS = Number(process.env.GLOBAL_MAX_CONNECTIONS) || 200;
const MAX_PAYLOAD_LENGTH = 1 << 16;
const IDLE_TIMEOUT_SECONDS = 60;
let openSockets = 0;

// The game page is served from a different origin than this API server
// (dev: :3000 vs :3001; prod: Netlify vs the game server), so every HTTP
// response needs CORS. Auth is token-based, never cookie-based, so '*' is safe.
const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function withCors(res: Response): Response {
    for (const [key, value] of Object.entries(CORS_HEADERS)) res.headers.set(key, value);
    return res;
}

function isWebSocketUpgrade(req: Request): boolean {
    return req.headers.get('upgrade')?.toLowerCase() === 'websocket';
}

function isWebSocketOriginAllowed(req: Request): boolean {
    const origin = req.headers.get('origin');
    return !origin || ALLOWED_WS_ORIGINS.includes(origin);
}

function parseWebSocketPayload(message: string | Buffer | ArrayBuffer): unknown {
    const source = typeof message === 'string'
        ? message
        : message instanceof ArrayBuffer
            ? new TextDecoder().decode(message)
            : message.toString();
    try {
        return JSON.parse(source);
    } catch {
        return message;
    }
}

const server = Bun.serve<PlayerConnection>({
    port,
    async fetch(req, server) {
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
        if (isWebSocketUpgrade(req)) {
            if (!isWebSocketOriginAllowed(req)) return new Response('Forbidden', { status: 403 });
            if (openSockets >= GLOBAL_MAX_CONNECTIONS) return new Response('Too many connections', { status: 503 });
            if (server.upgrade(req, { data: undefined as unknown as PlayerConnection })) return undefined;
        }
        const handled = await router.handleHttp(req, {
            server,
            upgrade: (data) => server.upgrade(req, { data: data ?? (undefined as unknown as PlayerConnection) }),
        });
        if (handled) return withCors(handled);
        return withCors(new Response('Not found', { status: 404 }));
    },
    websocket: {
        maxPayloadLength: MAX_PAYLOAD_LENGTH,
        idleTimeout: IDLE_TIMEOUT_SECONDS,
        open(ws) {
            openSockets += 1;
            ws.data = createInitialConnection(ws);
        },
        message(ws, message) {
            router.dispatchWebSocket(ws, parseWebSocketPayload(message));
        },
        close(ws) {
            openSockets = Math.max(0, openSockets - 1);
            removeRoomMembershipsForConnection(ws.data);
            if (!ws.data.id) return;
            console.log(`[-] player ${ws.data.id} left encrypted room "${ws.data.room}"`);
            removePlayer(ws.data);
        },
    },
});

console.log(`Lunar Pup multiplayer server listening on ws://localhost:${server.port}`);
