# AGENTS.md — Lunar Pup (v3)

Guidance for coding agents working in this repository.

## Project

Lunar Pup is a browser skate game built with **React Three Fiber**, **Drei**,
and (when needed) **Trystero** (`@trystero-p2p/nostr`).

**Root = v3** (active). Earlier attempts live as frozen archives for cherry-picking:

| Path | Strengths to steal |
| --- | --- |
| [`v1/`](v1/) | Controls / physics (`src/game/playerPhysics.ts`), terrain gen (`terrain.ts` / `terrainMath.ts`), graphics (except pup) |
| [`v2/`](v2/) | Multiplayer (`src/game/multiplayer.ts`), camera (`CameraRig.tsx`), true 3D sphere world / clipmap |

Each archive has its own `AGENTS.md` and `ARCHIVE_SOURCE.txt` (git commit).

## Commands

```bash
bun install          # install deps
bun run dev          # Vite dev server at http://localhost:3000
bun run build        # typecheck + production build
bun run preview      # preview dist/
bunx tsc --noEmit    # typecheck only
```

Use **Bun** as the package manager/runtime. Port **3000** is configured with
`strictPort: true` in `vite.config.ts`.

To run an archive: `cd v1` or `cd v2`, then `bun install && bun run dev`.

## Architecture (v3)

```
src/
  main.tsx    # React entry
  App.tsx     # Empty Canvas shell — build the game here
  styles.css  # Overlay / shell styles
```

Copy modules from `v1/` or `v2/` into `src/` (or `src/game/`) as you integrate
systems. Prefer small, focused ports over wholesale dumps.

## Conventions

- **TypeScript strict** — preserve `verbatimModuleSyntax`; use `import type` where needed.
- **Minimal scope** — small, focused diffs; match existing file style.
- **No commits** unless the user asks.
- **Do not edit** `.agents/`, `skills-lock.json`, or generated `dist/` unless requested.
- Treat `v1/` and `v2/` as **read-mostly reference** — do not “fix” archives unless asked.
