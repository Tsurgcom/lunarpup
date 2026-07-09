import type { AgentEvent, AgentEventType } from '../../../src/contracts/agentEvents.ts';
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

const sessions = new Map<string, AgentSessionView>();
let panelEl: HTMLDivElement | null = null;
let listEl: HTMLDivElement | null = null;
let statusEl: HTMLDivElement | null = null;
let notificationPermissionRequested = false;
let audioContext: AudioContext | null = null;
let socket: WebSocket | null = null;
const OWNER_KEY_STORAGE = 'lunarpup.agentOwnerKey';
let ownerKey = '';
let ownerKeyEl: HTMLInputElement | null = null;
let ownerCopyEl: HTMLButtonElement | null = null;

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

function renderSessions(): void {
    if (!listEl || !statusEl) return;
    const ordered = [...sessions.values()].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    statusEl.textContent = ordered.length === 0 ? 'Waiting for agent events' : `${ordered.filter(session => session.status !== 'done').length} active · ${ordered.length} total`;
    listEl.replaceChildren();

    if (ordered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'agent-empty';
        empty.textContent = 'No harness sessions yet.';
        listEl.appendChild(empty);
        return;
    }

    for (const session of ordered) {
        const row = document.createElement('article');
        row.className = `agent-row agent-${session.status}`;
        row.innerHTML = `
            <div class="agent-row-top">
                <strong></strong>
                <span class="agent-pill"></span>
            </div>
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
        listEl.appendChild(row);
    }
}

async function requestNotificationPermission(): Promise<void> {
    if (notificationPermissionRequested || !('Notification' in window)) return;
    notificationPermissionRequested = true;
    if (Notification.permission === 'default') await Notification.requestPermission();
}

function armNotificationPermissionRequest(): void {
    const request = () => void requestNotificationPermission();
    window.addEventListener('pointerdown', request, { once: true });
    window.addEventListener('keydown', request, { once: true });
}

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
    if (!AudioContextCtor) return;
    audioContext ??= new AudioContextCtor();
    const startedAt = audioContext.currentTime;

    const noiseLength = Math.max(1, Math.floor(audioContext.sampleRate * 0.11));
    const noiseBuffer = audioContext.createBuffer(1, noiseLength, audioContext.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;

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
    document.body.appendChild(pulse);
    window.setTimeout(() => pulse.remove(), 360);
}

function handleAgentEvent(event: AgentEvent): void {
    sessions.set(event.sessionId, {
        harness: event.harness,
        sessionId: event.sessionId,
        project: event.project,
        message: event.message,
        timestamp: event.timestamp,
        status: statusByType[event.type],
    });
    if (panelEl?.hidden) panelEl.hidden = false;
    renderSessions();

    if (event.type === 'agent_needs_input') {
        pulseScreen();
        playDogBark();
        sendNotification(event);
    }
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

function connectAgentEvents(): void {
    const wsUrl = getWsUrl();
    if (!wsUrl || socket) return;
    socket = new WebSocket(wsUrl);
    socket.addEventListener('open', () => {
        socket?.send(JSON.stringify({ channel: 'agent-events', type: 'subscribe', ownerKey }));
    });
    socket.addEventListener('message', message => {
        try {
            const data = JSON.parse(String(message.data));
            if (isAgentEventBroadcastMessage(data)) handleAgentEvent(data.event);
        } catch {
            // Ignore malformed messages on the shared game WebSocket.
        }
    });
    socket.addEventListener('close', () => {
        socket = null;
        window.setTimeout(connectAgentEvents, 2000);
    });
}

function setupAgentHud(): void {
    ownerKey = getOrCreateOwnerKey();
    if (panelEl) return;
    panelEl = document.createElement('div');
    panelEl.id = 'agent-hud';
    panelEl.innerHTML = `
        <div class="agent-header">
            <h2>Agent harness</h2>
            <div id="agent-status" class="agent-status">Waiting for agent events</div>
            <label class="agent-owner">
                <span>Owner key</span>
                <input id="agent-owner-key" type="text" readonly>
                <button id="agent-owner-copy" type="button">Copy</button>
            </label>
        </div>
        <div id="agent-session-list" class="agent-session-list"></div>
    `;
    panelEl.hidden = true;
    document.body.appendChild(panelEl);
    statusEl = panelEl.querySelector('#agent-status');
    listEl = panelEl.querySelector('#agent-session-list');
    ownerKeyEl = panelEl.querySelector('#agent-owner-key');
    ownerCopyEl = panelEl.querySelector('#agent-owner-copy');
    if (ownerKeyEl) ownerKeyEl.value = ownerKey;
    ownerCopyEl?.addEventListener('click', async () => {
        await navigator.clipboard?.writeText(ownerKey);
        if (ownerCopyEl) {
            ownerCopyEl.textContent = 'Copied';
            window.setTimeout(() => {
                if (ownerCopyEl) ownerCopyEl.textContent = 'Copy';
            }, 1200);
        }
    });
    armNotificationPermissionRequest();
    connectAgentEvents();
}

declare global {
    interface Window {
        webkitAudioContext?: typeof AudioContext;
    }
}

export function setupClient(): void {
    setupAgentHud();
}
