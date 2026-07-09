STATUS: in-progress
PRIORITY: P0
COMPLEXITY: medium
TOUCHES: src/contracts/, src/server.ts, src/game/loop.ts, src/storage/
BLOCKED_BY: —

# 01 — Foundation: contracts, router, hooks, storage

Shared seams every other concern builds against, plus the three baseline tsc fixes.

- `src/contracts/`: agent-event protocol (session_start / status / needs_input / done),
  content-addressed package manifest (sha256 id, kind cosmetic|gamemode), cosmetic schema
  (slot board|body|trail|aura, rarity), gamemode interface (init/start/tick/end, scoring,
  checkpoints), room/lobby protocol, currency+inventory service, append-only event ledger.
- `bun:sqlite` default backend (`data/lunarpup.db`, gitignored); interfaces swappable for
  Postgres/TimescaleDB later.
- `src/server.ts` → modular router (WS channel dispatch + HTTP route registration);
  existing multiplayer flow unchanged.
- `src/game/loop.ts` → `registerUpdateHook` + current-gamemode slot.
- Fix baseline tsc errors in player.ts, remotePlayers.ts, server.ts.

DONE WHEN: `bun install && bunx tsc --noEmit && bun test` green; docs/architecture.md
describes each contract; no feature code.

DISPATCHED: foundation-contracts-mrdywtuf-1-fb3205d7
