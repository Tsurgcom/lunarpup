# Lunar Pup Skater 3D

A Three.js moon-skating game with procedural chunked terrain (PCG LOD).

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

Opens a hot-reloading dev server from `index.html`.

Run the automated checks:

```bash
bun run test
bun run typecheck
```

Enable multiplayer with URL parameters such as
`?multiplayer&room=lunar-park&name=Pup123`.

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
  main.ts           # Browser entry point
  styles.css        # UI styles
  config.ts         # Game constants
  state.ts          # Shared runtime state
  game/             # Scene, terrain, player, loop, input, tricks
  net/              # WebSocket client and shared protocol
  ui/               # Tuning, speed lines, multiplayer, and trick HUD
  server.ts         # Bun multiplayer WebSocket server
index.html          # HTML shell
dist/               # Build output (generated)
legacy/             # Original saved HTML snapshot
```

## Acknowledgments

Thanks to **@dustydee** from the Hermes agent Discord server for feedback and inspiration.
