# 19 — Build a reversible pup preview
STATUS: open
PRIORITY: p0
REPOS: lunarpup
COMPLEXITY: architectural
TOUCHES: src/r3f-shell/Player.tsx, src/r3f-shell/CameraRig.tsx, src/r3f-shell/GameCanvas.tsx, src/r3f-shell/PreviewPup.tsx, src/game/cosmetics.ts, src/game/types.ts, src/ui/previewState.ts, content/cosmetics/, src/game/cosmetics.test.ts, src/ui/previewState.test.ts, test/browser/pup-preview.spec.ts
BLOCKED_BY: 15

## Goal

Make cosmetic selection directly visible on the pup while guaranteeing that preview state cannot mutate gameplay, inventory, or multiplayer equipment.

## Approach

After convergence, map these intended owners to the landed model/runtime names. Define explicit attachment/material slots for board, body, trail, and aura, then make live and preview models consume the same tested cosmetic presentation contract. Correct missing or ambiguous mesh tags before building UI around them.

Render a dedicated preview pup group inside the existing Canvas. Reuse the pup component and cosmetic renderer, not the live gameplay instance. An explicit presentation mode makes gameplay and preview composition mutually exclusive. CameraRig remains the sole camera writer and chooses stable preview framing.

Create a separate draft-loadout type and owner. Opening preview copies canonical equipment; selection changes only the draft; Cancel or Back discards it; acknowledged Equip in a later concern replaces canonical state. Multiplayer serialization and persistence read canonical state directly and cannot import the draft.

Rapid selection, close during load, StrictMode remount, and Canvas disposal must cancel stale work and release preview materials, geometry, listeners, timers, and camera transitions. Preview appears without reloading or discarding the current world.

## Cross-Repo Side Effects

Cosmetic content packages must use the finalized attachment vocabulary.

## Verify

- `bun test src/game/cosmetics.test.ts src/ui/previewState.test.ts` passes as the fast blocker check for the reward loop.
- A render-level test proves every catalog slot visibly changes its intended attachment and restores cleanly.
- Preview selection never changes canonical equipment, inventory, ledger facts, or outgoing snapshots.
- Cancel, Back, teardown, and refresh restore the exact canonical appearance and gameplay camera.
- CameraRig is the only frame-time camera writer.
- Ten open/select/close cycles and StrictMode remount return scene resources, timers, and subscriptions to baseline.
- Preview meets the desktop p95 frame-time, response, focus, reduced-motion, sound-off, and no-layout-jump budgets.
- `bun run typecheck`, `bun test`, and `bun run smoke` pass with zero browser console errors.
