import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class InsufficientFundsError extends Error {
    constructor(public readonly accountId: string, public readonly balance: number, public readonly required: number) {
        super(`insufficient funds for ${accountId}: balance ${balance}, required ${required}`);
        this.name = 'InsufficientFundsError';
    }
}

export interface CurrencyInventoryService {
    getBalance(accountId: string): Promise<number> | number;
    grant(accountId: string, amount: number, reason: string): Promise<number> | number;
    spend(accountId: string, amount: number, reason: string): Promise<number> | number;
    listOwnedItems(accountId: string): Promise<string[]> | string[];
    grantOwnedItem(accountId: string, cosmeticId: string, reason: string): Promise<void> | void;
}

export interface LedgerEvent<TType extends string = string, TPayload = unknown> {
    id?: number;
    type: TType;
    entityId?: string;
    timestamp: string;
    payload: TPayload;
}

export interface LedgerQuery {
    type?: string;
    from?: string;
    to?: string;
    entityId?: string;
}

export interface EventLedgerStorage {
    append<TType extends string, TPayload>(event: Omit<LedgerEvent<TType, TPayload>, 'id'>): Promise<LedgerEvent<TType, TPayload>> | LedgerEvent<TType, TPayload>;
    query(query: LedgerQuery): Promise<LedgerEvent[]> | LedgerEvent[];
}

export interface SqliteBackendOptions {
    path?: string;
}

const defaultDbPath = 'data/lunarpup.db';

function openDatabase(path: string): Database {
    mkdirSync(dirname(path), { recursive: true });
    const db = new Database(path);
    db.exec(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS ledger_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            entity_id TEXT,
            timestamp TEXT NOT NULL,
            payload_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ledger_type_time ON ledger_events(type, timestamp);
        CREATE INDEX IF NOT EXISTS idx_ledger_entity_time ON ledger_events(entity_id, timestamp);
        CREATE TABLE IF NOT EXISTS balances (
            account_id TEXT PRIMARY KEY,
            balance INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS owned_items (
            account_id TEXT NOT NULL,
            cosmetic_id TEXT NOT NULL,
            granted_at TEXT NOT NULL,
            PRIMARY KEY (account_id, cosmetic_id)
        );
    `);
    return db;
}

export class SqliteEventLedgerStorage implements EventLedgerStorage {
    readonly db: Database;

    constructor(options: SqliteBackendOptions = {}) {
        this.db = openDatabase(options.path ?? defaultDbPath);
    }

    append<TType extends string, TPayload>(event: Omit<LedgerEvent<TType, TPayload>, 'id'>): LedgerEvent<TType, TPayload> {
        const timestamp = event.timestamp || new Date().toISOString();
        const result = this.db.query('INSERT INTO ledger_events (type, entity_id, timestamp, payload_json) VALUES ($type, $entityId, $timestamp, $payload)').run({
            $type: event.type,
            $entityId: event.entityId ?? null,
            $timestamp: timestamp,
            $payload: JSON.stringify(event.payload),
        });
        return { ...event, timestamp, id: Number(result.lastInsertRowid) };
    }

    query(query: LedgerQuery = {}): LedgerEvent[] {
        const clauses: string[] = [];
        const params: Record<string, string> = {};
        if (query.type) {
            clauses.push('type = $type');
            params.$type = query.type;
        }
        if (query.entityId) {
            clauses.push('entity_id = $entityId');
            params.$entityId = query.entityId;
        }
        if (query.from) {
            clauses.push('timestamp >= $from');
            params.$from = query.from;
        }
        if (query.to) {
            clauses.push('timestamp <= $to');
            params.$to = query.to;
        }
        const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
        const rows = this.db.query(`SELECT id, type, entity_id, timestamp, payload_json FROM ledger_events ${where} ORDER BY timestamp ASC, id ASC`).all(params) as Array<{ id: number; type: string; entity_id: string | null; timestamp: string; payload_json: string }>;
        return rows.map(row => ({ id: row.id, type: row.type, entityId: row.entity_id ?? undefined, timestamp: row.timestamp, payload: JSON.parse(row.payload_json) }));
    }
}

export class SqliteCurrencyInventoryService implements CurrencyInventoryService {
    readonly db: Database;
    readonly ledger: EventLedgerStorage;

    constructor(options: SqliteBackendOptions & { ledger?: EventLedgerStorage; db?: Database } = {}) {
        this.db = options.db ?? openDatabase(options.path ?? defaultDbPath);
        this.ledger = options.ledger ?? new SqliteEventLedgerStorage({ path: options.path ?? defaultDbPath });
    }

    getBalance(accountId: string): number {
        const row = this.db.query('SELECT balance FROM balances WHERE account_id = $accountId').get({ $accountId: accountId }) as { balance: number } | null;
        return row?.balance ?? 0;
    }

    grant(accountId: string, amount: number, reason: string): number {
        if (!Number.isInteger(amount) || amount <= 0) throw new Error('grant amount must be a positive integer');
        this.db.query(`
            INSERT INTO balances (account_id, balance) VALUES ($accountId, $amount)
            ON CONFLICT(account_id) DO UPDATE SET balance = balance + excluded.balance
        `).run({ $accountId: accountId, $amount: amount });
        const balance = this.getBalance(accountId);
        this.ledger.append({ type: 'currency_granted', entityId: accountId, timestamp: new Date().toISOString(), payload: { amount, reason, balance } });
        return balance;
    }

    spend(accountId: string, amount: number, reason: string): number {
        if (!Number.isInteger(amount) || amount <= 0) throw new Error('spend amount must be a positive integer');
        const balance = this.getBalance(accountId);
        if (balance < amount) throw new InsufficientFundsError(accountId, balance, amount);
        this.db.query('UPDATE balances SET balance = balance - $amount WHERE account_id = $accountId').run({ $accountId: accountId, $amount: amount });
        const nextBalance = balance - amount;
        this.ledger.append({ type: 'currency_spent', entityId: accountId, timestamp: new Date().toISOString(), payload: { amount, reason, balance: nextBalance } });
        return nextBalance;
    }

    listOwnedItems(accountId: string): string[] {
        const rows = this.db.query('SELECT cosmetic_id FROM owned_items WHERE account_id = $accountId ORDER BY cosmetic_id ASC').all({ $accountId: accountId }) as Array<{ cosmetic_id: string }>;
        return rows.map(row => row.cosmetic_id);
    }

    grantOwnedItem(accountId: string, cosmeticId: string, reason: string): void {
        const result = this.db.query('INSERT OR IGNORE INTO owned_items (account_id, cosmetic_id, granted_at) VALUES ($accountId, $cosmeticId, $grantedAt)').run({
            $accountId: accountId,
            $cosmeticId: cosmeticId,
            $grantedAt: new Date().toISOString(),
        });
        if (result.changes > 0) {
            this.ledger.append({ type: 'item_granted', entityId: accountId, timestamp: new Date().toISOString(), payload: { cosmeticId, reason } });
        }
    }
}
