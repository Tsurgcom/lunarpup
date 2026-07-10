import { afterEach, describe, expect, test } from 'bun:test';
import type { Server, ServerWebSocket } from 'bun';
import { loadEnabledExtensions } from './server.ts';
import { setupExtensions } from './client.ts';
import type { EventLedgerStorage, LedgerEvent, LedgerQuery, StorageServices } from '../contracts/services.ts';
import type { PlayerConnection } from '../server/multiplayer.ts';
import { ModularRouter } from '../server/router.ts';

class MemoryLedger implements EventLedgerStorage {
    readonly events: LedgerEvent[] = [];

    append<TType extends string, TPayload>(event: Omit<LedgerEvent<TType, TPayload>, 'id'>): LedgerEvent<TType, TPayload> {
        const saved = { id: this.events.length + 1, ...event } as LedgerEvent<TType, TPayload>;
        this.events.push(saved as LedgerEvent);
        return saved;
    }

    query(_query: LedgerQuery): LedgerEvent[] {
        return this.events;
    }
}

function storage(eventLedger: EventLedgerStorage = new MemoryLedger()): StorageServices {
    return { backend: 'sqlite', currencyInventory: undefined as never, eventLedger };
}

const previousExtensions = process.env.EXTENSIONS;
const previousAgentToken = process.env.AGENT_EVENT_TOKEN;
const previousFetch = globalThis.fetch;
const previousLocation = globalThis.location;

afterEach(() => {
    if (previousExtensions === undefined) delete process.env.EXTENSIONS;
    else process.env.EXTENSIONS = previousExtensions;
    if (previousAgentToken === undefined) delete process.env.AGENT_EVENT_TOKEN;
    else process.env.AGENT_EVENT_TOKEN = previousAgentToken;
    globalThis.fetch = previousFetch;
    if (previousLocation === undefined) Reflect.deleteProperty(globalThis, 'location');
    else globalThis.location = previousLocation;
});

describe('extension loader', () => {
    test('disabled extensions do not register listing or package endpoints', async () => {
        delete process.env.EXTENSIONS;
        const router = new ModularRouter<PlayerConnection>();

        const enabled = await loadEnabledExtensions(router, { storage: storage() });
        const listing = await router.handleHttp(new Request('http://localhost/extensions'), { server: {} as Server<PlayerConnection>, upgrade: () => false });
        const agentEndpoint = await router.handleHttp(new Request('http://localhost/agent/event', { method: 'POST' }), { server: {} as Server<PlayerConnection>, upgrade: () => false });

        expect(enabled).toEqual([]);
        expect(listing).toBeUndefined();
        expect(agentEndpoint).toBeUndefined();
    });

    test('client loader treats disabled server as no extensions without importing clients', async () => {
        globalThis.location = new URL('http://localhost/') as unknown as Location;
        let fetchCount = 0;
        const mockFetch = async () => {
            fetchCount += 1;
            return new Response('Not found', { status: 404 });
        };
        globalThis.fetch = Object.assign(mockFetch, { preconnect: previousFetch.preconnect }) as typeof fetch;

        const controller = new AbortController();
        const dispose = await setupExtensions({
            hudRoot: {} as HTMLElement,
            transientRoot: {} as HTMLElement,
            signal: controller.signal,
        });
        dispose();

        expect(fetchCount).toBe(1);
    });

    test('enabled agent harness exposes listing, client entry, endpoint, and websocket flow', async () => {
        process.env.EXTENSIONS = 'agent-harness';
        process.env.AGENT_EVENT_TOKEN = 'secret';
        const router = new ModularRouter<PlayerConnection>();
        const ledger = new MemoryLedger();

        const enabled = await loadEnabledExtensions(router, { storage: storage(ledger) });
        const listing = await router.handleHttp(new Request('http://localhost/extensions'), { server: {} as Server<PlayerConnection>, upgrade: () => false });
        const listingBody = await listing?.json() as { extensions: Array<{ name: string; displayName: string; clientModule: string }> };
        const clientEntry = await router.handleHttp(new Request(`http://localhost${listingBody.extensions[0]?.clientModule}`), { server: {} as Server<PlayerConnection>, upgrade: () => false });
        const sent: string[] = [];
        const ws = { send: (payload: string) => sent.push(payload) } as ServerWebSocket<PlayerConnection>;

        expect(enabled.map(extension => extension.name)).toEqual(['agent-harness']);
        expect(listing?.status).toBe(200);
        expect(listingBody.extensions).toEqual([{ name: 'agent-harness', displayName: 'Agent Harness', clientModule: '/extensions/agent-harness/client.ts' }]);
        expect(clientEntry?.status).toBe(200);
        expect(await clientEntry?.text()).toContain('setupClient');
        expect(router.dispatchWebSocket(ws, { channel: 'agent-events', type: 'subscribe', ownerKey: 'owner-a' })).toBe(true);

        const post = await router.handleHttp(new Request('http://localhost/agent/event', {
            method: 'POST',
            headers: { authorization: 'Bearer secret', 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'agent_status', harness: 'test', sessionId: 's1', project: 'lunarpup', message: 'hello', timestamp: '2026-07-09T12:00:00.000Z', ownerKey: 'owner-a' }),
        }), { server: {} as Server<PlayerConnection>, upgrade: () => false });

        expect(post?.status).toBe(202);
        expect(ledger.events).toHaveLength(1);
        expect(sent).toEqual([
            JSON.stringify({ channel: 'agent-events', type: 'subscribed', ownerScoped: true }),
            JSON.stringify({ channel: 'agent-events', event: { type: 'agent_status', harness: 'test', sessionId: 's1', project: 'lunarpup', message: 'hello', timestamp: '2026-07-09T12:00:00.000Z' } }),
        ]);
    });
});
