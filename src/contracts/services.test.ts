import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { InsufficientFundsError, SqliteCurrencyInventoryService, SqliteEventLedgerStorage } from './services.ts';

const dbPaths: string[] = [];

function tempDbPath(name: string): string {
    const path = join(tmpdir(), `lunarpup-${name}-${crypto.randomUUID()}.db`);
    dbPaths.push(path, `${path}-shm`, `${path}-wal`);
    return path;
}

afterEach(() => {
    for (const path of dbPaths.splice(0)) {
        if (existsSync(path)) rmSync(path, { force: true });
    }
});

describe('sqlite event ledger', () => {
    test('appends typed events and queries by type and time range', () => {
        const ledger = new SqliteEventLedgerStorage({ path: tempDbPath('ledger') });
        ledger.append({ type: 'currency_granted', entityId: 'player-1', timestamp: '2026-07-09T10:00:00.000Z', payload: { amount: 10 } });
        ledger.append({ type: 'item_granted', entityId: 'player-1', timestamp: '2026-07-09T11:00:00.000Z', payload: { cosmeticId: 'board-1' } });
        ledger.append({ type: 'currency_granted', entityId: 'player-2', timestamp: '2026-07-09T12:00:00.000Z', payload: { amount: 5 } });

        const currencyEvents = ledger.query({ type: 'currency_granted', from: '2026-07-09T09:30:00.000Z', to: '2026-07-09T11:30:00.000Z' });
        expect(currencyEvents).toHaveLength(1);
        expect(currencyEvents[0]?.entityId).toBe('player-1');
        expect(currencyEvents[0]?.payload).toEqual({ amount: 10 });
    });
});

describe('sqlite currency inventory service', () => {
    test('grants, spends, rejects insufficient funds, and lists owned cosmetics', () => {
        const path = tempDbPath('inventory');
        const ledger = new SqliteEventLedgerStorage({ path });
        const service = new SqliteCurrencyInventoryService({ path, ledger });

        expect(service.getBalance('player-1')).toBe(0);
        expect(service.grant('player-1', 100, 'test grant')).toBe(100);
        expect(service.spend('player-1', 35, 'test spend')).toBe(65);
        expect(() => service.spend('player-1', 100, 'too much')).toThrow(InsufficientFundsError);

        service.grantOwnedItem('player-1', 'moon-board', 'test item');
        service.grantOwnedItem('player-1', 'moon-board', 'duplicate item');
        service.grantOwnedItem('player-1', 'comet-trail', 'test item');
        expect(service.listOwnedItems('player-1')).toEqual(['comet-trail', 'moon-board']);

        const events = ledger.query({ entityId: 'player-1' });
        expect(events.map(event => event.type)).toEqual(['currency_granted', 'currency_spent', 'item_granted', 'item_granted']);
    });
});
