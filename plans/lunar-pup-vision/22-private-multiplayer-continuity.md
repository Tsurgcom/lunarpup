# 22 — Make private multiplayer continuous and trustworthy
STATUS: open
PRIORITY: p2
REPOS: lunarpup
COMPLEXITY: architectural
TOUCHES: src/r3f-shell/ExperienceShell.tsx, src/r3f-shell/MainMenu.tsx, src/r3f-shell/MultiplayerPanel.tsx, src/r3f-shell/RosterOverlay.tsx, src/r3f-shell/PresenceChip.tsx, src/ui/multiplayer.ts, src/ui/multiplayer.css, src/game/multiplayer.ts, src/net/client.ts, src/net/protocol.ts, src/server/rooms.ts, src/server/multiplayer.ts, netlify/, test/browser/private-multiplayer.spec.ts, src/server/multiplayer.test.ts, docs/private-multiplayer.md
BLOCKED_BY: 16, 20, 21

## Goal

Let a player invite friends into a private session, move from lobby to play to results/rematch without reloads, and recover cleanly—without presenting an empty public matchmaking product.

## Approach

Keep social play secondary. Support private rooms and shareable invite links through invite → lobby roster → ready/start → play → results/rematch. Solo modes remain under Play.

Replace reload joins with an acknowledged in-process transition. Dispose old membership, subscriptions, timers, stale peers, and reconnect state before switching. Update shareable URL state only after success; failure restores the prior playable state.

Authenticated identity comes from the guest principal and transport ticket. Host/ready/start authority binds to the connection, never message body. Preserve the accepted casual privacy model and document reward-bearing server-observed paths.

Show explicit invite slots, one primary Ready/Start action, human reconnect states, and useful empty state. Canonical equipment alone is serialized. Public discovery/top-level matchmaking remains outside scope until concurrency evidence exists.

## Cross-Repo Side Effects

The WebSocket deployment and Netlify relay helpers must agree on ticket, room-key, reconnect, and deep-link semantics.

## Verify

- `bunx playwright test test/browser/private-multiplayer.spec.ts` passes as the fast blocker check for desktop release evidence.
- Two clients complete invite → lobby → ready → play → results → rematch without reload.
- Failed join, host leave, reconnect, stale peer, duplicate connection, switch, and teardown pass protocol/browser tests.
- Tickets cannot authorize another principal; spoofed message identity is rejected; URLs contain no credential.
- Ten room transitions and StrictMode remount return transport/listener/timer/remote-scene counts to baseline.
- Preview drafts never enter snapshots; acknowledged canonical equipment does.
- Private empty states do not imply public activity.
- Shared response, focus, reduced-motion, sound-off, connection recovery, and p95 frame-time budgets pass.
- `bun run typecheck`, `bun test`, and `bun run smoke` pass with manual multi-client evidence and zero console errors.
