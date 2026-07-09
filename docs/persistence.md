# Persistence backends

Lunar Pup has two persistence backends behind the same contracts in `src/contracts/services.ts`.

## SQLite default

SQLite is the offline/default backend. If `DATABASE_URL` is unset, `createStorageServices()` returns:

- `SqliteEventLedgerStorage`
- `SqliteCurrencyInventoryService`

The database file defaults to `data/lunarpup.db`. Tests use temporary SQLite files, so `bun test` stays offline and does not require Docker or Postgres.

## TimescaleDB/Postgres backend

Set `DATABASE_URL` to select the Postgres implementation:

```sh
export DATABASE_URL=postgres://lunarpup:lunarpup@localhost:5432/lunarpup
bun run db:migrate
```

`createStorageServices()` then returns:

- `PostgresEventLedgerStorage`, storing append-only ledger events in the `agent_events` hypertable.
- `PostgresCurrencyInventoryService`, storing account balances, owned cosmetics, and economy facts in `balances`, `owned_items`, and the `economy_ledger` hypertable.

The migration in `db/migrations/001_timescale_persistence.sql` creates:

- `agent_events`: general event ledger hypertable for the `EventLedgerStorage` contract.
- `run_samples`: gamemode completion samples for leaderboard analytics.
- `economy_ledger`: currency and item grant/spend facts.
- `best_time_leaderboards_hourly`: continuous aggregate with hourly best times per gamemode.
- `lootbox_drop_rates_hourly`: continuous aggregate inputs for hourly lootbox drop-rate stats.

## Local TimescaleDB

Start the database:

```sh
docker compose up -d timescaledb
```

Run migrations:

```sh
DATABASE_URL=postgres://lunarpup:lunarpup@localhost:5432/lunarpup bun run db:migrate
```

Run Postgres integration tests:

```sh
TEST_DATABASE_URL=postgres://lunarpup:lunarpup@localhost:5432/lunarpup bun test src/contracts/services.test.ts
```

If `TEST_DATABASE_URL` is unset, the Postgres tests are skipped cleanly and the SQLite suite still runs.
