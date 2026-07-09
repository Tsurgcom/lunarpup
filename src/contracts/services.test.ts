import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SQL } from 'bun';
import {
    createStorageServices,
    InsufficientFundsError,
    PostgresCurrencyInventoryService,
    PostgresEventLedgerStorage,
    SqliteCurrencyInventoryService,
    SqliteEventLedgerStorage,
    type CurrencyInventoryService,
    type EventLedgerStorage,
} from './services.ts';
import { runMigrations } from '../../scripts/migrate.ts';

const dbPaths: string[] = [];
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
let postgresSql: SQL | undefined;

function tempDbPath(name: string): string {
    const path = join(tmpdir(), `lunarpup-${name}-${crypto.randomUUID()}.db`);
    dbPaths.push(path, `${path}-shm`, `${path}-wal`);
    return path;
}

async function resetPostgres(sql: SQL): Promise<void> {
    await sql`TRUNCATE agent_events, economy_ledger, run_samples, balances, owned_items RESTART IDENTITY CASCADE`;
}

afterEach(() => {
    for (const path of dbPaths.splice(0)) {
        if (existsSync(path)) rmSync(path, { force: true });
    }
});

beforeAll(async () => {
    if (!testDatabaseUrl) return;
    await runMigrations(testDatabaseUrl);
    postgresSql = new SQL(testDatabaseUrl);
});

afterAll(async () => {
    await postgresSql?.close();
});

describe('storage factory', () => {
    test('defaults to sqlite when DATABASE_URL is unset', () => {
        const previous = process.env.DATABASE_URL;
        delete process.env.DATABASE_URL;
        try {
            const services = createStorageServices({ sqlite: { path: tempDbPath('factory') } });
            expect(services.backend).toBe('sqlite');
            expect(services.currencyInventory).toBeInstanceOf(SqliteCurrencyInventoryService);
            expect(services.eventLedger).toBeInstanceOf(SqliteEventLedgerStorage);
        } finally {
            if (previous === undefined) delete process.env.DATABASE_URL;
            else process.env.DATABASE_URL = previous;
        }
    });
});

type StorageFactory = () => Promise<{ ledger: EventLedgerStorage; service: CurrencyInventoryService }>;

function runServiceSuite(name: string, factory: StorageFactory): void {
    describe(name, () => {
        test('appends typed events and queries by type and time range', async () => {
            const { ledger } = await factory();
            await ledger.append({ type: 'currency_granted', entityId: 'player-1', timestamp: '2026-07-09T10:00:00.000Z', payload: { amount: 10 } });
            await ledger.append({ type: 'item_granted', entityId: 'player-1', timestamp: '2026-07-09T11:00:00.000Z', payload: { cosmeticId: 'board-1' } });
            await ledger.append({ type: 'currency_granted', entityId: 'player-2', timestamp: '2026-07-09T12:00:00.000Z', payload: { amount: 5 } });

            const currencyEvents = await ledger.query({ type: 'currency_granted', from: '2026-07-09T09:30:00.000Z', to: '2026-07-09T11:30:00.000Z' });
            expect(currencyEvents).toHaveLength(1);
            expect(currencyEvents[0]?.entityId).toBe('player-1');
            expect(currencyEvents[0]?.payload).toEqual({ amount: 10 });
        });

        test('grants, spends, rejects insufficient funds, and lists owned cosmetics', async () => {
            const { ledger, service } = await factory();

            expect(await service.getBalance('player-1')).toBe(0);
            expect(await service.grant('player-1', 100, 'test grant')).toBe(100);
            expect(await service.spend('player-1', 35, 'test spend')).toBe(65);
            let insufficientFundsError: unknown;
            try {
                await service.spend('player-1', 100, 'too much');
            } catch (error) {
                insufficientFundsError = error;
            }
            expect(insufficientFundsError).toBeInstanceOf(InsufficientFundsError);

            await service.grantOwnedItem('player-1', 'moon-board', 'test item');
            await service.grantOwnedItem('player-1', 'moon-board', 'duplicate item');
            await service.grantOwnedItem('player-1', 'comet-trail', 'test item');
            expect(await service.listOwnedItems('player-1')).toEqual(['comet-trail', 'moon-board']);

            const events = await ledger.query({ entityId: 'player-1' });
            expect(events.map(event => event.type)).toEqual(['currency_granted', 'currency_spent', 'item_granted', 'item_granted']);
        });
    });
}

runServiceSuite('sqlite storage services', async () => {
    const path = tempDbPath('sqlite-suite');
    const ledger = new SqliteEventLedgerStorage({ path });
    const service = new SqliteCurrencyInventoryService({ path, ledger });
    return { ledger, service };
});

if (testDatabaseUrl) {
    runServiceSuite('postgres storage services', async () => {
        if (!postgresSql) throw new Error('postgres test connection was not initialized');
        await resetPostgres(postgresSql);
        const ledger = new PostgresEventLedgerStorage({ sql: postgresSql });
        const service = new PostgresCurrencyInventoryService({ sql: postgresSql, ledger });
        return { ledger, service };
    });

    describe('postgres storage factory', () => {
        test('uses postgres when DATABASE_URL is set', () => {
            if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required');
            const services = createStorageServices({ postgres: { url: testDatabaseUrl } });
            expect(services.backend).toBe('postgres');
            expect(services.currencyInventory).toBeInstanceOf(PostgresCurrencyInventoryService);
            expect(services.eventLedger).toBeInstanceOf(PostgresEventLedgerStorage);
        });
    });
} else {
    describe.skip('postgres storage services', () => {
        test('skips when TEST_DATABASE_URL is unset', () => {});
    });
}
