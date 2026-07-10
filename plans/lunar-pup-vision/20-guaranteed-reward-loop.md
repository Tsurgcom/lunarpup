# 20 — Ship the guaranteed reward-to-replay loop
STATUS: open
PRIORITY: p0
REPOS: lunarpup
COMPLEXITY: architectural
TOUCHES: src/modes/client.ts, src/r3f-shell/ExperienceShell.tsx, src/r3f-shell/RewardResult.tsx, src/r3f-shell/PreviewPup.tsx, src/ui/experienceState.ts, src/ui/economyResources.ts, src/server/gamemodes.ts, src/server/economyCommands.ts, content/cosmetics/, src/ui/reward-result.css, test/browser/first-session.spec.ts, src/ui/economyResources.test.ts
BLOCKED_BY: 18, 19

## Goal

Deliver the first complete journey: a fresh guest enjoys the proven run, receives one guaranteed cosmetic, sees it on the pup, wears it, and starts another run without entering a store or crate flow.

## Approach

Author a small starter-reward collection in which every item produces a clear visual change. On the first eligible completed run, commit one deterministic reward through the authenticated transactional command. Keep the world and pup visually present, explain the achievement, preview the reward, and offer two actions in clear hierarchy: Wear it and Play again.

Do not introduce purchase, crate, currency selection, wallet, preset, or inventory-management decisions. The reward may introduce Moon Bones as future earning context but must not redirect the player away from retrying.

Every async boundary recovers in place. A lost response replays the original operation; refresh failure does not hide a committed reward; failed Wear it preserves preview and gives a precise retry; Back returns to its origin. Record reward shown, Wear it, equip acknowledgement, Play again, and second-run start through provider-neutral product events.

Apply the shared craft/accessibility/performance budgets to this complete vertical slice rather than deferring quality to release review.

## Cross-Repo Side Effects

None.

## Verify

- `bunx playwright test test/browser/first-session.spec.ts` passes as the fast blocker check for Customize and private multiplayer.
- A pristine guest completes run → deterministic reward → preview → Wear it → Play again without wallet, reload, store, crate, or raw errors.
- Lost response, offline, failed refresh, failed equip, duplicate finish, second-tab replay, Back, Escape, and page refresh preserve one reward and a clear recovery path.
- Only acknowledged Wear it changes canonical equipment and outgoing snapshots.
- In an observed 5–8 player test, at least 4 complete the journey without intervention and at least 3 voluntarily begin a second run.
- The full journey meets shared load, response, p95 frame-time, focus, reduced-motion, sound-off, contrast, recovery, and lifecycle budgets.
- `bun run typecheck`, `bun test`, and `bun run smoke` pass with zero browser console errors.
