import type { Server, ServerWebSocket } from 'bun';
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


async function parseJson(request: Request): Promise<unknown> {
    try {
        return await request.json();
    } catch {
        return undefined;
    }
}

async function appendAndBroadcast(server: Server<PlayerConnection>, ledger: EventLedgerStorage, event: AgentEvent): Promise<void> {
    await ledger.append({
        type: event.type,
        entityId: event.sessionId,
        timestamp: event.timestamp,
        payload: event,
    });
    server.publish(AGENT_EVENTS_TOPIC, JSON.stringify({ channel: AGENT_EVENTS_TOPIC, event } satisfies AgentEventBroadcast));
}

export function registerAgentEventsModule(router: ModularRouter<PlayerConnection>, options: AgentEventsModuleOptions = {}): void {
    const ledger = options.ledger ?? new SqliteEventLedgerStorage();

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

        await appendAndBroadcast(context.server, ledger, parsed.value);
        return new Response(JSON.stringify({ ok: true }), { status: 202, headers: { 'Content-Type': 'application/json' } });
    });

    router.registerWebSocket(AGENT_EVENTS_TOPIC, (ws: ServerWebSocket<PlayerConnection>) => {
        ws.subscribe(AGENT_EVENTS_TOPIC);
        ws.send(JSON.stringify({ channel: AGENT_EVENTS_TOPIC, type: 'subscribed' }));
    });
}
