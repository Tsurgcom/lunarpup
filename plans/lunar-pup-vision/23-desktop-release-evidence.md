# 23 — Produce desktop premium-release evidence
STATUS: open
PRIORITY: p0
REPOS: lunarpup
COMPLEXITY: research
TOUCHES: test/browser/, package.json, docs/product-quality-budgets.md, docs/playtests/, README.md, plans/lunar-pup-vision/
BLOCKED_BY: 21, 22

## Goal

Demonstrate that the desktop launch experience is enjoyable, coherent, accessible, performant, recoverable, and ready to release without relying on screenshots or green unit tests alone.

## Approach

Add a persistent browser suite for pristine and returning guest journeys, navigation origins, proven run, guaranteed reward/equip/replay, Customize eligibility/acquisition, earned crate, private multiplayer, offline/retry, reduced motion, sound-off, and keyboard-only completion. Capture screenshots as evidence, not sole assertions.

Audit the accumulated craft language: Play is unmistakable; typography is disciplined; pup/world remain primary; press feedback is immediate; transitions explain state; loading preserves layout; errors preserve work; no interaction creates unexplained wait.

Measure the numerical budgets fixed in `docs/product-quality-budgets.md` on documented reference hardware/profile. Run keyboard and screen-reader checks on DOM surfaces, contrast/readable-scaling checks, and StrictMode lifecycle checks.

Conduct an observed release study with 5–8 desktop arcade players using pristine profiles. Measure input, run understanding/completion, reward comprehension, Wear it, return, second-run start, backtracks, abandonment, and enjoyment. Run a second smaller Customize pass.

Reconcile documentation and statuses with reality. Do not promote mobile, wallet, paid randomness, public matchmaking, or mainnet.

## Cross-Repo Side Effects

Release/deployment metadata and marketing copy must match supported desktop/private/wallet-free scope.

## Verify

- `bunx playwright test test/browser/premium-flow.spec.ts` passes as the fast blocker check for the optional mobile decision.
- The persistent browser suite passes locally and in CI for pristine and returning guests.
- Reference hardware meets ≤2s actionable shell, next-frame input feedback, p95 gameplay frame time ≤18ms, transition, contrast, 44px, recovery, and lifecycle budgets.
- Keyboard, focus, screen-reader status, readable scaling, reduced motion, and sound-off equivalents pass.
- At least 5 representative players complete the release study; second-run intent meets or improves concern 15 and Customize does not reduce return-to-play.
- README/release copy makes no unsupported mobile, wallet, paid-randomness, public-matchmaking, or anti-cheat claim.
- `bun run typecheck`, `bun test`, and `bun run smoke` pass with zero console errors.
