import { SQL } from 'bun';
import type { EventLedgerStorage, LedgerEvent } from '../contracts/services.ts';
import type { ModularRouter } from './router.ts';

export interface LeaderboardEntry {
    playerId: string;
    bestTimeMs: number;
    completedAt: string;
}

export interface LeaderboardServices {
    ledger: EventLedgerStorage;
    sql?: SQL;
}

interface RunSamplePayload {
    gamemodeId: string;
    playerId: string;
    reason: string;
    samples: Array<{ t: number }>;
}

export function registerLeaderboardModule<TConnection>(router: ModularRouter<TConnection>, services: LeaderboardServices): void {
    router.registerHttp('GET', '/leaderboard/:gamemodeId', async (request) => {
        const gamemodeId = routeParam(request, 'gamemodeId');
        if (!gamemodeId) return json({ error: 'gamemodeId is required' }, 400);
        const limit = Math.min(Math.max(Number(new URL(request.url).searchParams.get('limit') ?? 10), 1), 50);
        const entries = await bestTimes(gamemodeId, services, limit);
        return json({ gamemodeId, entries });
    });
}

export async function bestTimes(gamemodeId: string, services: LeaderboardServices, limit = 10): Promise<LeaderboardEntry[]> {
    if (process.env.DATABASE_URL && services.sql) {
        const rows = await services.sql<Array<{ player_id: string; best_time_ms: number; bucket: Date | string }>>`
            SELECT player_id, best_time_ms, bucket
            FROM best_time_leaderboards_hourly
            WHERE gamemode_id = ${gamemodeId}
            ORDER BY best_time_ms ASC, bucket ASC
            LIMIT ${limit}
        `;
        return rows.map(row => ({ playerId: row.player_id, bestTimeMs: Number(row.best_time_ms), completedAt: new Date(row.bucket).toISOString() }));
    }

    const events = await services.ledger.query({ type: 'gamemode_run_sample' });
    const byPlayer = new Map<string, LeaderboardEntry>();
    for (const event of events) {
        const payload = runSamplePayload(event);
        if (!payload || payload.gamemodeId !== gamemodeId || payload.reason !== 'finish') continue;
        const bestTimeMs = finishTimeMs(payload);
        if (!Number.isFinite(bestTimeMs)) continue;
        const completedAt = event.timestamp;
        const current = byPlayer.get(payload.playerId);
        if (!current || bestTimeMs < current.bestTimeMs || (bestTimeMs === current.bestTimeMs && completedAt < current.completedAt)) {
            byPlayer.set(payload.playerId, { playerId: payload.playerId, bestTimeMs, completedAt });
        }
    }
    return [...byPlayer.values()].sort((a, b) => a.bestTimeMs - b.bestTimeMs || a.completedAt.localeCompare(b.completedAt) || a.playerId.localeCompare(b.playerId)).slice(0, limit);
}

function routeParam(request: Request, key: string): string {
    if (!('params' in request)) return '';
    const params = Reflect.get(request, 'params');
    if (!params || typeof params !== 'object' || !(key in params)) return '';
    const value = Reflect.get(params, key);
    return typeof value === 'string' ? value : '';
}

function runSamplePayload(event: LedgerEvent): RunSamplePayload | null {
    const value = event.payload;
    if (!value || typeof value !== 'object') return null;
    if (!('gamemodeId' in value) || !('playerId' in value) || !('reason' in value) || !('samples' in value)) return null;
    const gamemodeId = value.gamemodeId;
    const playerId = value.playerId;
    const reason = value.reason;
    const samples = value.samples;
    if (typeof gamemodeId !== 'string' || typeof playerId !== 'string' || typeof reason !== 'string' || !Array.isArray(samples)) return null;
    const points: Array<{ t: number }> = [];
    for (const sample of samples) {
        if (!sample || typeof sample !== 'object' || !('t' in sample) || typeof sample.t !== 'number') return null;
        points.push({ t: sample.t });
    }
    return { gamemodeId, playerId, reason, samples: points };
}

function finishTimeMs(payload: RunSamplePayload): number {
    return payload.samples.reduce((best, sample) => Math.max(best, sample.t), 0);
}

function json(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}
