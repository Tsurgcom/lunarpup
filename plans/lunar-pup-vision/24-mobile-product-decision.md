# 24 — Make an evidence-based mobile product decision
STATUS: open
PRIORITY: p1
REPOS: lunarpup
COMPLEXITY: research
TOUCHES: src/game/input.ts, src/r3f-shell/GameCanvas.tsx, src/r3f-shell/CameraRig.tsx, src/r3f-shell/TouchControls.tsx, src/r3f-shell/IntentViews.tsx, src/ui/mobile.css, src/ui/motion.ts, test/browser/mobile-run.spec.ts, docs/mobile-product-decision.md, README.md
BLOCKED_BY: 23

## Goal

After the desktop product works, determine whether Lunar Pup is genuinely enjoyable and technically credible on touch devices, then support mobile or explicitly remain desktop-first.

## Approach

Build a time-boxed landscape touch prototype for the proven run: left-thumb steering and a minimal right-side vocabulary for jump, boost, and the required trick. Adapt camera for touch rather than exposing mouse gestures. Respect safe areas, orientation, thumb reach, readable scaling, reduced motion, and visual alternatives to sound/haptics.

Precommit the device gate: iPhone 13-class hardware on the current supported iOS/Safari and Pixel 7a-class hardware on the current supported Android/Chrome, with exact OS/browser versions recorded. Test a ten-minute repeated-run session on both.

Pass requires: at least 4 of 5 observed touch testers complete the run; at least 3 voluntarily retry; median completion time is no more than 25% slower than the desktop study; no tester averages more than one critical accidental action per run; controls never overlap required HUD/pup/result actions; p95 frame time is ≤25ms with sustained average ≥45fps; the ten-minute session does not lose more than 20% average frame rate to thermal throttling.

If every gate passes, keep touch ownership and input-specific onboarding. Otherwise remove incomplete gameplay controls, retain responsive non-gameplay screens, record `desktop-first`, and remove mobile claims. Failure is a valid completed decision.

## Cross-Repo Side Effects

Store listings, marketing, deployment docs, and support scope must match the recorded decision.

## Verify

- `bunx playwright test test/browser/mobile-run.spec.ts` passes for touch semantics, safe areas, orientation, and input-specific copy.
- Real-device results for both named device classes and all numerical thresholds are recorded in `docs/mobile-product-decision.md`.
- The full run is completable without keyboard, mouse, browser zoom, or hidden gesture.
- Reduced-motion, sound-off, color-independent, readable-scaling, and recovery paths remain complete.
- Resolution states `mobile-supported` with evidence or `desktop-first` with gameplay controls/claims removed.
- `bun run typecheck`, `bun test`, and `bun run smoke` pass.
