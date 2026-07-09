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

function ownerHash(ownerKey: string): string {
    return new Bun.CryptoHasher('sha256').update(ownerKey).digest('hex');
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
        registerAgentEventsModule(router, { ledger, token: 'secret' });
        const typedServer = {} as Server<PlayerConnection>;

        const unauthorized = await router.handleHttp(request(validEvent(), 'wrong'), { server: typedServer, upgrade: () => false });
        expect(unauthorized?.status).toBe(401);

        const invalid = await router.handleHttp(request({ ...validEvent(), type: 'bad' }), { server: typedServer, upgrade: () => false });
        expect(invalid?.status).toBe(400);

        const accepted = await router.handleHttp(request(validEvent()), { server: typedServer, upgrade: () => false });
        expect(accepted?.status).toBe(202);
        expect(ledger.events).toHaveLength(1);
        expect(ledger.events[0]?.payload).not.toHaveProperty('ownerKey');
    });

    test('appends accepted events to the ledger with session entity id', async () => {
        const ledger = new MemoryLedger();
        const router = new ModularRouter<PlayerConnection>();
        registerAgentEventsModule(router, { ledger, token: 'secret' });
        const typedServer = {} as Server<PlayerConnection>;
        const event = validEvent({ type: 'agent_needs_input', sessionId: 'session-42', message: 'Approve deploy?', ownerKey: 'player-one-key' });

        await router.handleHttp(request(event), { server: typedServer, upgrade: () => false });

        expect(ledger.events).toHaveLength(1);
        expect(ledger.events[0]).toMatchObject({
            type: 'agent_needs_input',
            entityId: 'session-42',
            timestamp: event.timestamp,
            payload: { type: event.type, harness: event.harness, sessionId: event.sessionId, project: event.project, message: event.message, timestamp: event.timestamp, ownerKeyHash: ownerHash('player-one-key') },
        });
        expect(ledger.events[0]?.payload).not.toHaveProperty('ownerKey');
    });

    test('delivers accepted events only to websocket subscribers with the matching owner key', async () => {
        const ledger = new MemoryLedger();
        const router = new ModularRouter<PlayerConnection>();
        registerAgentEventsModule(router, { ledger, token: 'secret' });
        const typedServer = {} as Server<PlayerConnection>;
        const sentA: string[] = [];
        const sentB: string[] = [];
        const wsA = { send: (payload: string) => sentA.push(payload) } as ServerWebSocket<PlayerConnection>;
        const wsB = { send: (payload: string) => sentB.push(payload) } as ServerWebSocket<PlayerConnection>;

        expect(router.dispatchWebSocket(wsA, { channel: 'agent-events', type: 'subscribe', ownerKey: 'owner-a' })).toBe(true);
        expect(router.dispatchWebSocket(wsB, { channel: 'agent-events', type: 'subscribe', ownerKey: 'owner-b' })).toBe(true);
        await router.handleHttp(request(validEvent({ type: 'agent_done', ownerKey: 'owner-b' })), { server: typedServer, upgrade: () => false });

        expect(sentA).toEqual([JSON.stringify({ channel: 'agent-events', type: 'subscribed', ownerScoped: true })]);
        expect(sentB).toEqual([
            JSON.stringify({ channel: 'agent-events', type: 'subscribed', ownerScoped: true }),
            JSON.stringify({ channel: 'agent-events', event: validEvent({ type: 'agent_done' }) }),
        ]);
    });

    test('accepts missing or unknown owner keys without delivering to subscribers', async () => {
        const ledger = new MemoryLedger();
        const router = new ModularRouter<PlayerConnection>();
        registerAgentEventsModule(router, { ledger, token: 'secret' });
        const typedServer = {} as Server<PlayerConnection>;
        const sent: string[] = [];
        const ws = { send: (payload: string) => sent.push(payload) } as ServerWebSocket<PlayerConnection>;

        expect(router.dispatchWebSocket(ws, { channel: 'agent-events', type: 'subscribe', ownerKey: 'known-owner' })).toBe(true);
        const missing = await router.handleHttp(request(validEvent({ sessionId: 'missing-owner' })), { server: typedServer, upgrade: () => false });
        const unknown = await router.handleHttp(request(validEvent({ sessionId: 'unknown-owner', ownerKey: 'unknown-owner' })), { server: typedServer, upgrade: () => false });

        expect(missing?.status).toBe(202);
        expect(unknown?.status).toBe(202);
        expect(sent).toEqual([JSON.stringify({ channel: 'agent-events', type: 'subscribed', ownerScoped: true })]);
        expect(ledger.events).toHaveLength(2);
        expect(ledger.events[0]?.payload).toEqual(validEvent({ sessionId: 'missing-owner' }));
        expect(ledger.events[1]?.payload).toEqual({ ...validEvent({ sessionId: 'unknown-owner' }), ownerKeyHash: ownerHash('unknown-owner') });
        expect(ledger.events[1]?.payload).not.toHaveProperty('ownerKey');
    });
});
