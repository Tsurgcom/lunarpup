STATUS: closed
PRIORITY: P2
COMPLEXITY: medium
TOUCHES: src/storage/timescale/, docker-compose.yml, db/migrations/
BLOCKED_BY: 01

# 07 — TimescaleDB persistence adapter

Production analytics backend behind the foundation's storage interfaces. sqlite remains the
zero-setup dev default; Timescale is opt-in via env.

- Postgres/TimescaleDB adapter for the event-ledger + service interfaces (pg via `Bun.sql`
  or postgres.js), selected by `DATABASE_URL`.
- docker-compose.yml with timescaledb image; migrations creating hypertables:
  `agent_events` (harness telemetry), `run_samples` (gamemode runs → ghost replays),
  `economy_ledger` (currency/lootbox/NFT events — the drop-rate audit trail).
- Continuous aggregates: leaderboards (best times per mode) and lootbox drop-rate stats.
- Graceful skip: Timescale integration tests only run when a test DATABASE_URL is present.

DONE WHEN: same test suite passes against sqlite and (when available) Timescale; compose
boots a working stack; aggregates return leaderboard + drop-rate rows; tsc+tests green.

## Resolution

landed 0428f6c+a7218c2 (pg adapter, compose, hypertables, aggregates; PR #8)
