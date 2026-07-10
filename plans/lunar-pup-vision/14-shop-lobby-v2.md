# 14 — Build a reliable experience shell
STATUS: open
PRIORITY: p0
REPOS: lunarpup
COMPLEXITY: architectural
TOUCHES: src/r3f-shell/App.tsx, src/r3f-shell/IntentViews.tsx, src/r3f-shell/gameSystems.ts, src/ui/viewController.ts, src/ui/experienceState.ts, src/ui/mainMenu.ts, src/ui/pauseMenu.ts, src/ui/tokens.css, src/styles.css, docs/product-quality-budgets.md, src/ui/experienceState.test.ts, test/browser/experience-shell.spec.ts
BLOCKED_BY: 13

## Goal

Give every screen one owner and make navigation, layering, focus, pause, and interaction feedback feel predictable before new product surfaces are added.

## Approach

Re-audit the landed post-convergence owners first. Introduce a thin React-owned experience state machine for destination, origin, return target, and presentation mode. Session, economy, transport, simulation, input sampling, and frame-time transforms remain outside this machine.

Migrate visibility and navigation one surface at a time. As each surface moves, remove its imperative visibility listeners in the same change so React and a binder never own the same screen. Back and Escape pop exactly one layer. A view opened from the main menu returns to the menu; one opened from play returns to play; Settings opened from pause returns to pause. Every overlay traps focus, marks the background inert, restores focus to its trigger, and exposes a visible Back action.

Fix the rendered layer contract so Canvas, ambient HUD, transient feedback, intent views, and menus occupy explicit stacking levels. Include a browser assertion that speed and score are above the Canvas, not merely present in the DOM.

Reduce hierarchy without exposing unfinished destinations: Play is the primary action, Settings is utility, and Controls becomes a Settings child. Customize and social play appear only when their later concerns ship. Establish the craft baseline here—distinct display/UI typography, a single icon language, 44px targets, sub-100ms press feedback, consistent focus rings, reduced-motion behavior, color-independent state, and stable transition/latency budgets. Later concerns reuse this language rather than applying a final reskin.

Write the approved shared quality budgets from `00-overview.md` into `docs/product-quality-budgets.md` with a reproducible throttled-browser profile and reference desktop hardware. Every later concern cites the applicable budgets instead of redefining them.

Temporarily hide broken wallet/SPL and unaffordable acquisition affordances from player-facing navigation. Do not remove server code needed by later concerns.

## Cross-Repo Side Effects

None. Any preview or deployment environment used for browser review must run the matching API baseline.

## Verify

- A pure navigation matrix covers menu, play, and pause origins for every registered destination.
- `bun test src/ui/experienceState.test.ts` passes as the fast blocker check for later concerns.
- Back, Escape, backdrop dismissal, focus trap, inert background, and focus restoration pass automated browser checks.
- `elementsFromPoint` or an equivalent rendered check proves speed, score, minimap, and transient feedback sit above Canvas.
- StrictMode mount/unmount/remount leaves one listener, one subscription, and one UI owner per surface.
- All interactive targets are at least 44px on coarse pointers; keyboard and reduced-motion flows remain complete.
- Representative 1280×720 and 390×844 screenshots show stable composition and no raw wallet or acquisition dead ends.
- Press, overlay, motion, contrast, target-size, load, frame-time, recovery, and lifecycle checks use the numerical budgets in `docs/product-quality-budgets.md`.
- `bun run typecheck`, `bun test`, and `bun run smoke` pass with zero browser console errors.
