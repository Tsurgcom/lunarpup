STATUS: in-progress
PRIORITY: P0
COMPLEXITY: high
TOUCHES: merge of origin/main (consolidation d22a91c + E2E relay + CI) into integration main
BLOCKED_BY: —

# 13 — Sync upstream consolidation + E2E relay into integration main

Upstream merged: our roadmap PR #1, E2E-encrypted multiplayer relay (netlify/* +
src/net/crypto.ts), CI workflow (#25), relay hardening (#19), and d22a91c "remove legacy
transitional code and consolidate on R3F runtime" — which DELETED files our chain
modifies and moved their logic into new modules
(src/game/{runtime,simulation,camera,types,remotePlayerMotion,dogTint}.ts).

## Verified conflict map (from a live `git merge origin/main`, base 7a0bfc4)

**Modify/delete (upstream deleted, we modified — RE-ATTACH our delta in their new home,
then `git rm` the old file):**
- `src/game/loop.ts` (our +88/-23: registerUpdateHook set, current-gamemode tick,
  pause gating via pauseController/runFrame, menu-orbit yaw drift, setMenuOpen) → their
  frame path now lives in `runtime.ts`/`simulation.ts` + r3f-shell `GameCanvas`/`Player`.
  Find where the per-frame step runs and re-attach ALL of our frame features there.
- `src/game/player.ts` (+2/-1: cosmetics attach point tweak) → their player construction
  (likely `dogTint.ts` / scene code). Preserve `tintLocalDog`/cosmetics application.
- `src/game/remotePlayers.ts` (+3: remote cosmetics application) → `remotePlayerMotion.ts`
  or wherever remote dogs are built now.
- `src/ui/chat.ts` (+28/-14: chrome-free collapsed chat line, 6s fade, Enter-to-focus) →
  upstream inlined chat into `r3f-shell/ChatPanel.tsx`; carry our redesign INTO that
  component.
- `src/ui/multiplayer.ts` (+150/-2: room browser, create form, binding with
  rooms/refresh/create elements, getApiBaseUrl-based roomHttpUrl) → upstream inlined into
  `r3f-shell/MultiplayerPanel.tsx`; carry the room browser into it (it is also part of
  our Rooms intent view — keep the intent-view wiring from the panel redesign working).
- `src/ui/updateNotice.ts` (+15/-5: toast-rail based update banner) → inlined into
  `r3f-shell/UpdateNotice.tsx`; keep the toast-rail behavior.

**Both-modified (combine):** AGENTS.md, README.md (union), `src/game/multiplayer.ts`,
`src/net/client.ts` (keep our room-lobby methods AND their E2E crypto changes),
`src/net/protocol.ts`/`protocol.test.ts` (keep our cosmetics field + getApiBaseUrl AND
their crypto/relay message changes; combine tests), `src/server.ts` (ours wholesale +
port any new upstream server delta), `src/r3f-shell/{App,ChatPanel,MultiplayerPanel,
TuningPanel,UpdateNotice}.tsx` (OUR intent-view/binding versions win; port new upstream
props/lifecycle into them).

**Take theirs wholesale:** netlify/*, src/net/crypto.ts, .github/workflows/ci.yml.
**Keep ours:** plans/ (closed statuses), docs/ui-research/.

## Done when

Full gate green (`bun install && bun run typecheck && bun run test && bun scripts/smoke.ts`
— NEVER docker; the pg tests skip offline correctly), merge + fixups committed, and the
intent views (C/R/T), HUD-only play, chat line, and E2E multiplayer relay all coexist.
Browser verification happens at land time by the orchestrator.

## RESOLVED (2026-07-09)

**Execution:** user chose REBASE ONTO UPSTREAM. Done by hand in an isolated scratchpad
worktree (the omp-squad daemon is cross-driven from multiple terminals and reaped three
prior attempts). Commit incrementally. The verified conflict map above is the resolution
guide — resolving the `git merge origin/main` per that map produces the rebased tree.

**Architecture fork → option B (hybrid).** Blind relay is the default for social
free-skate (privacy: server never reads names/positions/chat). Leaderboard eligibility
requires a ranked gamemode room that opts into server-verified mode (plaintext run
samples the server can validate). So:
- Free-skate / casual rooms: blind relay, no leaderboard writes.
- Ranked race/parkour rooms: server-verified state → run samples to the ledger →
  leaderboards. Cosmetics equip validation already lives at the authenticated HTTP API
  (not the relay), so it is unaffected; a client rendering an unowned cosmetic on a
  blind relay is a cosmetic-only spoof with no economic effect (ownership is checked at
  buy/equip). This is acceptable for free-skate and enforced in ranked.
- Server-side chat rate-limit is moot (relay rate-limits by envelope; WS chat throttle
  from PR #30 still applies to the dev relay).

Rooms, agent events, shop/lootbox, wallet, and extensions ride the authenticated HTTP
API and are unaffected by the relay model. This decision is reversible and does not block
the rebase; ranked-mode server-verification is a follow-up (new concern) — the rebase
lands the blind-relay default now and leaves leaderboards reading the ledger for whatever
run samples exist.
