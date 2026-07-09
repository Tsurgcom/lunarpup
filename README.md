# Lunar Pup Skater 3D

A Three.js moon-skating game with procedural chunked terrain (PCG LOD).

## Development

```bash
bun install
bun run dev
```

Opens a hot-reloading dev server from `index.html`.

## Production build

```bash
bun run build
```

Outputs minified, code-split bundles to `dist/`:

- `index.html` — entry page
- `index-*.js` — entry + shared chunks (including Three.js ~525 KB)
- `bootstrap-*.js`, `scene-*.js`, `terrain-*.js`, `player-*.js`, `loop-*.js`, `tuning-*.js`, `speedLines-*.js`, `input-*.js` — lazy-loaded game modules
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
  game/             # Scene, terrain, player, loop, input
  ui/               # Tuning panel and speed lines
index.html          # HTML shell
dist/               # Build output (generated)
legacy/             # Original saved HTML snapshot
```
