# Lunar Pup product quality budgets

These budgets are release contracts for Concerns 14–24. A later concern may tighten them, but it must not silently redefine or waive them.

## Interaction and recovery

| Budget | Requirement | Evidence |
|---|---|---|
| Press feedback | A visible pressed state begins within 100ms. Transitions name their properties; `transition: all` is prohibited. | CSS inspection plus browser press-state check. |
| Overlay feedback | The requested overlay or its loading state appears within 100ms. After 2s, an in-progress operation explains what is happening. | Browser timing from input to first rendered state. |
| Motion vocabulary | 100ms micro feedback, 150ms small entry, 200–250ms overlays, 300–400ms large transitions, 500ms absolute cap. | CSS inspection and reduced-motion browser run. |
| Input response | Gameplay input affects the next rendered frame. | Frame-marked input test on reference hardware. |
| Recovery | No raw codes, lost work, dead ends, or unexplained waits. A retry preserves or safely replays the original operation. | Failure-path browser tests. |
| Lifecycle | Ten open/close or room-transition cycles return listener, subscription, timer, and scene-resource counts to baseline. | Instrumented browser lifecycle test. |

## Accessibility and layout

| Budget | Requirement | Evidence |
|---|---|---|
| Contrast | WCAG AA: 4.5:1 body text, 3:1 large text, icons, borders, and focus indicators. | Automated scan plus manual review over the live lunar scene. |
| Keyboard | Every action has a complete logical keyboard path. Dialogs trap focus, Escape pops one layer, and closing restores focus to the trigger. | Browser navigation assertions. |
| Touch targets | Every coarse-pointer target is at least 44×44 CSS px with at least 8px between adjacent targets. | Computed browser geometry at 390×844. |
| Reduced motion | Non-essential animation becomes instant under `prefers-reduced-motion: reduce`; no essential information depends on motion or sound. | Emulated-media browser run. |
| Readable scaling | UI remains usable at 200% browser zoom without clipped controls or lost actions. | Manual desktop browser check. |
| Layout stability | No content jumps after its initial skeleton; no control or text clips at supported desktop sizes. | Screenshot comparison and browser geometry assertions. |

## Loading and frame performance

| Budget | Requirement | Evidence |
|---|---|---|
| Menu readiness | Main menu is visible and actionable within 2s on a cold load using the throttled profile below. | Navigation timing, five runs, report median and worst. |
| Gameplay frame time | A proven run targets p95 frame time at or below 18ms on reference desktop hardware. | At least 60 seconds of production-build frame samples; exclude the first 2 seconds of shader warm-up and report p50/p95/max. |
| Mobile proof | Concern 24 alone may claim touch support; its separate gate is p95 ≤25ms and sustained average ≥45fps on named devices. | Real-device ten-minute sessions. |

## Reproducible browser profile

Use a production build with browser cache disabled and a fresh storage partition.

- Browser: Chrome for Testing, record the exact version in evidence.
- Viewports: 1280×720 desktop and 390×844 narrow/coarse-pointer composition.
- Network: 1.6 Mbps download, 750 Kbps upload, 150ms round-trip latency.
- CPU: 4× DevTools slowdown for menu-readiness checks.
- Motion runs: default and `prefers-reduced-motion: reduce`.
- Each timing result: five cold navigations; report median and worst, never only the best run.
- Console contract: zero uncaught exceptions and zero `console.error` messages.

The repository reference workstation for local desktop evidence is a 12th-generation Intel Core i7-12700K with 32 GiB RAM under x86-64 WSL. Record the Chrome version, operating system, device-pixel ratio, and WebGL renderer alongside every frame-time result. Headless SwiftShader results may validate behavior and layering but may not be used to claim the 18ms hardware-accelerated gameplay budget.

## Concern 14 shell assertions

- The layer order is Canvas `0`, ambient HUD `20`, transient feedback `40`, and dialog/menu `100+`.
- Play is the only primary destination; Settings is utility; Controls exists only under Settings.
- Customize, rooms, wallet, token purchase, and randomized acquisition controls are absent until their owning concerns ship.
- Canvas, HUD, and transient layers are inert and hidden from accessibility APIs while a modal surface owns focus.
