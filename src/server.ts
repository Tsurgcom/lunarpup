import { DEFAULT_WS_PORT } from './net/protocol.ts';
import { createInitialConnection, registerMultiplayerModule, removePlayer, type PlayerConnection } from './server/multiplayer.ts';
import { registerAgentEventsModule } from './server/agentEvents.ts';
import { registerRoomsModule } from './server/rooms.ts';
import { registerCosmeticsModule } from './server/cosmetics.ts';
import { registerGamemodeModule } from './server/gamemodes.ts';
import { ModularRouter } from './server/router.ts';
import { registerWalletModule } from './server/wallet.ts';

export function createServerRouter(): ModularRouter<PlayerConnection> {
    const router = new ModularRouter<PlayerConnection>();
    registerRoomsModule(router);
    registerMultiplayerModule(router);
    registerAgentEventsModule(router);
    registerGamemodeModule(router);
    registerWalletModule(router);
    registerCosmeticsModule(router);
    return router;
}

const router = createServerRouter();
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

const server = Bun.serve<PlayerConnection>({
    port,
    async fetch(req, server) {
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
        const handled = await router.handleHttp(req, {
            server,
            upgrade: (data) => server.upgrade(req, { data: data ?? (undefined as unknown as PlayerConnection) }),
        });
        if (handled) return withCors(handled);
        if (server.upgrade(req, { data: undefined as unknown as PlayerConnection })) return undefined;
        return withCors(new Response('Not found', { status: 404 }));
    },
    websocket: {
        open(ws) {
            ws.data = createInitialConnection(ws);
        },
        message(ws, message) {
            router.dispatchWebSocket(ws, message);
        },
        close(ws) {
            if (!ws.data.id) return;
            console.log(`[-] ${ws.data.name} left room "${ws.data.room}"`);
            removePlayer(ws.data);
        },
    },
});

console.log(`Lunar Pup multiplayer server listening on ws://localhost:${server.port}`);
