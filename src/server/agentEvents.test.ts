import { describe, expect, test } from 'bun:test';
import type { Server, ServerWebSocket } from 'bun';
import type { AgentEvent } from '../contracts/agentEvents.ts';
import type { EventLedgerStorage, LedgerEvent, LedgerQuery } from '../contracts/services.ts';
import { registerAgentEventsModule } from './agentEvents.ts';
import type { PlayerConnection } from './multiplayer.ts';
import { ModularRouter } from './router.ts';

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

function validEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
    return {
        type: 'agent_status',
        harness: 'claude-code',
        sessionId: 'session-1',
        project: 'lunarpup',
        message: 'running tests',
        timestamp: '2026-07-09T12:00:00.000Z',
        ...overrides,
    };
}

function request(body: unknown, token = 'secret'): Request {
    return new Request('http://localhost/agent/event', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
}

describe('agent events module', () => {
    test('validates auth and event body before accepting endpoint posts', async () => {
        const ledger = new MemoryLedger();
        const router = new ModularRouter<PlayerConnection>();
        const published: string[] = [];
        registerAgentEventsModule(router, { ledger, token: 'secret' });
        const server = { publish: (_topic: string, payload: string) => published.push(payload) };
        const typedServer = server as unknown as Server<PlayerConnection>;

        const unauthorized = await router.handleHttp(request(validEvent(), 'wrong'), { server: typedServer, upgrade: () => false });
        expect(unauthorized?.status).toBe(401);

        const invalid = await router.handleHttp(request({ ...validEvent(), type: 'bad' }), { server: typedServer, upgrade: () => false });
        expect(invalid?.status).toBe(400);

        const accepted = await router.handleHttp(request(validEvent()), { server: typedServer, upgrade: () => false });
        expect(accepted?.status).toBe(202);
        expect(ledger.events).toHaveLength(1);
        expect(published).toHaveLength(1);
    });

    test('appends accepted events to the ledger with session entity id', async () => {
        const ledger = new MemoryLedger();
        const router = new ModularRouter<PlayerConnection>();
        registerAgentEventsModule(router, { ledger, token: 'secret' });
        const server = { publish: () => 1 };
        const typedServer = server as unknown as Server<PlayerConnection>;
        const event = validEvent({ type: 'agent_needs_input', sessionId: 'session-42', message: 'Approve deploy?' });

        await router.handleHttp(request(event), { server: typedServer, upgrade: () => false });

        expect(ledger.events).toHaveLength(1);
        expect(ledger.events[0]).toMatchObject({
            type: 'agent_needs_input',
            entityId: 'session-42',
            timestamp: event.timestamp,
            payload: event,
        });
    });

    test('subscribes websocket clients and broadcasts accepted events on agent-events channel', async () => {
        const ledger = new MemoryLedger();
        const router = new ModularRouter<PlayerConnection>();
        const broadcasts: Array<{ topic: string; payload: string }> = [];
        registerAgentEventsModule(router, { ledger, token: 'secret' });
        const server = { publish: (topic: string, payload: string) => broadcasts.push({ topic, payload }) };
        const typedServer = server as unknown as Server<PlayerConnection>;
        const subscribed: string[] = [];
        const sent: string[] = [];
        const ws = {
            subscribe: (topic: string) => subscribed.push(topic),
            send: (payload: string) => sent.push(payload),
        };
        const typedWs = ws as unknown as ServerWebSocket<PlayerConnection>;

        expect(router.dispatchWebSocket(typedWs, { channel: 'agent-events', type: 'subscribe' })).toBe(true);
        await router.handleHttp(request(validEvent({ type: 'agent_done' })), { server: typedServer, upgrade: () => false });

        expect(subscribed).toEqual(['agent-events']);
        expect(JSON.parse(sent[0] ?? '{}')).toEqual({ channel: 'agent-events', type: 'subscribed' });
        expect(broadcasts).toHaveLength(1);
        expect(broadcasts[0]?.topic).toBe('agent-events');
        expect(JSON.parse(broadcasts[0]?.payload ?? '{}')).toEqual({ channel: 'agent-events', event: validEvent({ type: 'agent_done' }) });
    });
});
