import { DEFAULT_WS_PORT } from './net/protocol.ts';
import { createInitialConnection, registerMultiplayerModule, removePlayer, type PlayerConnection } from './server/multiplayer.ts';
import { loadEnabledExtensions } from './extensions/server.ts';
import { registerRoomsModule } from './server/rooms.ts';
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
        if (isWebSocketUpgrade(req) && server.upgrade(req, { data: undefined as unknown as PlayerConnection })) return undefined;
        const handled = await router.handleHttp(req, {
            server,
            upgrade: (data) => server.upgrade(req, { data: data ?? (undefined as unknown as PlayerConnection) }),
        });
        if (handled) return withCors(handled);
        return withCors(new Response('Not found', { status: 404 }));
    },
    websocket: {
        open(ws) {
            ws.data = createInitialConnection(ws);
        },
        message(ws, message) {
            router.dispatchWebSocket(ws, parseWebSocketPayload(message));
        },
        close(ws) {
            if (!ws.data.id) return;
            console.log(`[-] ${ws.data.name} left room "${ws.data.room}"`);
            removePlayer(ws.data);
        },
    },
});

console.log(`Lunar Pup multiplayer server listening on ws://localhost:${server.port}`);
