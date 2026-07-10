# 15 — Prove a replay-worthy solo run
STATUS: open
PRIORITY: p0
REPOS: lunarpup
COMPLEXITY: architectural
TOUCHES: src/game/, src/modes/, content/gamemodes/, src/r3f-shell/CameraRig.tsx, src/r3f-shell/TrickHud.tsx, src/styles.css, src/modes/replayRun.test.ts, docs/playtests/solo-run.md
BLOCKED_BY: 14

## Goal

Prove that Lunar Pup is enjoyable for a desktop arcade score-chaser before building an economy and customization funnel around it.

## Approach

Choose one short solo score-chasing mode as the launch proof. Prefer a 45–60 second trick run that teaches acceleration, one jump, and one readable aerial skill beat using the mechanics already central to Lunar Pup. The run needs a clear start, an always-readable goal, responsive scoring feedback, a meaningful near-miss, a compact result, and an immediate Play again action.

Tune control response, camera framing, terrain encounter cadence, trick readability, and scoring together. Do not broaden the move set or build multiple polished modes in this concern. The result screen should explain why the score changed, preserve the moon world behind it, show personal best context, and return to another run without routing through a store or menu.

Instrument the smallest useful product events without tying them to an external analytics vendor: first meaningful input, run start, first successful skill beat, finish, result shown, retry selected, and abandonment. Use elapsed-time targets as guardrails, not as substitutes for enjoyment.

Run an observed test with 5–8 representative desktop arcade players. Record confusion, control errors, whether they understand the score, and whether they voluntarily start a second run. Do not unblock economy work merely because the mode technically completes.

Apply the shared budgets while tuning: press/input feedback reaches the next rendered frame, gameplay targets p95 frame time at or below 18ms on the documented reference desktop, motion and results honor reduced motion, and any audio cue has an equivalent visual signal.

## Cross-Repo Side Effects

None.

## Verify

- A fresh desktop player reaches meaningful input within 20 seconds without reading documentation.
- The chosen run starts, scores, finishes, shows a result, and restarts without a reload or ambiguous navigation.
- HUD and result feedback remain readable at 1280×720 and 1920×1080 with keyboard-only operation.
- The run-event sequence is deterministic under unit tests and records no duplicate finish/retry event.
- `bun test src/modes/replayRun.test.ts` passes as the fast blocker check for identity and preview concerns.
- At least 5 representative players complete the observed test; at least 4 understand the goal unaided and at least 3 voluntarily start a second run. Qualitative “want another try” notes are captured.
- Any failure of the enjoyment gate reopens this concern for control/camera/mode tuning rather than being papered over by rewards.
- The documented load, input-response, p95 frame-time, reduced-motion, sound-off, focus, and recovery budgets pass for the complete run/result/retry loop.
- `bun run typecheck`, `bun test`, and `bun run smoke` pass with zero browser console errors.

## Implementation progress — 2026-07-10

The first run-loop slice is implemented, but this concern remains open for gameplay tuning and the observed enjoyment gate. Play now launches Crater Circuit directly, while Free skate remains a secondary no-clock option. The run HUD and result/retry surface are React-owned; the result preserves the moon world, explains score inputs, reports local personal-best context, covers loading/empty/error practice-board states, traps focus, pauses simulation, and restarts the same run without a reload or menu round trip.

`src/modes/replayRun.ts` records one deterministic sequence for run start, first meaningful input, first successful skill beat, finish or abandonment, result shown, and retry selected. Duplicate finish, result, input, skill, and retry actions are ignored by the pure reducer. Browser coverage exercises run → manual result → retry → result → keep skating at both 1280×720 and 390×844, including focus, inert background, 44px actions, extension-HUD coexistence, socket cleanup, reduced motion, and zero console/page errors.

Still required before `STATUS: done`: tune and observe the actual 45–60 second skill beat, camera framing, encounter cadence, near-miss readability, and score comprehension with 5–8 representative desktop arcade players. Record results in `docs/playtests/solo-run.md`; at least four must understand the goal unaided and at least three must voluntarily retry.
