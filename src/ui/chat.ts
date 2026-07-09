import { groundClearance } from '../config.ts';
import { getTerrainHeight, updateTerrainChunks, alignPlayerToTerrain } from '../game/terrain.ts';
import { findRemotePlayerByName } from '../game/remotePlayers.ts';
import { multiplayerClient, physics, playerGroup } from '../state.ts';

export interface ChatPanelBinding {
    panel: HTMLDivElement;
    log: HTMLDivElement;
    input: HTMLInputElement;
    isVisible(): boolean;
    setVisible(visible: boolean): void;
}

let activeBinding: ChatPanelBinding | null = null;
let disposeLegacyChat = () => {};
let localName = 'You';

const MAX_LOG_LINES = 60;
const OUTGOING_MIN_INTERVAL_MS = 1000;
const DEDUPE_WINDOW_MS = 3000;
const TP_BROADCAST_INTERVAL_MS = 5000;

let lastOutgoingAt = 0;
let lastTpBroadcastAt = 0;
const recentMessages: { text: string; at: number }[] = [];

/**
 * Connects a mounted chat view to the imperative game and multiplayer APIs.
 * The returned cleanup must run when that view unmounts.
 */
export function bindChatPanel(binding: ChatPanelBinding, mpEnabled: boolean, playerName: string) {
    activeBinding = binding;
    localName = playerName;

    if (!mpEnabled) {
        appendLocalMessage('system', 'Join with ?multiplayer to use chat.');
    }

    window.addEventListener('keydown', onKeyDown);

    return () => {
        window.removeEventListener('keydown', onKeyDown);
        if (activeBinding === binding) activeBinding = null;
    };
}

/** Temporary legacy entry-point until the R3F shell mounts ChatPanel. */
export function setupChatUI(mpEnabled: boolean, playerName: string) {
    disposeLegacyChat();
    document.getElementById('chat-panel')?.remove();

    const panel = document.createElement('div');
    panel.id = 'chat-panel';
    panel.className = mpEnabled ? 'chat-visible' : 'chat-hidden';
    panel.innerHTML = `
        <div class="chat-header">
            <h2>💬 Chat</h2>
            <button type="button" id="chat-toggle" title="Toggle chat (T)">${mpEnabled ? '−' : '+'}</button>
        </div>
        <div id="chat-log" class="chat-log"></div>
        <form id="chat-form" class="chat-form">
            <input id="chat-input" type="text" maxlength="200" placeholder="Say something… (/tp x z)" />
        </form>
    `;
    document.body.appendChild(panel);

    const log = panel.querySelector<HTMLDivElement>('#chat-log');
    const input = panel.querySelector<HTMLInputElement>('#chat-input');
    const form = panel.querySelector<HTMLFormElement>('#chat-form');
    const toggle = panel.querySelector<HTMLButtonElement>('#chat-toggle');
    if (!log || !input || !form || !toggle) {
        panel.remove();
        return;
    }

    const binding: ChatPanelBinding = {
        panel,
        log,
        input,
        isVisible: () => panel.classList.contains('chat-visible'),
        setVisible(visible) {
            panel.classList.toggle('chat-visible', visible);
            panel.classList.toggle('chat-collapsed', !visible);
            toggle.textContent = visible ? '−' : '+';
            if (visible) input.focus();
        },
    };

    const onToggle = () => toggleChat();
    const onSubmit = (event: SubmitEvent) => {
        event.preventDefault();
        void submitChat(input);
    };
    toggle.addEventListener('click', onToggle);
    form.addEventListener('submit', onSubmit);

    const unbind = bindChatPanel(binding, mpEnabled, playerName);
    disposeLegacyChat = () => {
        toggle.removeEventListener('click', onToggle);
        form.removeEventListener('submit', onSubmit);
        unbind();
    };
}

export function appendChatMessage(_id: string, name: string, text: string, isSelf = false) {
    const trimmed = text.trim();
    if (!trimmed) return;
    appendLocalMessage(isSelf ? 'self' : 'remote', `${name}: ${trimmed}`);
}

export function appendSystemMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    appendLocalMessage('system', trimmed);
}

export async function submitChat(input: HTMLInputElement) {
    const text = input.value.trim();
    if (!text) return;

    if (text.startsWith('/tp')) {
        input.value = '';
        handleTpCommand(text);
        return;
    }

    const client = multiplayerClient;
    if (!client?.isConnected) {
        appendSystemMessage('Not connected to multiplayer.');
        return;
    }

    const now = Date.now();
    if (now - lastOutgoingAt < OUTGOING_MIN_INTERVAL_MS || !client.sendChat(text)) {
        appendSystemMessage('Slow down — one message per second.');
        return;
    }

    lastOutgoingAt = now;
    input.value = '';
}

function shouldShowMessage(text: string): boolean {
    const now = Date.now();
    const isDuplicate = recentMessages.some(
        (entry) => entry.text === text && now - entry.at < DEDUPE_WINDOW_MS,
    );
    if (isDuplicate) return false;

    recentMessages.push({ text, at: now });
    if (recentMessages.length > 30) recentMessages.shift();
    return true;
}

function appendLocalMessage(kind: 'self' | 'remote' | 'system', text: string) {
    const log = activeBinding?.log;
    if (!log || !shouldShowMessage(text)) return;

    const line = document.createElement('div');
    line.className = `chat-line chat-${kind}`;
    line.textContent = text;
    log.appendChild(line);
    while (log.children.length > MAX_LOG_LINES) log.firstChild?.remove();
    log.scrollTop = log.scrollHeight;
}

function toggleChat(force?: boolean) {
    const binding = activeBinding;
    if (!binding) return;

    const visible = force ?? !binding.isVisible();
    binding.setVisible(visible);
}

function onKeyDown(event: KeyboardEvent) {
    const binding = activeBinding;
    if (!binding) return;

    if (event.key === 't' || event.key === 'T') {
        if (document.activeElement === binding.input) return;
        event.preventDefault();
        toggleChat();
        return;
    }
    if (event.key === 'Enter' && document.activeElement !== binding.input && binding.isVisible()) {
        event.preventDefault();
        binding.input.focus();
    }
    if (event.key === 'Escape' && document.activeElement === binding.input) {
        binding.input.blur();
    }
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
        maybeBroadcastTp(client, `* ${localName} teleported to ${remote.name}`);
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
        maybeBroadcastTp(client, `* ${localName} teleported to (${x.toFixed(0)}, ${z.toFixed(0)})`);
        return;
    }

    appendSystemMessage('Usage: /tp x z  or  /tp playername');
}

function maybeBroadcastTp(client: typeof multiplayerClient, text: string) {
    if (!client?.isConnected) return;

    const now = Date.now();
    if (now - lastTpBroadcastAt < TP_BROADCAST_INTERVAL_MS || !client.sendChat(text)) return;

    lastTpBroadcastAt = now;
    lastOutgoingAt = now;
}

function teleportTo(x: number, z: number, label: string) {
    playerGroup.position.x = x;
    playerGroup.position.z = z;
    playerGroup.position.y = getTerrainHeight(x, z) + groundClearance;
    physics.velocity.set(0, 0, 0);
    physics.isGrounded = true;
    physics.speed = 0;
    updateTerrainChunks(true);
    alignPlayerToTerrain();
    appendSystemMessage(`You ${label}.`);
}
