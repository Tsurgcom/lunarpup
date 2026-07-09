import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCosmeticCatalog } from '../cosmetics/registry.ts';
import { createLootboxServices, LOOTBOX_DUPLICATE_REFUND, LOOTBOX_ODDS, LOOTBOX_PRICE, openLootbox, publicOddsPayload, registerLootboxModule, rollRarity, type RandomBytes } from './lootbox.ts';
import { ModularRouter } from './router.ts';

const cleanupPaths: string[] = [];

afterEach(() => {
    for (const path of cleanupPaths.splice(0)) {
        if (existsSync(path)) rmSync(path, { recursive: true, force: true });
    }
});

describe('lootbox odds', () => {
    test('10000-roll simulation matches published odds within two percentage points', () => {
        const counts = { common: 0, rare: 0, epic: 0, legendary: 0 };
        const rolls = 10_000;
        for (let index = 0; index < rolls; index += 1) {
            counts[rollRarity(seedForUnit((index + 0.5) / rolls, 0))] += 1;
        }

        for (const rarity of ['common', 'rare', 'epic', 'legendary'] as const) {
            const observed = counts[rarity] / rolls;
            expect(Math.abs(observed - LOOTBOX_ODDS[rarity])).toBeLessThanOrEqual(0.02);
        }
        expect(publicOddsPayload().odds).toEqual(LOOTBOX_ODDS);
        expect(publicOddsPayload().price).toBe(LOOTBOX_PRICE);
    });
});

describe('lootbox server module', () => {
    test('ledger gets one lootbox entry per successful roll', async () => {
        const dbPath = tempDbPath('ledger');
        const services = createLootboxServices(dbPath);
        services.currency.grant('acct-ledger', LOOTBOX_PRICE * 3, 'test funds');
        const random = sequenceRandom([seedForUnit(0.01, 0.01), seedForUnit(0.72, 0.25), seedForUnit(0.93, 0.5)]);

        await openLootbox('acct-ledger', services, random);
        await openLootbox('acct-ledger', services, random);
        await openLootbox('acct-ledger', services, random);

        const events = await services.ledger.query({ type: 'lootbox_roll', entityId: 'acct-ledger' });
        expect(events).toHaveLength(3);
        for (const event of events) {
            expect(event.payload).toMatchObject({ box: 'moon-crate', cost: LOOTBOX_PRICE });
        }
    });

    test('insufficient funds are rejected cleanly', async () => {
        const dbPath = tempDbPath('funds');
        const services = createLootboxServices(dbPath);
        services.currency.grant('acct-poor', LOOTBOX_PRICE - 1, 'test funds');
        const router = new ModularRouter<unknown>();
        registerLootboxModule(router, services, sequenceRandom([seedForUnit(0.01, 0.01)]));

        const response = await route(router, jsonRequest('http://localhost/lootbox/open', { accountId: 'acct-poor' }));
        const payload = await response.json();

        expect(response.status).toBe(402);
        expect(payload).toEqual({ error: 'insufficient_funds', balance: LOOTBOX_PRICE - 1, required: LOOTBOX_PRICE });
        expect(await services.ledger.query({ type: 'lootbox_roll', entityId: 'acct-poor' })).toHaveLength(0);
    });

    test('duplicate rolls refund the documented amount', async () => {
        const dbPath = tempDbPath('duplicate');
        const services = createLootboxServices(dbPath);
        const catalog = await loadCosmeticCatalog();
        const expected = catalog.find(item => item.definition.rarity === 'common');
        if (!expected) throw new Error('test catalog needs a common cosmetic');
        services.currency.grant('acct-dupe', LOOTBOX_PRICE, 'test funds');
        services.currency.grantOwnedItem('acct-dupe', expected.id, 'preowned fixture');

        const result = await openLootbox('acct-dupe', services, sequenceRandom([seedForUnit(0.01, 0.01)]));

        expect(result.result.cosmeticId).toBe(expected.id);
        expect(result.result.duplicate).toBe(true);
        expect(result.refund).toBe(LOOTBOX_DUPLICATE_REFUND);
        expect(await services.currency.getBalance('acct-dupe')).toBe(LOOTBOX_DUPLICATE_REFUND);
        const events = await services.ledger.query({ type: 'lootbox_roll', entityId: 'acct-dupe' });
        expect(events).toHaveLength(1);
        expect(events[0]?.payload).toMatchObject({ refund: LOOTBOX_DUPLICATE_REFUND, result: { duplicate: true } });
    });
});

function tempDbPath(label: string): string {
    const dbPath = join(tmpdir(), `lunarpup-lootbox-${label}-${crypto.randomUUID()}.db`);
    cleanupPaths.push(dbPath, `${dbPath}-shm`, `${dbPath}-wal`);
    return dbPath;
}

function sequenceRandom(seeds: Uint8Array[]): RandomBytes {
    let index = 0;
    return (length: number) => {
        const seed = seeds[index] ?? seeds.at(-1);
        index += 1;
        if (!seed) throw new Error('seed sequence is empty');
        if (seed.length === length) return seed;
        return seed.slice(0, length);
    };
}

function seedForUnit(rarityUnit: number, itemUnit: number): Uint8Array {
    const bytes = new Uint8Array(32);
    writeUnit(bytes, 0, rarityUnit);
    writeUnit(bytes, 8, itemUnit);
    return bytes;
}

function writeUnit(bytes: Uint8Array, offset: number, value: number): void {
    const integer = BigInt(Math.floor(value * Number.MAX_SAFE_INTEGER)) << 11n;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setUint32(offset, Number(integer >> 32n));
    view.setUint32(offset + 4, Number(integer & 0xffffffffn));
}

async function route(router: ModularRouter<unknown>, request: Request): Promise<Response> {
    const response = await router.handleHttp(request, { server: {} as never, upgrade: () => false });
    if (!response) throw new Error('route was not handled');
    return response;
}

function jsonRequest(url: string, body: Record<string, string>): Request {
    return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
