# Lunar Pup: R3F Remake Roadmap

## Product goal

Remake Lunar Pup as a production-grade React Three Fiber game. Use current Three.js game as behavior and feature reference, not permanent architecture.

Target:

- One React + R3F client app.
- Drei/helpers where they reduce custom code without hiding gameplay logic.
- Declarative scene, world, player, camera, UI, content, and effects.
- Mutable frame-time simulation. React state never updates per frame.
- Reusable animals, skateboards, materials, cosmetics, and effects.
- Multiplayer ready for real rooms and deployment.
- Improve visuals, feel, content, performance, and UX after core port works.

## Rules

- Keep game runnable after each batch.
- Original app is reference for features/feel. Exact 1:1 rendering is not finish line.
- Do not leave hybrid ownership permanently. Each migrated system has one owner.
- Old vanilla entry is temporary test reference only. Delete after R3F replacement passes feature smoke tests.
- One bounded system per commit. Update this checklist with evidence.

## Current state

- [x] R3F is default `index.html` app entry.
- [x] R3F `Canvas` owns renderer and render loop.
- [x] Existing Three.js simulation runs through R3F frame loop.
- [x] Production controls, React tuning/trick/chat/minimap/multiplayer panels, HUD anchor, and multiplayer bootstrap exist in R3F entry.
- [x] Build, typecheck, and unit tests passed before latest upstream sync.
- [x] Latest upstream production fixes rebased: slope-aware jumps, jump teleport/clipping fixes, contributing/deploy policy.
- [x] Browser smoke test after latest upstream rebase: HUD, controls, tuning sliders, terrain chunks, tricks, multiplayer panel, minimap, and chat render; no console errors.
- [x] R3F owns scene, terrain, local/remote player presentation, camera rig, input lifecycle, and core React HUD panels. Jump/drive/trick simulation logic lives in tested `playerPhysics` and `trickSimulation` modules.
- [x] Legacy renderer removal batch: deleted `state.ts`, `bootstrap.ts`, `loop.ts`, `scene.ts`, imperative `player.ts`/`remotePlayers.ts`, and superseded HUD bridges. Simulation lives in `game/simulation.ts` + `game/runtime.ts`; UI in `r3f-shell/` with `GameProvider`; remote players in `RemotePlayers.tsx`. Product menu/economy bridges remain in `src/ui/` for the Concern 14 React shell migration.

## Phase 0: production reference capture

- [ ] Run latest original app and R3F app side by side.
- [ ] List every current feature: movement, tricks, terrain, camera, HUD, tuning, chat, minimap, multiplayer, update notice.
- [ ] Record known behavior worth keeping and known behavior worth improving.
- [ ] Add short browser smoke checklist for every migration batch.

## Phase 1: R3F foundation

- [x] Install React, React DOM, and React Three Fiber without changing Bun deployment flow.
- [x] Make R3F `Canvas` default renderer.
- [x] Keep frame-time game loop via `useFrame`.
- [x] Preserve renderer DPR, shadows, camera near/far/FOV, and performance settings.
- [x] Add React error boundary and WebGL fallback screen. Verified by typecheck, unit tests, and production build.
- [x] Remove temporary `index.vanilla.html`, `dev:vanilla`, and `build:vanilla`. Verified with `bun run typecheck`, `bun test`, and `bun run build`.

## Phase 2: declarative world

Goal: R3F owns all static scene presentation.

- [x] Move background, fog, lights, starfield, and planet into R3F components.
- [x] Move terrain root/chunk presentation into R3F components. Chunk React state changes only when player enters a new chunk.
- [x] Extract terrain math into a pure module with deterministic height regression tests; the shared `calculateTerrainHeight` export preserves legacy and R3F behavior. Verified with `bun run typecheck`, `bun test`, and `bun run build`.
- [x] Add chunk lifecycle/disposal ownership for R3F geometry/materials and legacy terrain cleanup.
- [ ] Add world/environment configuration object.
- [x] Make legacy scene presentation conditional: vanilla owns it only in temporary legacy mode; R3F owns it in Canvas mode. **Done:** vanilla entry and legacy terrain/UI paths removed.

## Phase 3: player and camera remake

Goal: R3F owns local player presentation and camera rig; shared simulation stays frame-time mutable.

- [x] Create `Player` R3F component with board, animal, wheels, tail, shadows, and trick pose refs.
- [x] Create R3F `CameraRig`: existing follow, orbit drag, zoom, and speed-FOV math now runs in R3F `useFrame` after simulation.
- [x] Move keyboard input listeners into a lifecycle-safe React hook. Camera listeners now also clean up with runtime lifecycle.
- [x] Move player physics and tricks into isolated simulation modules with tests. `trickSimulation.ts` owns airborne trick state/scoring; `playerPhysics.ts` owns jump buffer, coyote time, drive speed, heading, and suspension blending. Verified with `bun test` (33 passed), `bun run typecheck`, and `bun run build`.
- [x] Remove legacy player/camera/input ownership after manual control smoke test. Player rendering belongs to R3F; simulation integration lives in `simulation.ts` via `GameProvider`.

## Phase 4: React UI and state boundaries

- [x] Replace DOM-injection speedometer, speed lines, and update notice with React components. React owns tuning, tricks, chat, minimap, multiplayer, speedometer, speed lines, and update notice; frame-time updates use DOM refs outside React state. Verified with `bun run typecheck`, `bun test` (18 passed), `bun run build`, and local R3F browser smoke check (speedometer updates while moving, speed lines pulse on boost, update banner mounts without console errors).
- [ ] Add Zustand only for coarse UI/session/settings state.
- [ ] Keep speed, transforms, physics, terrain, and snapshots out of React state.
- [ ] Add accessible settings, controls reference, connection state, and error states.
- [x] Remove imperative core HUD modules after UI smoke test. HUD updates register through `GameProvider` frame callbacks; remaining product menu/economy bridges are explicitly temporary until Concern 14.

## Phase 5: reusable content and visual upgrades

- [x] Define animal, board, material, and loadout contracts in `src/content/`.
- [ ] Add effects registry.
- [ ] Install/use Drei only where useful: asset loading, preloading, performance helpers, controls if retained after custom camera audit.
- [ ] Load GLTF assets with `Suspense`, fallbacks, preloading, and disposal rules.
- [ ] Add dog + one alternate animal, classic board + one alternate board, and material variants.
- [ ] Add model attachment points and animation mapping.
- [ ] Improve moon world art, effects, tricks, feedback, and sound after core port.

## Phase 6: multiplayer production path

- [x] Set room capacity (`32`) and validate finite replicated state.
- [x] Capture WebSocket client-message protocol validation in `src/net/protocol.test.ts` (valid join/state/chat/leave payloads; malformed, unknown, and non-finite state rejection). Verified with `bun test`, `bun run typecheck`, and `bun run build`.
- [x] Harden multiplayer relays per security audit (#19): WS origin allow-list, room/connection caps, per-connection state rate limit, `maxPayloadLength`/`idleTimeout`, signed Netlify session tokens (bind `id`+`room`), CORS allow-list, global Blobs room cap, slower SSE poll (100 ms), client-side decrypted-state sanitization, and Netlify security headers. Verified with `bun test` (37 passed), `bun run typecheck`, `bun run build`, and `scripts/e2e-relay-test.ts`.
- [ ] Add heartbeat, stale cleanup, reconnect/backoff, room rejoin, message size limits, and rate limits.
- [ ] Add remote-player interpolation component.
- [ ] Decide/implement authoritative room server: evaluate Colyseus first; keep raw WebSocket only if custom protocol gets full lifecycle/tests.
- [ ] Replicate loadouts in session/join state, never per-frame snapshots.
- [ ] Load-test realistic rooms.

## Phase 7: deployment and quality gate

- [ ] Netlify deploys only static R3F client + HTTP helpers.
- [ ] Put long-lived realtime service on WebSocket-capable host.
- [ ] Add runtime WebSocket config, origin validation, health endpoint, environment docs, preview smoke test.
- [ ] Add visual/browser smoke tests, typecheck, unit tests, build, and multiplayer integration tests to PR gate.
- [ ] Convert draft PR #7 to ready only when current batch is reviewable. **Done:** PR #7 merged as `7365390`.
- [ ] Merge only after approval and passing checks. **Done:** merged with Netlify preview at https://6a5022f794f93174705a37b1--lunarpup.netlify.app

## Current batch

Legacy transitional code removed. Next: remote-player interpolation polish and multiplayer lifecycle hardening (Phase 6).

## Reference docs used

- React Three Fiber: `/pmndrs/react-three-fiber`
- Netlify: `/websites/netlify`
- Zustand: `/pmndrs/zustand`
