# 14 — Build a reliable experience shell
STATUS: done
PRIORITY: p0
REPOS: lunarpup
COMPLEXITY: architectural
TOUCHES: src/r3f-shell/App.tsx, src/r3f-shell/ExperienceProvider.tsx, src/r3f-shell/IntentViews.tsx, src/r3f-shell/ChatPanel.tsx, src/r3f-shell/MinimapPanel.tsx, src/r3f-shell/RosterOverlay.tsx, src/r3f-shell/TuningPanel.tsx, src/extensions/client.ts, src/ui/experienceState.ts, src/ui/tokens.css, src/styles.css, docs/product-quality-budgets.md, playwright.config.ts, test/browser/experience-shell.pw.ts
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

## Resolution

Replaced the post-convergence imperative shell with a thin `ExperienceProvider` and pure reducer while leaving `GameProvider`, simulation refs, Canvas, camera, and `useFrame` ownership unchanged. React now owns the main menu, pause menu, Settings, and the Controls child, including origin-aware one-layer Back/Escape behavior, pause and menu presentation, focus trapping, inert background layers, and trigger focus restoration. Play is the sole primary destination; unfinished Customize, social, wallet, SPL, shop, and acquisition affordances are absent from player navigation.

Removed the migrated `gameSystems`, `mainMenu`, `pauseMenu`, `viewController`, hotkey, and HUD-visibility listener paths rather than retaining dual owners. Canvas, ambient HUD, transient feedback, and menu/dialog layers now have an explicit tested stack. Coarse-pointer controls are at least 44px, reduced motion collapses transitions, press feedback stays within the shared vocabulary, and the numerical product budgets now live in `docs/product-quality-budgets.md`.

Evidence: the pure state matrix passes 10 tests; the full Bun suite passes 169 tests with one opt-in Postgres test skipped; typecheck, smoke, production build, and `git diff --check` pass. Playwright passes the desktop 1280×720 and narrow 390×844 projects with navigation, backdrop, focus trap/return, inert, layer, rendered HUD, ten-cycle listener/DOM lifecycle, touch-target, reduced-motion, and zero console/page-error assertions. Evidence screenshots are `/tmp/lunarpup-concern14-desktop.png` and `/tmp/lunarpup-concern14-narrow.png`.

A second review found ownership gaps at the extension, transient, and mode boundaries; a repair wave closed them. Extensions now receive shell-owned HUD/transient roots plus an abort signal and must return teardown — the agent-harness HUD mounts under `#extension-hud-root`, cleans up its socket, timers, listeners, and DOM, and body-appended UI is no longer possible. Toasts require a `ToastHost` registered by the shell and dispose on host teardown. Crater Circuit is reachable beneath Play as a solo run with shell-owned status/results surfaces and an honest End Run action that reports a practice result without submitting to the leaderboard. Physics tuning defaults are a frozen application constant (`physicsTuningDefaults`) so Reset restores true defaults regardless of runtime mutation.

Repair-wave evidence: the browser suite now runs against an extension-enabled server (`EXTENSIONS=agent-harness`, `reuseExistingServer: false` so a stale server can never poison the contract) and exercises a real authenticated agent-event round-trip, shell ownership of extension/toast/gamemode surfaces, solo-run lifecycle including socket open/close accounting (Bun's dev-reload socket excluded from the count), paint order, and the ten-cycle lifecycle balance. The HUD-layer visibility contract is honored by the test itself: agent events delivered while the menu covers play assert panel state, and visibility is asserted after entering play. Full chain re-verified: typecheck, 170 Bun tests (1 opt-in skip), smoke, production build, both Playwright projects, `git diff --check`, and zero console/page errors.
