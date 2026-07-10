# Reference: upstream-convergence conflict map (for concern 13)

> Handoff input from an independent by-hand `git merge origin/main` (into the full
> roadmap stack). Codex's branch is the canonical convergence; this is only a
> pre-computed resolution guide to save time. Verified live against the merge:
> **43 conflicts total** — mechanical bucket (25) resolves cleanly as noted; the
> substantive 18 are listed below with their re-home targets.

## Mechanical (verified clean)
- **Take theirs wholesale:** `netlify/`, `src/net/crypto.ts`, `.github/workflows/`
- **Keep ours:** `plans/`, `docs/ui-research/`
- **Added-by-us (keep, additive):** the 29 net-new files — `src/contracts/`,
  `src/storage/`, `src/solana/`, `src/cosmetics/`, `src/modes/`, `src/extensions/`,
  `src/server/` router modules, `content/`, scripts, tests.

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

## The hard seam (server.ts)
Upstream `src/server.ts` is the hardened E2E blind relay (PR #30). Ours is the
modular HTTP/WS router mounting the game API. Integrate BOTH: keep upstream's
encrypted relay for the multiplayer channel AND mount our game-API modules
(cosmetics/lootbox/gamemodes/rooms/wallet/agentEvents/leaderboard) + CORS.
Preserve the #30 hardening (session-secret fail-closed, per-room cap, chat
throttle, SSE authz recheck) — do not regress it in the merge.
