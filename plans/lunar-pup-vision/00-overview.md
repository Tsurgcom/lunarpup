# Lunar Pup — premium playable loop

## Outcome

- A desktop arcade player reaches meaningful skating quickly, understands the goal, finishes a satisfying short run, receives a guaranteed cosmetic, wears it, and chooses to play again.
- Play is the unmistakable primary action; Customize is character-first; Settings is utility; wallet, paid randomness, mobile shipping, and public matchmaking appear only after evidence supports them.
- Navigation, identity, economy, preview, accessibility, recovery, and lifecycle behavior have one explicit owner and executable browser evidence.

## Work

| Concern | Why it exists | Complexity | Touches |
|---|---|---|---|
| 13 — Upstream convergence | The current branch is not on the runtime the new plan must target | architectural | runtime, shell, network, server |
| 14 — Reliable experience shell | Fix broken layering/navigation and establish one interaction language | architectural | shell, navigation, base UI styles |
| 15 — Replay-worthy solo run | Prove skating has a satisfying skill beat and retry pull before product expansion | architectural | simulation, camera, mode/results flow |
| 16 — Guest principal and transport | Replace caller-supplied identity with one recoverable wallet-free session | architectural | session, HTTP, browser transport |
| 17 — Authenticated run lifecycle | Define valid reward-bearing runs without pretending full anti-cheat | architectural | gamemode protocol, run storage |
| 18 — Transactional economy | Make reward, buy, open, and equip replay-safe and atomic | architectural | persistence, economy APIs |
| 19 — Reversible pup preview | Make the pup the visual center without mutating live or network state | architectural | R3F model, presentation, preview state |
| 20 — Guaranteed reward loop | Ship the first complete play → reward → wear → replay journey | architectural | results, rewards, preview, resources |
| 21 — Customize and ethical acquisition | Add character-first ownership/store flows only after game value is proven | architectural | Customize UI, catalog, earned crate policy |
| 22 — Private multiplayer continuity | Support invite social play without advertising empty public matchmaking | architectural | room/session lifecycle, reconnect, results |
| 23 — Desktop release evidence | Validate the launch experience against product, craft, accessibility, and performance budgets | research | browser tests, usability evidence |
| 24 — Mobile product decision | After the desktop core works, prove touch play or explicitly remain desktop-first | research | touch input, devices, mobile evidence |

## Order

| Batch | Concerns | Why together |
|---|---|---|
| 0 | 13 | Every runtime and ownership assumption depends on convergence |
| 1 | 14 | The shell owns shared navigation and styling choke points; run alone |
| 2 | 15 | Prove the game loop before building identity, economy, or customization around it |
| 3 | 16, 19 | Guest/transport work is server/network-scoped; preview is isolated R3F presentation work |
| 4 | 17 | Builds the authenticated run lifecycle on the principal contract |
| 5 | 18 | Builds transactional economy commands on authenticated run semantics |
| 6 | 20 | Integrates run, reward, and preview into the deterministic first-session loop |
| 7 | 21 | Expands acquisition only after the guaranteed loop works |
| 8 | 22 | Adds private social continuity after identity and solo replay are proven |
| 9 | 23 | Produces desktop launch evidence after all launch surfaces are integrated |
| 10 | 24 | Evaluates mobile as a separate expansion without blocking desktop release |

## Dependency graph

| Concern | Blocked by | VERIFY_BLOCKER (30s check) |
|---|---|---|
| 13 | — | `git rev-list --left-right --count HEAD...origin/main` reports nonzero divergence today |
| 14 | 13 | `rg -n '^STATUS: done' plans/lunar-pup-vision/13-upstream-sync.md && git merge-base --is-ancestor origin/main HEAD` |
| 15 | 14 | `rg -n '^STATUS: done' plans/lunar-pup-vision/14-shop-lobby-v2.md && bun test src/ui/experienceState.test.ts` |
| 16 | 15 | `rg -n '^STATUS: done' plans/lunar-pup-vision/15-replay-worthy-solo-run.md && bun test src/modes/replayRun.test.ts` |
| 17 | 16 | `rg -n '^STATUS: done' plans/lunar-pup-vision/16-guest-principal-transport.md && bun test src/server/guestSession.test.ts` |
| 18 | 17 | `rg -n '^STATUS: done' plans/lunar-pup-vision/17-authenticated-run-lifecycle.md && bun test src/server/runLifecycle.test.ts` |
| 19 | 15 | `rg -n '^STATUS: done' plans/lunar-pup-vision/15-replay-worthy-solo-run.md && bun test src/modes/replayRun.test.ts` |
| 20 | 18, 19 | `bun test src/server/economyCommands.test.ts src/ui/previewState.test.ts` and both blocker files say `STATUS: done` |
| 21 | 20 | `rg -n '^STATUS: done' plans/lunar-pup-vision/20-guaranteed-reward-loop.md && bunx playwright test test/browser/first-session.spec.ts` |
| 22 | 16, 20, 21 | `bun test src/server/guestSession.test.ts` plus `bunx playwright test test/browser/first-session.spec.ts test/browser/customize.spec.ts`; all blocker files say `STATUS: done` |
| 23 | 21, 22 | `bunx playwright test test/browser/customize.spec.ts test/browser/private-multiplayer.spec.ts` and both blocker files say `STATUS: done` |
| 24 | 23 | `rg -n '^STATUS: done' plans/lunar-pup-vision/23-desktop-release-evidence.md && bunx playwright test test/browser/premium-flow.spec.ts` |

## Shared quality budgets

| Budget | Requirement |
|---|---|
| Press feedback | Visible within 100ms; no `transition: all` |
| Overlay feedback | Loading or result state visible within 100ms; progress/explanation after 2s |
| Motion vocabulary | 100ms micro, 150ms small entry, 200–250ms overlay, 300–400ms large transition, 500ms absolute cap |
| Accessibility | WCAG AA contrast, 3:1 focus/icon contrast, 44×44 coarse-pointer targets, complete keyboard path, reduced-motion and sound-off equivalents |
| Layout | No content jump after initial skeleton; no control or text clipped at supported desktop sizes |
| Desktop responsiveness | Main menu actionable within 2s under the agreed throttled browser profile; input feedback reaches the next rendered frame; proven run targets p95 frame time ≤18ms on reference hardware |
| Recovery | No raw codes, lost work, dead ends, or unexplained waits; retry preserves or replays the original operation |
| Lifecycle | Ten open/close or room-transition cycles return listener, subscription, timer, and scene-resource counts to baseline |

## Notes

- The harness integration remains the broader product wedge: sessions must stay short, interruptible, and readable on return.
- Fun before finance remains binding. Wallet identity, token purchasing, paid randomized rewards, tradable value, and mainnet are outside this plan.
- Chance rewards, if retained, are earned-only at launch with published odds, a skippable reveal, pity protection, and no duplicate loss. Monetization requires separate legal and product approval.
- Batch 3 is the only parallel implementation batch. Concerns 16 and 19 must use isolated worktrees; all shared shell, camera/input, run, economy, Customize, and multiplayer work is sequential.
- Estimated execution: 11 batches including convergence and the post-launch mobile decision.
- This is a plan-only run. Concerns remain open until implemented and verified.
