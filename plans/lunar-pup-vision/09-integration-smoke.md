STATUS: open
PRIORITY: P1
COMPLEXITY: medium
TOUCHES: cross-cutting, README.md, docs/
BLOCKED_BY: 03, 05, 07, 08

# 09 — Integration, docs, end-to-end smoke

Wire the verticals together and prove the whole thing live.

- Shop accepts SPL token payments (devnet) alongside soft currency.
- Lootbox drops / shop purchases of NFT-backed cosmetics mint via the Solana layer.
- Leaderboards UI fed from the ledger (sqlite or Timescale aggregates).
- README + docs/ + AGENTS.md updated for every new flag, endpoint, adapter, and script.
- Live smoke on main: boot server, curl a fake harness event → notification fires, run a
  race, open a lootbox, devnet wallet round-trip.

DONE WHEN: smoke passes end-to-end on main; full tsc+test green; docs shipped.
