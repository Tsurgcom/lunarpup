# Lunar Pup foundation contracts

This repo keeps feature seams in plain TypeScript modules so parallel work can add files without editing the game loop or the server entry point.

## Agent harness extension

`content/extensions/agent-harness/` owns the harness-to-server-to-client status feature. The shared event contract remains in `src/contracts/agentEvents.ts` so adapters and tests can validate untrusted JSON:

- `agent_session_start`
- `agent_status`
- `agent_needs_input`
- `agent_done`

Every event carries `harness`, `sessionId`, `project`, `message`, and ISO-compatible `timestamp`. Harness POSTs may include an `ownerKey`; the extension server uses it only for owner-scoped WebSocket delivery and stores only a SHA-256 hash of it in the ledger. `validateAgentEvent` is the runtime gate for untrusted JSON.

The extension provides `POST /agent/event`, the `agent-events` WebSocket channel, the browser HUD, and the Claude Code adapter in `content/extensions/agent-harness/adapters/claude-code/`. When the extension is disabled, those routes and channel are absent.

## Package manifests

`src/contracts/packageManifest.ts` defines shareable mod-like content manifests. A manifest has:

- `kind`: `cosmetic`, `gamemode`, or `extension`
- `version`
- `author`
- `displayName`
- `assetRefs`: named URI/media-type references with their own SHA-256
- `id`: SHA-256 of the canonical JSON for the manifest without `id`
- extension-only optional entries: `serverModule` and `clientModule`, relative to the package root

`canonicalManifestJson` sorts object keys recursively. `packageManifestId` hashes that canonical JSON. `validatePackageManifest` rejects manifests whose `id` does not match the content.

## Extension loading

Extensions are mod-like packages under `content/extensions/<name>/`. Server boot reads `EXTENSIONS` as a comma-separated list of package names, validates each package manifest, imports the optional `serverModule`, and calls its exported `registerServer(router)`. If any enabled extension has a `clientModule`, the loader registers `GET /extensions` and serves that client entry under `/extensions/<name>/<file>`.

The browser calls `GET /extensions` after core bootstrap. Each listed `clientModule` is dynamically imported because enabled packages are runtime-selected, then its exported `setupClient()` runs. Core game bootstrap imports only the generic loader; extension UI and channels stay in the package.

To write a new extension:

1. Create `content/extensions/<name>/manifest.json` with `kind: "extension"` and canonical `id`.
2. Add `serverModule` only when the package registers HTTP routes or WebSocket channels; export `registerServer(router)`.
3. Add `clientModule` only when the package needs browser behavior; export `setupClient()`.
4. Enable it with `EXTENSIONS=<name>` or include it in a comma-separated list.

## Cosmetics

`src/contracts/cosmetic.ts` defines cosmetic packages only; there is no shop or inventory UI here.

- `slot`: `board`, `body`, `trail`, or `aura`
- `rarity`: `common`, `rare`, `epic`, or `legendary`
- `visual.colors`: `#RRGGBB` or `#RRGGBBAA`
- optional mesh parameters: `shape`, `scale`, `roughness`, `metalness`
- optional particle parameters: `count`, `size`, `lifetime`, `emissionRate`

`validateCosmeticDefinition` is the runtime validator.

## Gamemodes

`src/contracts/gamemode.ts` defines the gamemode interface, not concrete game content. A gamemode provides:

- `id`
- lifecycle: `init`, `start`, `tick`, `end`
- player hooks: `onPlayerJoin`, `onPlayerLeave`
- scoring: `score`
- win condition: `isWinConditionMet`
- checkpoint definitions with position, radius, and optional order

`src/game/runtimeRegistry.ts` exposes `setCurrentGamemode(gamemode, state)`. `stepSimulation()` advances the registered state and calls `gamemode.tick(dt, state)` from R3F's `useFrame` path.

## Room/lobby protocol

`src/contracts/roomProtocol.ts` defines lobby messages:

- client: `create_room`, `join_room`, `leave_room`, `list_rooms`
- server: `room_state`, `room_list`

Room state includes `roomId`, `gamemodeId`, and opaque connection IDs. Membership is bound to a server-issued WebSocket connection identity—not the payload's claimed player id—and removed on disconnect, including host transfer. The public browse/create UI is intentionally disabled: encrypted casual routing is derived from the secret URL-fragment key, and a display room name is not a join credential. Concern 22 owns a future keyed invite flow.

## Currency, inventory, and ledger storage

`src/contracts/services.ts` defines storage interfaces that can be implemented by SQLite now and Postgres/Timescale later.

`CurrencyInventoryService`:

- `getBalance(accountId)`
- `grant(accountId, amount, reason)`
- `spend(accountId, amount, reason)`; throws `InsufficientFundsError` when balance is too low
- `listOwnedItems(accountId)`
- `grantOwnedItem(accountId, cosmeticId, reason)`

`EventLedgerStorage`:

- `append({ type, entityId, timestamp, payload })`
- `query({ type, entityId, from, to })`

The default backend is Bun SQLite at `data/lunarpup.db`. The `data` directory is gitignored. The ledger is append-only at the interface level: callers append typed events and query by time range/type/entity.

## Server routing

`src/server.ts` now owns only process wiring:

- create a `ModularRouter`
- register core server modules
- load enabled extension server modules from `content/extensions/`
- start `Bun.serve`
- pass WebSocket messages to the router

`src/server/router.ts` supports:

- HTTP routes registered by method/path
- WebSocket handlers registered by channel
- a default `multiplayer` channel when a legacy message has no `channel` field

`src/server/multiplayer.ts` registers the encrypted join/state/leave flow on the default `multiplayer` channel. Casual names, transforms, cosmetics, and chat are opaque envelopes; the server routes them without the room key. Explicit room, gamemode, and extension channels remain available through the same modular router.

The current `gamemode` channel is unauthenticated client telemetry only. Its acknowledgements and HTTP analytics response carry `trust: "untrusted_client_telemetry"`, `rewardEligible: false`, and `rankedEligible: false`; it has no currency/inventory dependency. Concern 17 owns authoritative runs.

## Runtime extension hooks

`src/game/runtimeRegistry.ts` exposes:

- `registerUpdateHook(fn)` returns an unregister function and calls `fn(dt, state)` once per frame
- `setCurrentGamemode(gamemode, state)` attaches or clears a gamemode tick target
- `registerActiveRuntime()` and `registerRuntimeScene()` bind the sole provider/Canvas owners during lifecycle setup

Hooks receive `playerGroup`, `physics`, `scene`, and `skateboard`. This lets cosmetics and gamemodes attach behavior without creating a second renderer or frame loop.
