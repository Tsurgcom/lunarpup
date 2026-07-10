STATUS: open
PRIORITY: P0
COMPLEXITY: medium
TOUCHES: merge of origin/main (#19 E2E relay, #25 CI, #26 R3F consolidation) into integration main; src/game/, src/r3f-shell/, netlify/
BLOCKED_BY: 12 (panel-redesign)

# 13 — Refresh the integration branch against upstream tip

Upstream merged past #27's base: #19/#5 (E2E-encrypted blind relay + hardening),
#25 (GitHub Actions verify + Netlify deploy), #26 (legacy removal, new src/game
structure: runtime.ts, simulation.ts, camera.ts, dogTint.ts, remotePlayerMotion.ts,
types.ts), and #1 (roadmap docs — now canon upstream; reconcile doc divergence).

Work: merge origin/main into integration main after the panel redesign lands; combine
both sides (expect conflicts in src/game/* against our stepGameFrame port and in
multiplayer files against the encrypted relay); keep cosmetics rendering client-side —
with the blind relay the server cannot read snapshots, so any server-side cosmetic
validation must use the inventory API (documented in docs/MERGE-ORDER.md and PR #28).
Then force-push the refreshed branch to PR #27 and comment that it is green against tip.

DONE WHEN: gate + smoke green on the merged result; CI (Actions verify) green on #27;
browser check passes; #27 comment posted.
