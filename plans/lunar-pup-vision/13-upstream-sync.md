# 13 — Converge onto the upstream R3F runtime
STATUS: done
PRIORITY: p0
REPOS: lunarpup
COMPLEXITY: architectural
TOUCHES: src/game/, src/r3f-shell/, src/net/, src/server/, netlify/, .github/workflows/, plans/lunar-pup-vision/

## Goal

Land the current upstream runtime, encrypted relay, CI, and deployment changes while preserving the shipped Lunar Pup cosmetics, gamemodes, economy, extensions, and intent-view behavior.

## Approach

Treat convergence as a real implementation concern, not a documentation status change. This branch currently diverges from `origin/main` and lacks the upstream runtime modules that replace several transitional files used by the local UI and game loop.

Reconcile the architectures in an isolated worktree. Port local behavior into the upstream owners instead of restoring deleted transitional modules. Private casual free-skate uses the blind relay. The legacy gamemode sample channel remains separate but is explicitly untrusted client telemetry: it grants no rewards or ranked authority until Concern 17 adds an authenticated run lifecycle. Keep cosmetics ownership validation at the authenticated HTTP boundary rather than inspecting encrypted snapshots.

After the merge, re-map the premium-experience concerns against the landed owners before any concern touches runtime, shell, camera, input, identity, or transport files.

## Cross-Repo Side Effects

No other repository changes are required, but active PRs or integration branches based on either side must rebase after this concern lands.

## Verify

- `git merge-base --is-ancestor origin/main HEAD` succeeds.
- The upstream runtime, provider, model, and relay modules expected by `origin/main` are present and own their intended behavior.
- No deleted transitional renderer or duplicate UI ownership path is reintroduced.
- Cosmetics, gamemodes, private keyed sessions, agent events, extensions, and the casual-relay/untrusted-telemetry split remain represented.
- `bun run typecheck`, `bun test`, and `bun run smoke` pass.
- A fresh browser boot, solo run, intent-view navigation, and representative multiplayer connection produce zero console errors.

## Resolution

Merged `origin/main` into the isolated convergence branch and made the upstream
`GameProvider`, R3F Canvas, simulation, camera rig, and voxel models the sole runtime
owners. Local pause, gamemode, cosmetics, rooms, economy, persistence, extension,
agent-event, and intent-view behavior was reattached around those owners; the deleted
imperative renderer/state/player stack was not restored.

The modular product server now hosts the hardened encrypted blind relay for casual
multiplayer. The separate legacy `gamemode` channel stores only explicitly untrusted
client telemetry and cannot mutate economy, grant rewards, or confer ranked authority;
Concern 17 owns the authenticated replacement. Netlify session binding, CORS, room caps,
SSE authorization, and CI/deployment changes from upstream are retained. Public room
browse/create affordances are disabled until Concern 22 can preserve the required secret
fragment key end to end.

Evidence: `bun run typecheck`, 189 passing tests (one opt-in Postgres test skipped),
`bun run smoke`, `bun run build`, and `git diff --check` pass. Headless Chromium verified
a fresh solo boot and accelerating run, Shop/Rooms/Settings navigation, and two clients
sharing an encrypted casual room with zero console/page errors. The pre-existing
Shop→Escape scrim pointer interception remains assigned to Concern 14; it was not
introduced by this convergence.

Post-review hardening removed the misleading public room browse/create controls in favor
of exact keyed private invites, bound lobby membership to live connection ids with
disconnect/host-transfer cleanup, propagated post-join cosmetic revisions, and made
async multiplayer initialization generation-owned and abortable. Focused regressions
cover keyed invite construction, forged telemetry without economy mutation, cosmetic
revision sync, ghost-member cleanup/host transfer, and stale async resolution disposal.
