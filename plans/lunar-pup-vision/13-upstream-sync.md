# 13 — Converge onto the upstream R3F runtime
STATUS: open
PRIORITY: p0
REPOS: lunarpup
COMPLEXITY: architectural
TOUCHES: src/game/, src/r3f-shell/, src/net/, src/server/, netlify/, .github/workflows/, plans/lunar-pup-vision/

## Goal

Land the current upstream runtime, encrypted relay, CI, and deployment changes while preserving the shipped Lunar Pup cosmetics, gamemodes, economy, extensions, and intent-view behavior.

## Approach

Treat convergence as a real implementation concern, not a documentation status change. This branch currently diverges from `origin/main` and lacks the upstream runtime modules that replace several transitional files used by the local UI and game loop.

Reconcile the architectures in an isolated worktree. Port local behavior into the upstream owners instead of restoring deleted transitional modules. Preserve the hybrid relay decision: private casual free-skate may use the blind relay, while reward-bearing or ranked runs use a server-observed path with explicit integrity limits. Keep cosmetics ownership validation at the authenticated HTTP boundary rather than inspecting encrypted snapshots.

After the merge, re-map the premium-experience concerns against the landed owners before any concern touches runtime, shell, camera, input, identity, or transport files.

## Cross-Repo Side Effects

No other repository changes are required, but active PRs or integration branches based on either side must rebase after this concern lands.

## Verify

- `git merge-base --is-ancestor origin/main HEAD` succeeds.
- The upstream runtime, provider, model, and relay modules expected by `origin/main` are present and own their intended behavior.
- No deleted transitional renderer or duplicate UI ownership path is reintroduced.
- Cosmetics, gamemodes, rooms, agent events, extensions, and the hybrid casual/ranked transport decision remain represented.
- `bun run typecheck`, `bun test`, and `bun run smoke` pass.
- A fresh browser boot, solo run, intent-view navigation, and representative multiplayer connection produce zero console errors.
