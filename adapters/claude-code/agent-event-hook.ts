#!/usr/bin/env bun
import { validateAgentEvent, type AgentEvent, type AgentEventType } from '../../src/contracts/agentEvents.ts';

interface ClaudeHookPayload {
    hook_event_name?: string;
    session_id?: string;
    cwd?: string;
    transcript_path?: string;
    message?: string;
    stop_hook_active?: boolean;
}

const eventTypeByHook = new Map<string, AgentEventType>([
    ['SessionStart', 'agent_session_start'],
    ['Notification', 'agent_needs_input'],
    ['Stop', 'agent_done'],
]);

async function readHookPayload(): Promise<ClaudeHookPayload> {
    const input = await new Response(Bun.stdin.stream()).text();
    if (!input.trim()) return {};
    const value = JSON.parse(input) as unknown;
    if (!value || typeof value !== 'object') return {};

    const payload: ClaudeHookPayload = {};
    if ('hook_event_name' in value && typeof value.hook_event_name === 'string') payload.hook_event_name = value.hook_event_name;
    if ('session_id' in value && typeof value.session_id === 'string') payload.session_id = value.session_id;
    if ('cwd' in value && typeof value.cwd === 'string') payload.cwd = value.cwd;
    if ('transcript_path' in value && typeof value.transcript_path === 'string') payload.transcript_path = value.transcript_path;
    if ('message' in value && typeof value.message === 'string') payload.message = value.message;
    if ('stop_hook_active' in value && typeof value.stop_hook_active === 'boolean') payload.stop_hook_active = value.stop_hook_active;
    return payload;
}

function eventTypeFor(payload: ClaudeHookPayload): AgentEventType {
    const hookEvent = payload.hook_event_name ?? '';
    return eventTypeByHook.get(hookEvent) ?? 'agent_status';
}

function projectName(cwd: string | undefined): string {
    if (!cwd) return 'unknown-project';
    const parts = cwd.split(/[\\/]+/).filter(Boolean);
    return parts.at(-1) ?? cwd;
}

function messageFor(payload: ClaudeHookPayload, type: AgentEventType): string {
    if (payload.message) return payload.message;
    if (type === 'agent_session_start') return 'Claude Code session started';
    if (type === 'agent_needs_input') return 'Claude Code needs input';
    if (type === 'agent_done') return 'Claude Code session stopped';
    return 'Claude Code status update';
}

async function main(): Promise<void> {
    const endpoint = process.env.AGENT_EVENT_ENDPOINT ?? 'http://localhost:3001/agent/event';
    const token = process.env.AGENT_EVENT_TOKEN;
    if (!token) throw new Error('AGENT_EVENT_TOKEN is required');
    const ownerKey = process.env.AGENT_EVENT_OWNER_KEY;
    if (!ownerKey) throw new Error('AGENT_EVENT_OWNER_KEY is required; copy it from the in-game Agent harness HUD');

    const payload = await readHookPayload();
    const type = eventTypeFor(payload);
    const event: AgentEvent = {
        type,
        harness: 'claude-code',
        sessionId: payload.session_id ?? crypto.randomUUID(),
        project: projectName(payload.cwd),
        message: messageFor(payload, type),
        timestamp: new Date().toISOString(),
        ownerKey,
    };

    const valid = validateAgentEvent(event);
    if (!valid.ok) throw new Error(valid.error);

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(valid.value),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`agent event POST failed: ${response.status} ${text}`);
    }
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
