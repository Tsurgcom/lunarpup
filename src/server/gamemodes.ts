import { SqliteEventLedgerStorage, type EventLedgerStorage } from '../contracts/services.ts';
import type { ModularRouter } from './router.ts';
import type { PlayerConnection } from './multiplayer.ts';

interface RunSamplePoint {
    t: number;
    x: number;
    y: number;
    z: number;
    speed: number;
}

interface RunSampleMessage {
    channel: 'gamemode';
    type: 'run_sample';
    gamemodeId: string;
    playerId: string;
    reason: 'sample' | 'finish' | 'abandon';
    samples: RunSamplePoint[];
}

export interface GamemodeServerOptions {
    ledger?: EventLedgerStorage;
}

export function registerGamemodeModule(router: ModularRouter<PlayerConnection>, options: GamemodeServerOptions = {}): void {
    const ledger = options.ledger ?? new SqliteEventLedgerStorage();
    router.registerWebSocket('gamemode', (ws, payload) => {
        const message = parseRunSampleMessage(payload);
        if (!message) {
            ws.send(JSON.stringify({ channel: 'gamemode', type: 'error', message: 'invalid gamemode payload' }));
            return;
        }
        const entityId = `${message.gamemodeId}:${message.playerId}`;
        void ledger.append({
            type: 'gamemode_run_sample',
            entityId,
            timestamp: new Date().toISOString(),
            payload: {
                gamemodeId: message.gamemodeId,
                playerId: message.playerId,
                reason: message.reason,
                samples: message.samples,
            },
        });
        ws.send(JSON.stringify({ channel: 'gamemode', type: 'sample_ack', count: message.samples.length }));
    });
}

export function parseRunSampleMessage(payload: unknown): RunSampleMessage | null {
    const data = decodePayload(payload);
    if (!data || data.channel !== 'gamemode' || data.type !== 'run_sample') return null;
    if (typeof data.gamemodeId !== 'string' || data.gamemodeId.length === 0) return null;
    if (typeof data.playerId !== 'string' || data.playerId.length === 0) return null;
    if (data.reason !== 'sample' && data.reason !== 'finish' && data.reason !== 'abandon') return null;
    if (!Array.isArray(data.samples) || data.samples.length === 0) return null;
    const samples: RunSamplePoint[] = [];
    for (const sample of data.samples) {
        if (!sample || typeof sample !== 'object') return null;
        if (!('t' in sample) || !('x' in sample) || !('y' in sample) || !('z' in sample) || !('speed' in sample)) return null;
        const point = { t: sample.t, x: sample.x, y: sample.y, z: sample.z, speed: sample.speed };
        if (!Number.isFinite(point.t) || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z) || !Number.isFinite(point.speed)) return null;
        samples.push(point);
    }
    return { channel: 'gamemode', type: 'run_sample', gamemodeId: data.gamemodeId, playerId: data.playerId, reason: data.reason, samples };
}

function decodePayload(payload: unknown): Record<string, unknown> | null {
    if (typeof payload === 'string') {
        try {
            const parsed = JSON.parse(payload) as unknown;
            return isRecord(parsed) ? parsed : null;
        } catch {
            return null;
        }
    }
    if (payload instanceof Buffer) {
        try {
            const parsed = JSON.parse(payload.toString()) as unknown;
            return isRecord(parsed) ? parsed : null;
        } catch {
            return null;
        }
    }
    return isRecord(payload) ? payload : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object';
}
