import type { AgentEvent, AgentEventType } from '../../../src/contracts/agentEvents.ts';
import type { ClientExtensionCleanup, ClientExtensionContext } from '../../../src/extensions/client.ts';
import { getWsUrl } from '../../../src/net/protocol.ts';

type AgentStatus = 'running' | 'needs_input' | 'done';

interface AgentSessionView {
    harness: string;
    sessionId: string;
    project: string;
    message: string;
    timestamp: string;
    status: AgentStatus;
}

interface AgentEventBroadcastMessage {
    channel: 'agent-events';
    event: AgentEvent;
}

const statusByType: Record<AgentEventType, AgentStatus> = {
    agent_session_start: 'running',
    agent_status: 'running',
    agent_needs_input: 'needs_input',
    agent_done: 'done',
};

const OWNER_KEY_STORAGE = 'lunarpup.agentOwnerKey';
const RECONNECT_MS = 2000;

function isAgentEventBroadcastMessage(value: unknown): value is AgentEventBroadcastMessage {
    if (!value || typeof value !== 'object') return false;
    if (!('channel' in value) || value.channel !== 'agent-events') return false;
    if (!('event' in value) || !value.event || typeof value.event !== 'object') return false;
    return 'type' in value.event && 'sessionId' in value.event;
}

function formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getOrCreateOwnerKey(): string {
    const existing = window.localStorage.getItem(OWNER_KEY_STORAGE);
    if (existing) return existing;
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    const key = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    window.localStorage.setItem(OWNER_KEY_STORAGE, key);
    return key;
}

declare global {
    interface Window {
        webkitAudioContext?: typeof AudioContext;
    }
}

export function setupClient(context: ClientExtensionContext): ClientExtensionCleanup {
    const sessions = new Map<string, AgentSessionView>();
    const ownerKey = getOrCreateOwnerKey();
    const panel = document.createElement('div');
    panel.id = 'agent-hud';
    panel.className = 'lp-panel';
    panel.dataset.extension = 'agent-harness';
    panel.innerHTML = `
        <div class="agent-header">
            <h2 class="lp-panel-title">Agent harness</h2>
            <div id="agent-status" class="agent-status">Waiting for agent events</div>
            <label class="agent-owner">
                <span>Owner key</span>
                <input id="agent-owner-key" class="lp-field" type="text" readonly>
                <button id="agent-owner-copy" class="lp-button" type="button">Copy</button>
            </label>
        </div>
        <div id="agent-session-list" class="agent-session-list"></div>
    `;
    panel.hidden = true;
    context.hudRoot.appendChild(panel);

    const statusElement = panel.querySelector<HTMLDivElement>('#agent-status');
    const listElement = panel.querySelector<HTMLDivElement>('#agent-session-list');
    const ownerKeyElement = panel.querySelector<HTMLInputElement>('#agent-owner-key');
    const copyButton = panel.querySelector<HTMLButtonElement>('#agent-owner-copy');
    if (ownerKeyElement) ownerKeyElement.value = ownerKey;

    let disposed = false;
    let notificationPermissionRequested = false;
    let audioContext: AudioContext | null = null;
    let socket: WebSocket | null = null;
    let reconnectTimer = 0;
    let copyResetTimer = 0;
    const pulseTimers = new Map<HTMLElement, number>();

    function renderSessions(): void {
        if (!listElement || !statusElement) return;
        const ordered = [...sessions.values()].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
        statusElement.textContent = ordered.length === 0
            ? 'Waiting for agent events'
            : `${ordered.filter(session => session.status !== 'done').length} active · ${ordered.length} total`;
        listElement.replaceChildren();

        if (ordered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'agent-empty';
            empty.textContent = 'No harness sessions yet.';
            listElement.appendChild(empty);
            return;
        }

        for (const session of ordered) {
            const row = document.createElement('article');
            row.className = `agent-row agent-${session.status}`;
            row.innerHTML = `
                <div class="agent-row-top"><strong></strong><span class="agent-pill"></span></div>
                <div class="agent-message"></div>
                <div class="agent-meta"></div>
            `;
            const title = row.querySelector('strong');
            const pill = row.querySelector('.agent-pill');
            const message = row.querySelector('.agent-message');
            const meta = row.querySelector('.agent-meta');
            if (title) title.textContent = session.project;
            if (pill) pill.textContent = session.status.replace('_', ' ');
            if (message) message.textContent = session.message;
            if (meta) meta.textContent = `${session.harness} · ${session.sessionId} · ${formatTime(session.timestamp)}`;
            listElement.appendChild(row);
        }
    }

    async function requestNotificationPermission(): Promise<void> {
        if (disposed || notificationPermissionRequested || !('Notification' in window)) return;
        notificationPermissionRequested = true;
        if (Notification.permission === 'default') await Notification.requestPermission();
    }

    const requestPermission = () => void requestNotificationPermission();

    function sendNotification(event: AgentEvent): void {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        new Notification(`${event.project} needs input`, {
            body: event.message,
            tag: `agent-${event.sessionId}`,
            silent: true,
        });
    }

    function playDogBark(): void {
        const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
        if (!AudioContextCtor || disposed) return;
        audioContext ??= new AudioContextCtor();
        const startedAt = audioContext.currentTime;
        const noiseLength = Math.max(1, Math.floor(audioContext.sampleRate * 0.11));
        const noiseBuffer = audioContext.createBuffer(1, noiseLength, audioContext.sampleRate);
        const samples = noiseBuffer.getChannelData(0);
        for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1;

        const noise = audioContext.createBufferSource();
        const noiseGain = audioContext.createGain();
        noise.buffer = noiseBuffer;
        noiseGain.gain.setValueAtTime(0.0001, startedAt);
        noiseGain.gain.exponentialRampToValueAtTime(0.34, startedAt + 0.015);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.12);
        noise.connect(noiseGain).connect(audioContext.destination);
        noise.start(startedAt);
        noise.stop(startedAt + 0.13);

        const oscillator = audioContext.createOscillator();
        const oscillatorGain = audioContext.createGain();
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(220, startedAt);
        oscillator.frequency.exponentialRampToValueAtTime(95, startedAt + 0.09);
        oscillatorGain.gain.setValueAtTime(0.0001, startedAt);
        oscillatorGain.gain.exponentialRampToValueAtTime(0.22, startedAt + 0.012);
        oscillatorGain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.1);
        oscillator.connect(oscillatorGain).connect(audioContext.destination);
        oscillator.start(startedAt);
        oscillator.stop(startedAt + 0.11);
    }

    function pulseScreen(): void {
        const pulse = document.createElement('div');
        pulse.className = 'agent-screen-pulse';
        context.transientRoot.appendChild(pulse);
        const timer = window.setTimeout(() => {
            pulse.remove();
            pulseTimers.delete(pulse);
        }, 360);
        pulseTimers.set(pulse, timer);
    }

    function handleAgentEvent(event: AgentEvent): void {
        if (disposed) return;
        sessions.set(event.sessionId, {
            harness: event.harness,
            sessionId: event.sessionId,
            project: event.project,
            message: event.message,
            timestamp: event.timestamp,
            status: statusByType[event.type],
        });
        panel.hidden = false;
        renderSessions();
        if (event.type === 'agent_needs_input') {
            pulseScreen();
            playDogBark();
            sendNotification(event);
        }
    }

    function connectAgentEvents(): void {
        const wsUrl = getWsUrl();
        if (!wsUrl || disposed || context.signal.aborted || socket) return;
        const nextSocket = new WebSocket(wsUrl);
        socket = nextSocket;
        nextSocket.addEventListener('open', () => {
            if (!disposed) nextSocket.send(JSON.stringify({ channel: 'agent-events', type: 'subscribe', ownerKey }));
        });
        nextSocket.addEventListener('message', message => {
            try {
                const data = JSON.parse(String(message.data));
                if (isAgentEventBroadcastMessage(data)) handleAgentEvent(data.event);
            } catch {
                // Malformed messages on the shared server do not affect the HUD.
            }
        });
        nextSocket.addEventListener('close', () => {
            if (socket === nextSocket) socket = null;
            if (disposed || context.signal.aborted) return;
            window.clearTimeout(reconnectTimer);
            reconnectTimer = window.setTimeout(connectAgentEvents, RECONNECT_MS);
        });
    }

    const copyOwnerKey = async () => {
        await navigator.clipboard?.writeText(ownerKey);
        if (!copyButton || disposed) return;
        copyButton.textContent = 'Copied';
        window.clearTimeout(copyResetTimer);
        copyResetTimer = window.setTimeout(() => {
            if (copyButton && !disposed) copyButton.textContent = 'Copy';
        }, 1200);
    };

    const cleanup = () => {
        if (disposed) return;
        disposed = true;
        context.signal.removeEventListener('abort', cleanup);
        window.removeEventListener('pointerdown', requestPermission);
        window.removeEventListener('keydown', requestPermission);
        copyButton?.removeEventListener('click', copyOwnerKey);
        window.clearTimeout(reconnectTimer);
        window.clearTimeout(copyResetTimer);
        for (const [pulse, timer] of pulseTimers) {
            window.clearTimeout(timer);
            pulse.remove();
        }
        pulseTimers.clear();
        const activeSocket = socket;
        socket = null;
        activeSocket?.close();
        if (audioContext) void audioContext.close();
        audioContext = null;
        sessions.clear();
        panel.remove();
    };

    window.addEventListener('pointerdown', requestPermission, { once: true });
    window.addEventListener('keydown', requestPermission, { once: true });
    copyButton?.addEventListener('click', copyOwnerKey);
    context.signal.addEventListener('abort', cleanup, { once: true });
    connectAgentEvents();
    renderSessions();
    return cleanup;
}
