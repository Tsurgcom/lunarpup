# Lunar Pup Skater 3D

A React Three Fiber moon-skating game with procedural chunked terrain (PCG LOD).

Skate across the lunar surface, boost over procedural ridges, and land aerial
spins and Moon Grabs for points. Optional WebSocket multiplayer synchronizes
players in shared rooms.

## Controls

- `WASD` / arrow keys — accelerate, brake, and steer
- `Space` — low-gravity ollie
- `Shift` — boost while accelerating
- `Q` / `E` — spin left or right in the air
- `F` — hold a Moon Grab in the air
- Mouse drag / wheel — orbit and zoom the camera

## Development

```bash
bun install
bun run dev
```

Starts the browser game and API/WebSocket server. Local dev enables the `agent-harness` extension by default through `scripts/dev.ts`.

Run the automated checks:

```bash
bun run test
bun run typecheck
bun run smoke
```

Enable multiplayer with URL parameters such as
`?multiplayer&room=lunar-park&name=Pup123`. Override the API/WebSocket server with `?ws=ws://localhost:3001`.

## Extensions

Runtime extensions live in `content/extensions/<package>/`. Enable them on the server with `EXTENSIONS=package-a,package-b`; disabled extensions register no endpoints and ship no client code. `GET /extensions` lists enabled extensions that expose browser entries, and the browser loader imports each listed entry after game bootstrap.

An extension package is a normal package manifest with `kind: "extension"` plus optional entry paths:

```json
{
  "kind": "extension",
  "displayName": "Example Extension",
  "serverModule": "./server.ts",
  "clientModule": "./client.ts"
}
```

`serverModule` must export `registerServer(router)`. `clientModule` must export `setupClient()`. Keep package paths relative to the extension directory; the loader rejects paths outside the package root.

`content/extensions/agent-harness/` is the first extension. It owns `POST /agent/event`, the `agent-events` WebSocket channel, the owner-key HUD row, and the Claude Code adapter under `content/extensions/agent-harness/adapters/claude-code/`.

## Production build

```bash
bun run build
```

Outputs minified, code-split bundles to `dist/`:

- `index.html` — entry page
- `index-*.js` — entry + shared chunks (including Three.js ~525 KB)
- Additional `*.js` chunks — lazy-loaded game, networking, trick, and UI modules
- `index-*.css` — bundled styles

Preview the production build:

```bash
bun run preview
```

## Project layout

```
src/
  r3f-shell/           # React app, Canvas, declarative world/player/camera/terrain; main.tsx is the entry
  styles.css           # HUD, shop, lobby, lootbox, and leaderboard styles
  config.ts            # Game constants
  game/                # Mutable runtime, simulation, terrain, input, tricks, frame gating
  modes/               # Runtime gamemode packages, sampling, and results UI
  net/                 # getApiBaseUrl(), WebSocket client, shared protocol
  ui/                  # Product UI bridges and menu/economy helpers pending React shell migration
  contracts/           # Runtime-validated contracts and storage interfaces
  extensions/          # Generic client/server extension loaders
  cosmetics/           # Content-addressed cosmetic package registry
  solana/              # Devnet SPL token and Metaplex NFT adapters
  server/              # Bun HTTP/WebSocket modules: rooms, wallet, cosmetics,
                       # lootbox, gamemodes, leaderboard
  server.ts            # Bun server wiring; CORS is applied here for all HTTP responses
content/
  cosmetics/           # Cosmetic manifests and definitions
  gamemodes/           # Gamemode manifests and params
  extensions/          # Runtime extension packages such as agent-harness
db/migrations/         # Timescale/Postgres schema and continuous aggregates
docs/                  # Architecture, Solana, lootbox, persistence notes
scripts/
  smoke.ts             # End-to-end API/WebSocket smoke gate
  dev.ts               # Starts game (:3000) and API/WebSocket server (:3001)
index.html             # HTML shell
dist/                  # Build output (generated)
legacy/                # Original saved HTML snapshot
```

## Acknowledgments

Thanks to **@dustydee** from the Hermes agent Discord server for feedback and inspiration.
