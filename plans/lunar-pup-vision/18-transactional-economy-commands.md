# 18 — Make economy commands transactional and replay-safe
STATUS: open
PRIORITY: p0
REPOS: lunarpup
COMPLEXITY: architectural
TOUCHES: src/contracts/services.ts, src/server/economyCommands.ts, src/server/cosmetics.ts, src/server/lootbox.ts, src/server/gamemodes.ts, db/migrations/, src/server/economyCommands.test.ts, src/contracts/services.test.ts, docs/economy-commands.md
BLOCKED_BY: 17

## Goal

Ensure reward, direct acquisition, earned-crate open, and equip either commit completely once or return the original committed result after a retry.

## Approach

Create one economy command boundary shared by SQLite and Postgres adapters. Every command is authorized by the guest principal and carries a client operation ID protected by a database uniqueness constraint. Store the operation type, principal, normalized input hash, terminal result, resulting balance, and ledger linkage.

`src/contracts/services.ts` is the current concrete owner of both SQLite and Postgres adapters. Concern 13 must update this `TOUCHES` mapping before execution if convergence moves those implementations; the concern then edits the landed concrete adapter paths, not only their interfaces.

Reward consumes one eligible finished run and reward kind. Direct acquisition atomically checks balance, spends, grants ownership, and records ledger facts. Earned-crate open atomically consumes the earned entitlement, records the chosen result, applies duplicate/pity policy, grants ownership or full compensation, and records resulting balance. Equip atomically validates ownership/slot compatibility and replaces the canonical loadout as one event. A repeated operation ID with identical input returns the stored result; conflicting input is rejected.

Inject failures between every logical step and prove rollback. Do not place wallet, token, or NFT side effects inside these commands; those features remain disabled and require a future outbox/compensation design.

Define stable machine error codes at the boundary and map them to human recovery copy in later UI. Raw storage or RPC errors never cross to players.

## Cross-Repo Side Effects

Postgres deployments require the corresponding migration before the new commands are enabled.

## Verify

- `bun test src/server/economyCommands.test.ts src/contracts/services.test.ts` passes as the fast blocker check for the first-session loop.
- Reward, buy, open, and equip replay the original result without additional spend, entitlement use, ownership, loadout, or ledger facts.
- Conflicting reuse of an operation ID is rejected and logged.
- Failure injection at each step leaves the full committed result or no mutation in both SQLite and Postgres.
- Concurrent commands cannot overspend, double-reward a run, consume one crate twice, or partially equip a loadout.
- Stable errors include exact balance/shortfall or recovery metadata without exposing raw internals.
- `bun run typecheck`, `bun test`, and `bun run smoke` pass.
