#!/usr/bin/env bun
/**
 * Dev-only moon bones faucet for local testing.
 *
 *   bun scripts/dev-grant.ts                  # top up EVERY known account to 1,000,000
 *   bun scripts/dev-grant.ts pup-abc123       # top up one account
 *   bun scripts/dev-grant.ts pup-abc123 5000  # grant an exact amount
 *
 * Writes through the same sqlite service the server uses (data/lunarpup.db),
 * so the running dev server sees the balance immediately. Never ship this
 * against a production database — it exists for local testing only.
 */
import { Database } from 'bun:sqlite';
import { SqliteCurrencyInventoryService } from '../src/contracts/services.ts';

const DEFAULT_TOP_UP = 1_000_000;
const dbPath = process.env.LUNARPUP_DB ?? 'data/lunarpup.db';
const [accountArg, amountArg] = process.argv.slice(2);

const service = new SqliteCurrencyInventoryService({ dbPath });

function grantTo(accountId: string, amount: number): void {
    const balance = service.grant(accountId, amount, 'dev-grant faucet');
    console.log(`${accountId}: +${amount} → balance ${balance}`);
}

if (accountArg) {
    grantTo(accountArg, amountArg ? Number(amountArg) : DEFAULT_TOP_UP);
} else {
    const db = new Database(dbPath);
    const rows = db.query<{ account_id: string }, []>('SELECT account_id FROM balances').all();
    const known = new Set(rows.map(row => row.account_id));
    // Accounts that only ever browsed (no balance row yet) appear in the ledger.
    try {
        for (const row of db.query<{ entity_id: string }, []>("SELECT DISTINCT entity_id FROM ledger_events WHERE entity_id LIKE 'pup-%'").all()) {
            known.add(row.entity_id);
        }
    } catch {
        // ledger table name may differ; balances alone is fine
    }
    if (known.size === 0) {
        console.log('No accounts found yet — open the game once, then rerun (or pass an account id).');
    } else {
        for (const accountId of known) grantTo(accountId, DEFAULT_TOP_UP);
    }
}
