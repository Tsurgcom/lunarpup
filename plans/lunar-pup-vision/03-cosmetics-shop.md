STATUS: open
PRIORITY: P1
COMPLEXITY: medium
TOUCHES: src/packages/, src/ui/shop/, src/game/player.ts, src/game/remotePlayers.ts, content/cosmetics/
BLOCKED_BY: 01

# 03 — Cosmetics system, shop, inventory

Data-driven cosmetics as content-addressed packages (mod-like, shareable), applied to local
and remote players, purchasable in a shop backed by the currency/inventory service.

- Package loader + registry (validate manifest, verify sha256 id, load assets).
- Starter cosmetic set across slots (board, body, trail, aura) and rarities.
- Shop UI (browse, preview, buy with soft currency); inventory + equip persistence.
- Equipped cosmetics sync over multiplayer protocol so remote players render them.

DONE WHEN: buying + equipping a cosmetic persists across reload and renders on a remote
player in tests; package with tampered hash is rejected; tsc+tests green.
