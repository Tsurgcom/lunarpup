import { groundClearance } from '../config.ts';
import { getTerrainHeight, updateTerrainChunks, alignPlayerToTerrain } from '../game/terrain.ts';
import { findRemotePlayerByName } from '../game/remotePlayers.ts';
import { multiplayerClient, physics, playerGroup } from '../state.ts';
import type { MultiplayerClient } from '../net/client.ts';

let panel: HTMLDivElement | null = null;
let logEl: HTMLDivElement | null = null;
let inputEl: HTMLInputElement | null = null;
let visible = false;
let localName = 'You';

const MAX_LOG_LINES = 60;

export function setupChatUI(mpEnabled: boolean, playerName: string) {
    localName = playerName;

    panel = document.createElement('div');
    panel.id = 'chat-panel';
    panel.className = `lp-panel lp-gameplay ${mpEnabled ? 'chat-visible' : 'chat-hidden'}`;
    visible = mpEnabled;

    panel.innerHTML = `
        <div class="chat-header">
            <h2 class="lp-panel-title">Chat</h2>
            <button class="lp-button" type="button" id="chat-toggle" title="Toggle chat (T)">${mpEnabled ? '−' : '+'}</button>
        </div>
        <div id="chat-log" class="chat-log"></div>
        <form id="chat-form" class="chat-form">
            <input id="chat-input" class="lp-field" type="text" maxlength="200" placeholder="Say something… (/tp x z)" />
        </form>
    `;
    document.body.appendChild(panel);

    logEl = panel.querySelector('#chat-log');
    inputEl = panel.querySelector('#chat-input');

    panel.querySelector('#chat-toggle')?.addEventListener('click', () => toggleChat());
    panel.querySelector('#chat-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        void submitChat();
    });

    if (!mpEnabled) {
        appendLocalMessage('system', 'Join with ?multiplayer to use chat.');
    }

    window.addEventListener('keydown', onKeyDown);
}

export function bindChatClient(client: MultiplayerClient) {
    // Client callbacks are wired in multiplayer.ts; this is for local-only messages.
}

export function appendChatMessage(id: string, name: string, text: string, isSelf = false) {
    appendLocalMessage(isSelf ? 'self' : 'remote', `${name}: ${text}`);
}

export function appendSystemMessage(text: string) {
    appendLocalMessage('system', text);
}

function appendLocalMessage(kind: 'self' | 'remote' | 'system', text: string) {
    if (!logEl) return;
    const line = document.createElement('div');
    line.className = `chat-line chat-${kind}`;
    line.textContent = text;
    logEl.appendChild(line);
    while (logEl.children.length > MAX_LOG_LINES) {
        logEl.firstChild?.remove();
    }
    logEl.scrollTop = logEl.scrollHeight;
}

function toggleChat(force?: boolean) {
    if (!panel) return;
    visible = force ?? !visible;
    panel.classList.toggle('chat-visible', visible);
    panel.classList.toggle('chat-collapsed', !visible);
    const btn = panel.querySelector('#chat-toggle');
    if (btn) btn.textContent = visible ? '−' : '+';
    if (visible) inputEl?.focus();
}

function onKeyDown(e: KeyboardEvent) {
    if (e.key === 't' || e.key === 'T') {
        if (document.activeElement === inputEl) return;
        e.preventDefault();
        toggleChat();
        return;
    }
    if (e.key === 'Enter' && document.activeElement !== inputEl && panel?.classList.contains('chat-visible')) {
        e.preventDefault();
        inputEl?.focus();
    }
    if (e.key === 'Escape' && document.activeElement === inputEl) {
        inputEl?.blur();
    }
}

async function submitChat() {
    if (!inputEl) return;
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';

    if (text.startsWith('/tp')) {
        handleTpCommand(text);
        return;
    }

    const client = multiplayerClient;
    if (!client?.isConnected) {
        appendSystemMessage('Not connected to multiplayer.');
        return;
    }

    client.sendChat(text);
}

function handleTpCommand(raw: string) {
    const parts = raw.trim().split(/\s+/);
    const client = multiplayerClient;

    if (parts.length === 2) {
        const targetName = parts[1]!;
        const remote = findRemotePlayerByName(targetName);
        if (!remote) {
            appendSystemMessage(`Player "${targetName}" not found.`);
            return;
        }
        teleportTo(remote.current.x, remote.current.z, `teleported to ${remote.name}`);
        if (client?.isConnected) {
            client.sendChat(`* ${localName} teleported to ${remote.name}`);
        }
        return;
    }

    if (parts.length >= 3) {
        const x = Number(parts[1]);
        const z = Number(parts[2]);
        if (!Number.isFinite(x) || !Number.isFinite(z)) {
            appendSystemMessage('Usage: /tp x z  or  /tp playername');
            return;
        }
        teleportTo(x, z, `teleported to (${x.toFixed(0)}, ${z.toFixed(0)})`);
        if (client?.isConnected) {
            client.sendChat(`* ${localName} teleported to (${x.toFixed(0)}, ${z.toFixed(0)})`);
        }
        return;
    }

    appendSystemMessage('Usage: /tp x z  or  /tp playername');
}

function teleportTo(x: number, z: number, label: string) {
    playerGroup.position.x = x;
    playerGroup.position.z = z;
    playerGroup.position.y = getTerrainHeight(x, z) + groundClearance;
    physics.velocity.y = 0;
    physics.isGrounded = true;
    physics.speed = 0;
    updateTerrainChunks(true);
    alignPlayerToTerrain();
    appendSystemMessage(`You ${label}.`);
}
