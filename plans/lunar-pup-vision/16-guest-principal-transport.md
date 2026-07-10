# 16 — Establish the guest principal and authenticated transport
STATUS: open
PRIORITY: p0
REPOS: lunarpup
COMPLEXITY: architectural
TOUCHES: src/net/session.ts, src/net/protocol.ts, src/server/guestSession.ts, src/server/router.ts, src/server/cosmetics.ts, src/server/lootbox.ts, src/server/gamemodes.ts, src/server/rooms.ts, src/server/wallet.ts, netlify/, src/server/guestSession.test.ts, src/net/session.test.ts, docs/session-transport.md
BLOCKED_BY: 15

## Goal

Give HTTP, browser transport, runs, rooms, and cosmetics one wallet-free principal so callers cannot establish authority with arbitrary account or player IDs.

## Approach

Issue a high-entropy opaque guest credential from a dedicated server session service. One client session adapter stores it in IndexedDB, shares the active principal across tabs with `BroadcastChannel`, and attaches it to HTTP requests through `Authorization`. Request-body `accountId` and `playerId` fields may remain as non-authoritative compatibility metadata during migration, but server handlers derive the principal exclusively from authentication.

Browser WebSocket/SSE connections obtain a short-lived, one-use transport ticket over authenticated HTTP. Tickets never appear in referrers or durable URLs, bind to the issuing principal and intended channel/room, expire quickly, and cannot be replayed for a second connection.

Define guest lifecycle semantics now: refresh and a second tab reuse the same principal; one tab may renew for the others; expiry/revocation enters a recoverable signed-out state; offline requests wait rather than mint a competing principal; cleared browser storage creates a new guest and never silently merges balances or inventory. Cross-device recovery and account merge are outside launch scope.

Gate every player mutation and room authority check on the principal. Disable wallet routes as well as wallet UI unless an explicitly injected linking service is enabled; the future wallet cannot replace or ambiguously merge the guest principal in this concern.

Document the supported static-client/API/long-lived-transport deployment topology and its CORS/header requirements.

## Cross-Repo Side Effects

Netlify helpers and the WebSocket-capable deployment must implement the same principal and ticket validation contract.

## Verify

- `bun test src/server/guestSession.test.ts src/net/session.test.ts` passes as the fast blocker check for run and multiplayer work.
- Mutating APIs and room/host actions reject missing, expired, revoked, replayed, or mismatched principals and ignore spoofed body IDs.
- Refresh, two-tab sharing, concurrent renewal, offline start, expiry, revocation, cleared storage, and reconnect scenarios are deterministic under tests.
- Transport tickets are short-lived, channel-bound, one-use, absent from durable URLs, and cannot authorize another principal.
- Wallet routes and UI are unavailable by default.
- Session loading/error/recovery states meet the shared 100ms feedback, 2s explanation, keyboard, focus, and no-raw-error budgets.
- `bun run typecheck`, `bun test`, and `bun run smoke` pass.
