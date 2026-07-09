# Lunar Pup Agent Guide

## Mission

Lunar Pup is becoming one production React + React Three Fiber (R3F) game. The previous Three.js app is a feature and feel reference, not permanent architecture. Preserve useful behavior while replacing transitional ownership with clean, testable systems.

Read this file, `CONTRIBUTING.md`, and `R3F-MIGRATION-PLAN.md` before changing code. The migration plan is the current roadmap until a `plans/` directory is introduced.

## Start and finish every bounded batch

1. Run `git status -sb`; do not overwrite unrelated work.
2. Read the relevant checklist section and claim only one coherent surface.
3. Check open upstream PRs/issues before overlapping work, as required by `CONTRIBUTING.md`.
4. Implement one owner for each system; do not add permanent hybrid fallbacks.
5. Run the checks appropriate to the change.
6. Update `R3F-MIGRATION-PLAN.md` with truthful completed work and verification evidence.
7. Commit one reviewable unit, then fetch `upstream`. Rebase onto `upstream/main` when it advanced; preserve both sides of conflicts. Push with `--force-with-lease` only after a rebase of the branch you own.

## Commands

```bash
bun install
bun run dev
bun run typecheck
bun test
bun run build
bun run preview
```

Use `bun install --backend=copyfile` only if Windows produces a package-link `EPERM` error. `index.html` is the default R3F entry. `index.vanilla.html` and its scripts are temporary reference tooling; do not add new product work there.

## Architecture and ownership

- `src/r3f-shell/` is the React application and R3F scene boundary.
- `GameCanvas.tsx` owns the Canvas and frame orchestration.
- `WorldEnvironment.tsx`, `Terrain.tsx`, `Player.tsx`, and `CameraRig.tsx` own their R3F presentation.
- `src/game/` contains transitional mutable simulation, terrain math, input, tricks, and bootstrap work. Extract tested simulation modules before changing gameplay behavior.
- `src/ui/` contains temporary imperative UI. Port a surface to React, prove it works, then remove its imperative setup path.
- `src/content/` defines reusable animal, board, material, and loadout contracts.
- `src/net/`, `src/server.ts`, and `netlify/` define multiplayer transport and deployment boundaries.

## R3F and React rules

- Use React state for human-paced UI, session state, and configuration only.
- Use refs and `useFrame` for transforms, velocity, terrain movement, animation, and other frame-time values. Never put those values in React state.
- A migrated system gets one owner. Do not render the same player, terrain, camera, or UI from both imperative Three.js and R3F.
- Dispose geometry, material, listeners, intervals, and transport subscriptions during lifecycle cleanup.
- Prefer R3F/Drei official APIs when they reduce infrastructure without hiding game logic. Consult current official documentation through Context7 before library-specific code or configuration.
- Do not add a state library until a concrete coarse UI/session boundary needs it. If added, Zustand is for coarse state only.

## Multiplayer and deployment

- Treat all remote data as untrusted: validate finite numbers, bounds, message size, and rate.
- Keep loadouts/session metadata separate from high-frequency snapshots.
- Netlify hosts the static client and HTTP helpers. Long-lived WebSockets require a WebSocket-capable service.
- Do not replace the transport without protocol tests, reconnect/stale-peer behavior, and a manual multi-client check.

## Quality and review gate

Before asking for review, run `bun run typecheck`, `bun test`, and `bun run build`. For runtime changes, manually check the documented affected behavior in a browser. Before making a PR ready, provide a Netlify preview URL and state its multiplayer limitation if applicable.

Draft PR #7 is the active R3F migration branch. Keep it draft until the current batch is self-contained, synced with `upstream/main`, verified, and ready for the maintainer to review. Never merge or mark it ready without approval.

## Avoid

- Fast workarounds, hidden fallbacks, or custom infrastructure where a supported path exists.
- Broad rewrites mixed with unrelated visual/features work.
- Force-pushing someone else's branch, deleting user work, or resolving conflicts by dropping either side.
- Claiming a checklist item complete without tests or browser evidence.
