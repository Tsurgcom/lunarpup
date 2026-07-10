# 17 — Define an authenticated reward-bearing run lifecycle
STATUS: open
PRIORITY: p0
REPOS: lunarpup
COMPLEXITY: architectural
TOUCHES: src/contracts/gamemode.ts, src/modes/client.ts, src/server/gamemodes.ts, src/server/runLifecycle.ts, src/contracts/services.ts, db/migrations/, src/server/runLifecycle.test.ts, src/modes/replayRun.test.ts, docs/run-integrity.md
BLOCKED_BY: 16

## Goal

Represent a reward-bearing run as one authenticated lifecycle with enough integrity to prevent replay and obvious fabrication without claiming cheat-proof simulation.

## Approach

Tie every run to the authenticated guest principal and a server-issued run ID. Model explicit states: started, active, finished, rewarded, abandoned, and expired. Permit at most one active reward-bearing run for the launch mode per principal. Record server start/finish times, mode/version, accepted samples, outcome, and terminal reason.

The server accepts finish only for an active, unexpired run whose duration, distance, score, and sample progression fall within documented plausible bounds for the proven mode. Repeated finish for the same run returns its immutable outcome rather than appending another result. Disconnect/reconnect may resume within a bounded window; starting another run abandons or rejects the prior run according to one documented rule.

Keep anti-cheat language modest. These checks protect the soft-currency ledger from trivial replay and impossible submissions; they do not make the browser simulation authoritative or qualify competitive rankings.

Expose a narrow reward-command input for concern 18, but do not mutate currency here. The accepted run outcome is the sole evidence an economy reward command may consume.

## Cross-Repo Side Effects

None.

## Verify

- `bun test src/server/runLifecycle.test.ts` passes as the fast blocker check for economy work.
- Tests cover missing auth, duplicate start, two active runs, reconnect resume, abandonment, expiry, implausible duration/distance/score, duplicate finish, and immutable outcome replay.
- Every stored run derives its principal from authentication; body identifiers cannot redirect ownership.
- The proven client mode completes and retries through the lifecycle without changing its control/score behavior.
- Run state feedback and recovery meet the shared response, accessibility, and no-unexplained-wait budgets.
- `bun run typecheck`, `bun test`, and `bun run smoke` pass.
