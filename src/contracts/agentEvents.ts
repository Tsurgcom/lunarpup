import { fail, isRecord, ok, readEnum, readString, type ValidationResult } from './validators.ts';

export const agentEventTypes = ['agent_session_start', 'agent_status', 'agent_needs_input', 'agent_done'] as const;
export type AgentEventType = (typeof agentEventTypes)[number];

export interface AgentEvent {
    type: AgentEventType;
    harness: string;
    sessionId: string;
    project: string;
    message: string;
    timestamp: string;
}

export function validateAgentEvent(value: unknown): ValidationResult<AgentEvent> {
    if (!isRecord(value)) return fail('agent event must be an object');
    const type = readEnum(value, 'type', agentEventTypes);
    if (!type.ok) return type;
    const harness = readString(value, 'harness');
    if (!harness.ok) return harness;
    const sessionId = readString(value, 'sessionId');
    if (!sessionId.ok) return sessionId;
    const project = readString(value, 'project');
    if (!project.ok) return project;
    const message = readString(value, 'message');
    if (!message.ok) return message;
    const timestamp = readString(value, 'timestamp');
    if (!timestamp.ok) return timestamp;
    if (Number.isNaN(Date.parse(timestamp.value))) return fail('timestamp must be an ISO-compatible date string');
    return ok({ type: type.value, harness: harness.value, sessionId: sessionId.value, project: project.value, message: message.value, timestamp: timestamp.value });
}
