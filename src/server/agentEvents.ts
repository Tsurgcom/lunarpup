import type { ServerWebSocket } from 'bun';
import { validateAgentEvent, type AgentEvent } from '../contracts/agentEvents.ts';
import { SqliteEventLedgerStorage, type EventLedgerStorage } from '../contracts/services.ts';
import type { PlayerConnection } from './multiplayer.ts';
import type { ModularRouter } from './router.ts';

const AGENT_EVENTS_TOPIC = 'agent-events';

export interface AgentEventsModuleOptions {
    ledger?: EventLedgerStorage;
    token?: string;
}

export interface AgentEventBroadcast {
    channel: 'agent-events';
    event: AgentEvent;
}

interface AgentEventSubscribe {
    channel: 'agent-events';
    type: 'subscribe';
    ownerKey?: string;
}

async function parseJson(request: Request): Promise<unknown> {
    try {
        return await request.json();
    } catch {
        return undefined;
    }
}

function hashOwnerKey(ownerKey: string): string {
    return new Bun.CryptoHasher('sha256').update(ownerKey).digest('hex');
}

function ledgerPayload(event: AgentEvent): AgentEvent & { ownerKeyHash?: string } {
    const { ownerKey, ...safeEvent } = event;
    return ownerKey ? { ...safeEvent, ownerKeyHash: hashOwnerKey(ownerKey) } : safeEvent;
}

function eventForClient(event: AgentEvent): AgentEvent {
    const { ownerKey: _ownerKey, ...safeEvent } = event;
    return safeEvent;
}

function isAgentEventSubscribe(payload: unknown): payload is AgentEventSubscribe {
    if (!payload || typeof payload !== 'object') return false;
    if (!('channel' in payload) || payload.channel !== AGENT_EVENTS_TOPIC) return false;
    if (!('type' in payload) || payload.type !== 'subscribe') return false;
    return !('ownerKey' in payload) || typeof payload.ownerKey === 'string';
}

async function appendAndDeliver(subscribersByOwnerKey: Map<string, Set<ServerWebSocket<PlayerConnection>>>, ledger: EventLedgerStorage, event: AgentEvent): Promise<void> {
    await ledger.append({
        type: event.type,
        entityId: event.sessionId,
        timestamp: event.timestamp,
        payload: ledgerPayload(event),
    });

    const recipients = event.ownerKey ? subscribersByOwnerKey.get(event.ownerKey) : undefined;
    if (!recipients) return;

    const payload = JSON.stringify({ channel: AGENT_EVENTS_TOPIC, event: eventForClient(event) } satisfies AgentEventBroadcast);
    for (const ws of recipients) {
        try {
            ws.send(payload);
        } catch {
            recipients.delete(ws);
        }
    }
}

export function registerAgentEventsModule(router: ModularRouter<PlayerConnection>, options: AgentEventsModuleOptions = {}): void {
    const ledger = options.ledger ?? new SqliteEventLedgerStorage();
    const subscribersByOwnerKey = new Map<string, Set<ServerWebSocket<PlayerConnection>>>();

    router.registerHttp('POST', '/agent/event', async (request, context) => {
        const token = options.token ?? process.env.AGENT_EVENT_TOKEN;
        const requestBearer = request.headers.get('authorization');
        const [scheme, bearer] = requestBearer?.split(/\s+/, 2) ?? [];
        const requestSecret = scheme?.toLowerCase() === 'bearer' && bearer ? bearer : request.headers.get('x-agent-event-token');
        if (!token || requestSecret !== token) {
            return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }

        const parsed = validateAgentEvent(await parseJson(request));
        if (!parsed.ok) {
            return new Response(JSON.stringify({ error: parsed.error }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        await appendAndDeliver(subscribersByOwnerKey, ledger, parsed.value);
        return new Response(JSON.stringify({ ok: true }), { status: 202, headers: { 'Content-Type': 'application/json' } });
    });

    router.registerWebSocket(AGENT_EVENTS_TOPIC, (ws: ServerWebSocket<PlayerConnection>, payload: unknown) => {
        if (!isAgentEventSubscribe(payload) || !payload.ownerKey) {
            ws.send(JSON.stringify({ channel: AGENT_EVENTS_TOPIC, type: 'subscribed', ownerScoped: false }));
            return;
        }

        let subscribers = subscribersByOwnerKey.get(payload.ownerKey);
        if (!subscribers) {
            subscribers = new Set();
            subscribersByOwnerKey.set(payload.ownerKey, subscribers);
        }
        subscribers.add(ws);
        ws.send(JSON.stringify({ channel: AGENT_EVENTS_TOPIC, type: 'subscribed', ownerScoped: true }));
    });
}
