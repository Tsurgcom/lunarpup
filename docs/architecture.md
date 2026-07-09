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

`src/game/loop.ts` exposes `setCurrentGamemode(gamemode, state)`. When set, the loop increments `state.elapsedMs` and calls `gamemode.tick(dt, state)` each frame.

## Room/lobby protocol

`src/contracts/roomProtocol.ts` defines lobby messages:

- client: `create_room`, `join_room`, `leave_room`, `list_rooms`
- server: `room_state`, `room_list`

Room state includes `roomId`, `gamemodeId`, and player IDs. This is only the protocol contract; no lobby feature is built in this unit.

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

`src/server/multiplayer.ts` registers the existing join/state/leave flow on the `multiplayer` channel. Existing `src/net/client.ts` messages are unchanged, so current multiplayer clients continue sending `{ type: 'join' }` and `{ type: 'state' }` without a channel field.

## Game loop extension hooks

`src/game/loop.ts` exposes:

- `registerUpdateHook(fn)` returns an unregister function and calls `fn(dt, state)` once per frame
- `setCurrentGamemode(gamemode, state)` attaches or clears a gamemode tick target
- `getCurrentGamemode()` reports the currently attached gamemode

Hooks receive `playerGroup`, `physics`, `scene`, and `skateboard`. This lets cosmetics and gamemodes attach behavior without editing `loop.ts` again.
