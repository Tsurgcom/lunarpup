import type { ClientMessage, EncryptedPlayerSnapshot, MultiplayerTransport, PlayerSnapshot, ServerMessage } from './protocol.ts';
import { CONNECT_TIMEOUT_MS, STATE_SEND_INTERVAL_MS } from './protocol.ts';
import { RoomCipher, stateFingerprint } from './crypto.ts';
import { sanitizePlayerState } from './stateSanitize.ts';

export type MultiplayerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface MultiplayerClientOptions {
    transport: MultiplayerTransport;
    cipher: RoomCipher;
    wsUrl?: string;
    apiBase?: string;
    room: string;
    name: string;
    reconnect?: boolean;
    onStatus?: (status: MultiplayerStatus, detail?: string) => void;
    onWelcome?: (id: string, color: number, players: PlayerSnapshot[]) => void;
    onPlayerJoined?: (player: PlayerSnapshot) => void;
    onPlayerLeft?: (id: string) => void;
    onPlayerState?: (id: string, state: Omit<PlayerSnapshot, 'id' | 'name' | 'color'>) => void;
    onChat?: (id: string, name: string, text: string, ts: number) => void;
}

function defaultPlayerState(): Omit<PlayerSnapshot, 'id' | 'name' | 'color'> {
    return {
        x: 0, y: 0, z: 0,
        qx: 0, qy: 0, qz: 0, qw: 1,
        heading: 0, speed: 0, isGrounded: true,
        boardTiltX: 0, boardTiltZ: 0,
    };
}

export class MultiplayerClient {
    private ws: WebSocket | null = null;
    private eventSource: EventSource | null = null;
    private localId = '';
    private localColor = 0xffb703;
    private sessionToken = '';
    private lastSend = 0;
    private seq = 0;
    private lastFingerprint = '';
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private connectTimeout: ReturnType<typeof setTimeout> | null = null;
    private closedByUser = false;
    private allowReconnect = true;
    private lastChatSend = 0;
    private lastChatTs = 0;
    private seenChatKeys = new Set<string>();

    constructor(private options: MultiplayerClientOptions) {}

    get id() { return this.localId; }
    get color() { return this.localColor; }
    get isConnected() {
        if (this.options.transport === 'ws') {
            return this.ws?.readyState === WebSocket.OPEN && !!this.localId;
        }
        return !!this.eventSource && !!this.localId;
    }

    connect() {
        this.closedByUser = false;
        this.allowReconnect = this.options.reconnect !== false;
        this.clearConnectTimeout();
        this.setStatus('connecting');

        if (this.options.transport === 'http') {
            void this.connectHttp(false);
            return;
        }

        if (!this.options.wsUrl) {
            this.failConnection('Multiplayer server not configured');
            return;
        }

        this.connectWebSocket(this.options.wsUrl);
    }

    disconnect() {
        this.closedByUser = true;
        this.allowReconnect = false;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.clearConnectTimeout();

        if (this.options.transport === 'http' && this.localId && this.sessionToken) {
            const body = JSON.stringify({
                type: 'leave',
                room: this.options.room,
                id: this.localId,
                token: this.sessionToken,
            } satisfies ClientMessage);
            const url = this.apiUrl();
            if (navigator.sendBeacon) {
                navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
            } else {
                void fetch(url, {
                    method: 'POST',
                    keepalive: true,
                    headers: { 'Content-Type': 'application/json' },
                    body,
                });
            }
        }

        this.ws?.close();
        this.ws = null;
        this.eventSource?.close();
        this.eventSource = null;
        this.localId = '';
        this.sessionToken = '';
        this.setStatus('disconnected');
    }

    sendState(state: Omit<PlayerSnapshot, 'id' | 'name' | 'color'>) {
        if (!this.isConnected) return;
        const now = performance.now();
        if (now - this.lastSend < STATE_SEND_INTERVAL_MS) return;
        const fp = stateFingerprint(state);
        if (fp === this.lastFingerprint) return;
        this.lastFingerprint = fp;
        this.lastSend = now;
        this.seq++;
        void this.sendStateEncrypted(state, this.seq);
    }

    private async sendStateEncrypted(state: Omit<PlayerSnapshot, 'id' | 'name' | 'color'>, seq: number) {
        try {
            const envelope = await this.options.cipher.encrypt(state);
            if (this.options.transport === 'http') {
                void fetch(this.apiUrl(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'state',
                        room: this.options.room,
                        id: this.localId,
                        token: this.sessionToken,
                        seq,
                        state: envelope,
                    } satisfies ClientMessage),
                });
                return;
            }
            this.sendWs({ type: 'state', seq, state: envelope });
        } catch {
            /* ignore transient crypto/send failures */
        }
    }

    sendChat(text: string): boolean {
        const trimmed = text.trim().slice(0, 200);
        if (!trimmed || !this.isConnected) return false;

        const now = Date.now();
        if (now - this.lastChatSend < 1000) return false;
        this.lastChatSend = now;

        void this.sendChatEncrypted(trimmed);
        return true;
    }

    private async sendChatEncrypted(text: string) {
        try {
            const payload = await this.options.cipher.encrypt({ name: this.options.name, text });
            if (this.options.transport === 'http') {
                void fetch(this.apiUrl(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'chat',
                        room: this.options.room,
                        id: this.localId,
                        token: this.sessionToken,
                        payload,
                    } satisfies ClientMessage),
                });
                return;
            }
            this.sendWs({ type: 'chat', payload });
        } catch {
            /* ignore */
        }
    }

    private apiUrl() {
        return this.options.apiBase ?? '/api/mp';
    }

    private connectWebSocket(wsUrl: string) {
        this.ws = new WebSocket(wsUrl);

        this.connectTimeout = setTimeout(() => {
            if (this.ws?.readyState === WebSocket.OPEN) return;
            this.failConnection('Multiplayer server unavailable');
        }, CONNECT_TIMEOUT_MS);

        this.ws.addEventListener('open', () => {
            void this.sendJoinWs();
        });

        this.ws.addEventListener('message', (event) => {
            void this.handleMessage(event.data);
        });

        this.ws.addEventListener('close', () => {
            this.clearConnectTimeout();
            this.localId = '';
            this.sessionToken = '';
            if (!this.closedByUser && this.allowReconnect) {
                this.setStatus('disconnected', 'Reconnecting…');
                this.scheduleReconnect();
            } else {
                this.setStatus('disconnected');
            }
        });

        this.ws.addEventListener('error', () => {
            if (this.allowReconnect) {
                this.setStatus('error', 'Connection failed');
            }
        });
    }

    private async sendJoinWs() {
        try {
            const name = await this.options.cipher.encrypt(this.options.name);
            const state = await this.options.cipher.encrypt(defaultPlayerState());
            this.sendWs({ type: 'join', room: this.options.room, name, state, seq: 0 });
        } catch {
            /* ignore */
        }
    }

    private async connectHttp(isReconnect = false) {
        if (isReconnect && this.localId && this.sessionToken) {
            await fetch(this.apiUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'leave',
                    room: this.options.room,
                    id: this.localId,
                    token: this.sessionToken,
                } satisfies ClientMessage),
            }).catch(() => undefined);
            this.eventSource?.close();
            this.eventSource = null;
            this.localId = '';
            this.sessionToken = '';
        }

        this.connectTimeout = setTimeout(() => {
            if (this.localId) return;
            this.failConnection('Multiplayer server unavailable');
        }, CONNECT_TIMEOUT_MS);

        try {
            const name = await this.options.cipher.encrypt(this.options.name);
            const state = await this.options.cipher.encrypt(defaultPlayerState());

            const res = await fetch(this.apiUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'join',
                    room: this.options.room,
                    name,
                    state,
                    seq: 0,
                } satisfies ClientMessage),
            });

            if (!res.ok) {
                throw new Error(`Join failed (${res.status})`);
            }

            const welcome = await res.json() as ServerMessage;
            if (welcome.type !== 'welcome') {
                throw new Error('Unexpected join response');
            }

            this.localId = welcome.id;
            this.localColor = welcome.color;
            this.sessionToken = welcome.token ?? '';
            if (!this.sessionToken) {
                throw new Error('Join response missing session token');
            }
            this.clearConnectTimeout();
            this.setStatus('connected');

            const players = await this.decryptPlayers(welcome.players);
            this.options.onWelcome?.(welcome.id, welcome.color, players);

            const since = this.lastChatTs > 0 ? `&since=${this.lastChatTs}` : '';
            const streamUrl = `/api/mp/stream?room=${encodeURIComponent(this.options.room)}&id=${encodeURIComponent(welcome.id)}&token=${encodeURIComponent(this.sessionToken)}${since}`;
            this.eventSource = new EventSource(streamUrl);

            this.eventSource.onmessage = (event) => {
                void this.handleMessage(event.data);
            };

            this.eventSource.onerror = () => {
                if (this.closedByUser) return;
                this.eventSource?.close();
                this.eventSource = null;
                this.localId = '';
                this.sessionToken = '';
                if (this.allowReconnect) {
                    this.setStatus('disconnected', 'Reconnecting…');
                    this.scheduleReconnect();
                } else {
                    this.setStatus('error', 'Connection lost');
                }
            };
        } catch {
            this.failConnection('Multiplayer server unavailable');
        }
    }

    private scheduleReconnect() {
        if (!this.allowReconnect) return;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.options.transport === 'http') {
            this.reconnectTimer = setTimeout(() => { void this.connectHttp(true); }, 2500);
            return;
        }
        this.reconnectTimer = setTimeout(() => this.connect(), 2500);
    }

    private clearConnectTimeout() {
        if (this.connectTimeout) clearTimeout(this.connectTimeout);
        this.connectTimeout = null;
    }

    private failConnection(message: string) {
        this.allowReconnect = false;
        this.clearConnectTimeout();
        this.ws?.close();
        this.ws = null;
        this.eventSource?.close();
        this.eventSource = null;
        this.localId = '';
        this.sessionToken = '';
        this.setStatus('error', message);
    }

    private sendWs(msg: ClientMessage) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    private setStatus(status: MultiplayerStatus, detail?: string) {
        this.options.onStatus?.(status, detail);
    }

    private async decryptPlayers(encrypted: EncryptedPlayerSnapshot[]): Promise<PlayerSnapshot[]> {
        const out: PlayerSnapshot[] = [];
        for (const p of encrypted) {
            const snap = await this.decryptPlayer(p);
            if (snap) out.push(snap);
        }
        return out;
    }

    private async decryptPlayer(p: EncryptedPlayerSnapshot): Promise<PlayerSnapshot | null> {
        const name = await this.options.cipher.decrypt<string>(p.name);
        const state = await this.options.cipher.decrypt<Omit<PlayerSnapshot, 'id' | 'name' | 'color'>>(p.state);
        if (name === null || state === null) return null;
        return { id: p.id, color: p.color, name, ...sanitizePlayerState(state) };
    }

    private async handleMessage(raw: unknown) {
        let msg: ServerMessage;
        try {
            msg = JSON.parse(String(raw)) as ServerMessage;
        } catch {
            return;
        }

        switch (msg.type) {
            case 'welcome': {
                this.clearConnectTimeout();
                this.localId = msg.id;
                this.localColor = msg.color;
                this.setStatus('connected');
                const players = await this.decryptPlayers(msg.players);
                this.options.onWelcome?.(msg.id, msg.color, players);
                break;
            }
            case 'player_joined': {
                const player = await this.decryptPlayer(msg.player);
                if (player && player.id !== this.localId) {
                    this.options.onPlayerJoined?.(player);
                }
                break;
            }
            case 'player_left':
                this.options.onPlayerLeft?.(msg.id);
                break;
            case 'state': {
                if (msg.id === this.localId) break;
                const state = await this.options.cipher.decrypt<Omit<PlayerSnapshot, 'id' | 'name' | 'color'>>(msg.state);
                if (state) this.options.onPlayerState?.(msg.id, sanitizePlayerState(state));
                break;
            }
            case 'chat': {
                const chat = await this.options.cipher.decrypt<{ name: string; text: string }>(msg.payload);
                if (!chat) break;
                const key = `${msg.id}:${msg.ts}:${chat.text}`;
                if (this.seenChatKeys.has(key)) break;
                this.seenChatKeys.add(key);
                if (this.seenChatKeys.size > 200) {
                    this.seenChatKeys.clear();
                    this.seenChatKeys.add(key);
                }
                this.lastChatTs = Math.max(this.lastChatTs, msg.ts);
                this.options.onChat?.(msg.id, chat.name, chat.text, msg.ts);
                break;
            }
        }
    }
}
