STATUS: closed
PRIORITY: P2
COMPLEXITY: medium
TOUCHES: src/lootbox/, src/ui/lootbox/
BLOCKED_BY: 03

# 08 — Lootboxes (disclosed odds, audited)

Server-authoritative lootboxes over the cosmetic pools. Odds are public and every roll is
auditable — that's both the ethical bar and the regulatory mitigation.

- Server-side RNG (crypto.getRandomValues / seeded commit-reveal), rarity-weighted pools
  from the cosmetic registry; duplicate → currency refund.
- `GET /lootbox/odds`: published per-rarity odds; every roll appended to the economy
  ledger (box id, seed commitment, result).
- Opening UI + animation; spend via currency service.
- Regulatory note in docs: token-purchasable boxes require region gating + counsel before
  mainnet; devnet/soft-currency until then.

DONE WHEN: 10k simulated rolls match published odds within tolerance in a test; ledger has
one entry per roll; insufficient funds cleanly rejected; tsc+tests green.

## Resolution

landed 54678e5+54402bc (server rolls, disclosed odds, ledger audit, shop UI; PR #14); browser-verified
