import { DEFAULT_WS_PORT } from './net/protocol.ts';
import { createInitialConnection, registerMultiplayerModule, removePlayer, type PlayerConnection } from './server/multiplayer.ts';
import { registerAgentEventsModule } from './server/agentEvents.ts';
import { ModularRouter } from './server/router.ts';

export function createServerRouter(): ModularRouter<PlayerConnection> {
    const router = new ModularRouter<PlayerConnection>();
    registerMultiplayerModule(router);
    registerAgentEventsModule(router);
    return router;
}

const router = createServerRouter();
const port = Number(process.env.PORT) || DEFAULT_WS_PORT;

const server = Bun.serve<PlayerConnection>({
    port,
    async fetch(req, server) {
        const handled = await router.handleHttp(req, {
            server,
            upgrade: (data) => server.upgrade(req, { data: data ?? (undefined as unknown as PlayerConnection) }),
        });
        if (handled) return handled;
        if (server.upgrade(req, { data: undefined as unknown as PlayerConnection })) return undefined;
        return new Response('Not found', { status: 404 });
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
