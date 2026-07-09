import { Database } from 'bun:sqlite';
import { createConnection, type Socket } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteCurrencyInventoryService, SqliteEventLedgerStorage } from '../src/contracts/services.ts';

const port = 41_000 + Math.floor(Math.random() * 10_000);
const token = `smoke-${crypto.randomUUID()}`;
const dir = mkdtempSync(join(tmpdir(), 'lunarpup-smoke-'));
const dbPath = join(dir, 'smoke.db');
const base = `http://localhost:${port}`;
const accountId = `smoke-${crypto.randomUUID().slice(0, 8)}`;
const proc = Bun.spawn(['bun', 'src/server.ts'], { env: { ...process.env, PORT: String(port), AGENT_EVENT_TOKEN: token, TEST_DATABASE_URL: dbPath, EXTENSIONS: 'agent-harness' }, stdout: 'inherit', stderr: 'inherit' });

try {
    await waitForServer();
    const ledger = new SqliteEventLedgerStorage({ path: dbPath });
    new SqliteCurrencyInventoryService({ path: dbPath, ledger }).grant(accountId, 1_000, 'smoke funds');
    await smokeAgentEventOwnerDelivery();
    await smokeRooms();
    const boughtId = await smokeCosmetics();
    await smokeLootboxLedger();
    await smokeLeaderboard();
    console.log(`smoke ok: account=${accountId} bought=${boughtId}`);
} finally {
    proc.kill();
    await proc.exited.catch(() => undefined);
    rmSync(dir, { recursive: true, force: true });
}

async function waitForServer(): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < 10_000) {
        try { if ((await fetch(`${base}/rooms`)).ok) return; } catch { await Bun.sleep(100); }
    }
    throw new Error('server did not start');
}

async function smokeAgentEventOwnerDelivery(): Promise<void> {
    const ws = await RawWs.connect(port);
    ws.send({ channel: 'agent-events', type: 'subscribe', ownerKey: 'owner-a' });
    const response = await fetch(`${base}/agent/event`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ type: 'agent_status', harness: 'smoke', sessionId: 'smoke-session', project: 'lunarpup', message: 'owner delivery', timestamp: new Date().toISOString(), ownerKey: 'owner-a' }) });
    if (response.status !== 202) throw new Error(`agent event failed ${response.status}`);
    await Bun.sleep(50);
    ws.close();
    assertLedgerEvent('agent_status');
}

async function smokeRooms(): Promise<void> {
    const host = await RawWs.connect(port);
    const guest = await RawWs.connect(port);
    host.send({ channel: 'room', type: 'create_room', roomId: 'smoke-room', gamemodeId: 'checkpoint-race', playerId: 'host' });
    await Bun.sleep(50);
    guest.send({ channel: 'room', type: 'join_room', roomId: 'smoke-room', playerId: 'guest' });
    await Bun.sleep(50);
    const rooms = await getJson<{ rooms: Array<{ roomId: string; playerCount: number }> }>('/rooms');
    const room = rooms.rooms.find(entry => entry.roomId === 'smoke-room');
    if (!room || room.playerCount < 1) throw new Error('room create/join smoke failed');
    host.close(); guest.close();
}

async function smokeCosmetics(): Promise<string> {
    const catalog = await getJson<{ catalog: Array<{ id: string; definition: { slot: string }; price: number }> }>('/api/cosmetics/catalog');
    const item = catalog.catalog.find(entry => entry.price > 0);
    if (!item) throw new Error('no priced cosmetic in catalog');
    const buy = await postJson<{ ownedIds: string[] }>('/api/cosmetics/buy', { accountId, cosmeticId: item.id });
    if (!buy.ownedIds.includes(item.id)) throw new Error('cosmetic buy did not grant ownership');
    const equip = await postJson<{ equipped: Record<string, string> }>('/api/cosmetics/equip', { accountId, cosmeticId: item.id, slot: item.definition.slot });
    if (equip.equipped[item.definition.slot] !== item.id) throw new Error('cosmetic equip did not persist');
    return item.id;
}

async function smokeLootboxLedger(): Promise<void> {
    const result = await postJson<{ result: { cosmeticId: string } }>('/lootbox/open', { accountId, box: 'moon-crate' });
    if (!result.result.cosmeticId) throw new Error('lootbox did not return cosmetic');
    assertLedgerEvent('lootbox_roll');
}

async function smokeLeaderboard(): Promise<void> {
    const ws = await RawWs.connect(port);
    ws.send({ channel: 'gamemode', type: 'run_sample', gamemodeId: 'smoke-race', playerId: accountId, reason: 'finish', samples: [{ t: 1234, x: 0, y: 0, z: 0, speed: 1 }] });
    await Bun.sleep(50);
    ws.close();
    const leaderboard = await getJson<{ entries: Array<{ playerId: string; bestTimeMs: number }> }>('/leaderboard/smoke-race');
    const entry = leaderboard.entries.find(value => value.playerId === accountId);
    if (!entry || entry.bestTimeMs !== 1234) throw new Error('leaderboard did not read finish sample');
}

function assertLedgerEvent(type: string): void { const db = new Database(dbPath, { readonly: true }); const row = db.query<{ count: number }, [string]>('SELECT count(*) AS count FROM ledger_events WHERE type = ?').get(type); db.close(); if (!row || row.count < 1) throw new Error(`${type} ledger event missing`); }
async function getJson<T>(path: string): Promise<T> { const r = await fetch(`${base}${path}`); if (!r.ok) throw new Error(`${path} failed ${r.status}`); return await r.json() as T; }
async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> { const r = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const p = await r.json(); if (!r.ok) throw new Error(`${path} failed ${r.status}: ${JSON.stringify(p)}`); return p as T; }

class RawWs {
    private constructor(private readonly socket: Socket) { }
    static async connect(port: number): Promise<RawWs> {
        const socket = createConnection({ host: 'localhost', port });
        const key = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
        const { promise, resolve, reject } = Promise.withResolvers<void>();
        let handshake = Buffer.alloc(0);
        socket.on('connect', () => socket.write(`GET / HTTP/1.1\r\nHost: localhost:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
        socket.on('data', chunk => { handshake = Buffer.concat([handshake, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]); const end = handshake.indexOf('\r\n\r\n'); if (end === -1) return; const head = handshake.subarray(0, end).toString(); socket.removeAllListeners('data'); if (!head.includes('101 Switching Protocols')) reject(new Error(`websocket handshake failed: ${head}`)); else resolve(); });
        socket.on('error', reject);
        await promise;
        return new RawWs(socket);
    }
    send(value: unknown): void {
        const payload = Buffer.from(JSON.stringify(value));
        const mask = crypto.getRandomValues(new Uint8Array(4));
        const header = payload.length < 126 ? Buffer.from([0x81, 0x80 | payload.length]) : Buffer.from([0x81, 0x80 | 126, payload.length >> 8, payload.length & 0xff]);
        const masked = Buffer.alloc(payload.length);
        for (let i = 0; i < payload.length; i += 1) masked[i] = payload[i]! ^ mask[i % 4]!;
        this.socket.write(Buffer.concat([header, Buffer.from(mask), masked]));
    }
    close(): void { this.socket.end(); }
}
