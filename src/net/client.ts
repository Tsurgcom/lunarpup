import type { ClientMessage, PlayerSnapshot, ServerMessage } from './protocol.ts';
import { STATE_SEND_INTERVAL_MS } from './protocol.ts';

export type MultiplayerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface MultiplayerClientOptions {
    wsUrl: string;
    room: string;
    name: string;
    onStatus?: (status: MultiplayerStatus, detail?: string) => void;
    onWelcome?: (id: string, color: number, players: PlayerSnapshot[]) => void;
    onPlayerJoined?: (player: PlayerSnapshot) => void;
    onPlayerLeft?: (id: string) => void;
    onPlayerState?: (id: string, state: Omit<PlayerSnapshot, 'id' | 'name' | 'color'>) => void;
}

export class MultiplayerClient {
    private ws: WebSocket | null = null;
    private localId = '';
    private localColor = 0xffb703;
    private lastSend = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private closedByUser = false;

    constructor(private options: MultiplayerClientOptions) {}

    get id() { return this.localId; }
    get color() { return this.localColor; }
    get isConnected() { return this.ws?.readyState === WebSocket.OPEN && !!this.localId; }

    connect() {
        this.closedByUser = false;
        this.setStatus('connecting');
        this.ws = new WebSocket(this.options.wsUrl);

        this.ws.addEventListener('open', () => {
            this.send({ type: 'join', room: this.options.room, name: this.options.name });
        });

        this.ws.addEventListener('message', (event) => {
            this.handleMessage(event.data);
        });

        this.ws.addEventListener('close', () => {
            this.localId = '';
            if (!this.closedByUser) {
                this.setStatus('disconnected', 'Reconnecting…');
                this.scheduleReconnect();
            } else {
                this.setStatus('disconnected');
            }
        });

        this.ws.addEventListener('error', () => {
            this.setStatus('error', 'Connection failed');
        });
    }

    disconnect() {
        this.closedByUser = true;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.ws?.close();
        this.ws = null;
        this.localId = '';
        this.setStatus('disconnected');
    }

    sendState(state: Omit<PlayerSnapshot, 'id' | 'name' | 'color'>) {
        if (!this.isConnected) return;
        const now = performance.now();
        if (now - this.lastSend < STATE_SEND_INTERVAL_MS) return;
        this.lastSend = now;
        this.send({ type: 'state', state });
    }

    private scheduleReconnect() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connect(), 2500);
    }

    private send(msg: ClientMessage) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    private setStatus(status: MultiplayerStatus, detail?: string) {
        this.options.onStatus?.(status, detail);
    }

    private handleMessage(raw: unknown) {
        let msg: ServerMessage;
        try {
            msg = JSON.parse(String(raw)) as ServerMessage;
        } catch {
            return;
        }

        switch (msg.type) {
            case 'welcome':
                this.localId = msg.id;
                this.localColor = msg.color;
                this.setStatus('connected');
                this.options.onWelcome?.(msg.id, msg.color, msg.players);
                break;
            case 'player_joined':
                this.options.onPlayerJoined?.(msg.player);
                break;
            case 'player_left':
                this.options.onPlayerLeft?.(msg.id);
                break;
            case 'state':
                this.options.onPlayerState?.(msg.id, msg.state);
                break;
        }
    }
}
