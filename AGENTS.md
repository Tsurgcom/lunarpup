# Lunar Pup agent guide

## Mission

Lunar Pup is becoming one production React + React Three Fiber (R3F) game. The previous Three.js app is a feature and feel reference, not permanent architecture. Preserve useful behavior while replacing transitional ownership with clean, testable systems.

## Dev workflow

- Install: `bun install`.
- Run the full local app with `bun run dev`; it starts the browser game on port `3000` and the Bun API/WebSocket server on port `3001`.
- Run server only with `bun run dev:server`; run game only with `bun run dev:game`.
- Verify changed work with the narrow test first, then `bun run typecheck`, `bun test`, and `bun run smoke`. The package `verify` chain runs all three.
- Browser URL params:
  - `?multiplayer` enables multiplayer.
  - `?room=<roomId>` selects the multiplayer room.
  - `?name=<displayName>` sets the local player name.
  - `?ws=ws://host:port` overrides both WebSocket and HTTP API base resolution through `getApiBaseUrl()` in `src/net/protocol.ts`.

## Environment variables

- `AGENT_EVENT_TOKEN`: required bearer token or `x-agent-event-token` value for `POST /agent/event`.
- `EXTENSIONS`: comma-separated extension package names loaded from `content/extensions/`; `scripts/dev.ts` defaults to `agent-harness` for local dev.
- `DATABASE_URL`: when set, persistence uses Postgres/Timescale instead of SQLite. Run `bun run db:migrate` before use. Leaderboards read `best_time_leaderboards_hourly` in this mode.
- `TEST_DATABASE_URL`: SQLite database path for tests and smoke runs when `DATABASE_URL` is unset; Postgres integration tests also use it as a Postgres URL when explicitly configured for those tests.
- `MAINNET_LAUNCH_CONFIRM`: must be exactly `YES_I_AM_SURE` before `scripts/solana/launch-mainnet.ts` will proceed to its interactive human confirmation.
- `SOLANA_RPC_URL`: optional devnet RPC URL for Solana adapters; default is `https://api.devnet.solana.com`.
- `DEVNET_TOKEN_MINT`: devnet SPL mint used when constructing `SolanaDevnetTokenService`.
- `PORT`: API/WebSocket server port; defaults to `3001`.

## HTTP endpoints

CORS is centralized in `src/server.ts`; do not add per-module CORS headers.

- `GET /rooms`: list lobby rooms.
- `POST /wallet/challenge`: create a devnet wallet sign-in challenge.
- `POST /wallet/verify`: verify the wallet signature and link the wallet to the player id.
- `POST /agent/event`: authenticated agent event ingest with owner-scoped WebSocket delivery, only when the `agent-harness` extension is enabled.
- `GET /extensions`: lists enabled extension client entries, only registered when at least one extension is enabled.
- `GET /api/cosmetics/catalog`: public cosmetic catalog.
- `GET /api/cosmetics/inventory?accountId=<id>`: balance, linked wallet, token balance, owned cosmetics, equipped slots, and catalog.
- `POST /api/cosmetics/buy`: `{ accountId, cosmeticId, currency?: "soft" | "token" }`; token purchases require a linked wallet and injected devnet SPL token service.
- `POST /api/cosmetics/equip`: `{ accountId, cosmeticId, slot }`.
- `GET /lootbox/odds` and `GET /api/lootbox/odds`: published Moon Crate odds.
- `POST /lootbox/open` and `POST /api/lootbox/open`: server-authoritative lootbox roll with ledger event.
- `GET /leaderboard/:gamemodeId`: best finish times from SQLite ledger, or Timescale continuous aggregate when `DATABASE_URL` is set.

## WebSocket channels

- Default/multiplayer channel: legacy `{ type: "join" | "state" | "leave" | "chat" }` messages.
- `room`: create, join, leave, list, and start gamemode lobby messages.
- `gamemode`: `run_sample` messages; `reason: "finish"` feeds leaderboard results.
- `agent-events`: subscribe with `{ channel: "agent-events", type: "subscribe", ownerKey }` for owner-scoped delivery, only when the `agent-harness` extension is enabled.

## Client architecture and ownership (R3F)

- `src/r3f-shell/` is the React application and R3F scene boundary; `index.html` mounts `src/r3f-shell/main.tsx`.
- `GameCanvas.tsx` owns the Canvas and frame orchestration; the simulation step runs from `useFrame` (see `stepGameFrame` in `src/game/loop.ts`).
- `WorldEnvironment.tsx`, `Terrain.tsx`, `Player.tsx`, and `CameraRig.tsx` own their R3F presentation.
- `src/game/` contains the mutable simulation, terrain math, input, tricks, frame gating (`frame.ts`/`pause.ts`), gamemode tick, and bootstrap wiring. Tested simulation modules (`playerPhysics.ts`, `trickSimulation.ts`, `terrainMath.ts`) must stay pure.
- `src/ui/` contains React-bound UI bridges. Each surface mounts from `src/r3f-shell/` via a `bind*` function called from a component `useEffect`; do not add imperative DOM setup paths in core bootstrap.
- Use React state for human-paced UI, session state, and configuration only. Use refs and `useFrame` for transforms, velocity, terrain movement, and animation — never React state for frame-time values.
- A migrated system gets one owner. Do not render the same player, terrain, camera, or UI from both imperative Three.js and R3F. Dispose geometry, material, listeners, intervals, and transport subscriptions during lifecycle cleanup.

## Extensions

- Extension packages live under `content/extensions/<name>/` and use `kind: "extension"` package manifests.
- Optional manifest `serverModule` entries export `registerServer(router)`; optional `clientModule` entries export `setupClient()`.
- The server loader reads `EXTENSIONS`, imports enabled server modules, exposes `GET /extensions`, and serves each enabled client entry.
- The browser loader fetches `GET /extensions` after bootstrap and imports enabled client entries; core game bootstrap must not import extension UI directly.
- `content/extensions/agent-harness/` owns the agent event endpoint, WebSocket channel, HUD, and Claude Code adapter.

## Adapters

- Persistence: `createStorageServices()` picks SQLite by default and Postgres/Timescale when `DATABASE_URL` is set.
- Currency/inventory: `SqliteCurrencyInventoryService` and `PostgresCurrencyInventoryService` implement soft-currency balances, ownership, and economy ledger facts.
- Solana SPL: `SolanaDevnetTokenService` implements the currency interface plus devnet mint/transfer helpers. Tests must inject mocked RPC services.
- NFTs: `MetaplexDevnetNftService` mints devnet Metaplex NFTs whose metadata URI embeds the cosmetic package id. Tests must use mocked UMI/RPC clients.
- Client networking: all browser API calls must derive their base URL via `getApiBaseUrl()` from `src/net/protocol.ts`.

## Multiplayer and deployment

- Treat all remote data as untrusted: validate finite numbers, bounds, message size, and rate.
- Keep loadouts/session metadata separate from high-frequency snapshots.
- Netlify hosts the static client and HTTP helpers. Long-lived WebSockets require a WebSocket-capable service.
- Do not replace the transport without protocol tests, reconnect/stale-peer behavior, and a manual multi-client check.

## Avoid

- Fast workarounds, hidden fallbacks, or custom infrastructure where a supported path exists.
- Reintroducing a vanilla renderer entry or dual ownership paths.
- Force-pushing someone else's branch, deleting user work, or resolving conflicts by dropping either side.
- Claiming work complete without tests or browser evidence.
