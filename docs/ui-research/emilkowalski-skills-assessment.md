# emilkowalski/skills — fit assessment for Lunar Pup UI

Source: https://github.com/emilkowalski/skills (MIT licensed, small repo — 6 markdown files, no source code). Author: Emil Kowalski (Sonner, Vaul, animations.dev, ex-Vercel/Linear).

## What it actually is

Not a component library, not an npm package with runtime code. It is a set of four **Claude Code / agent "skills"** — markdown files with `SKILL.md` frontmatter, meant to be loaded as instructions for an AI coding agent so the agent writes/reviews UI code with better taste. Installed via `npx skills@latest add emilkowalski/skills`, which just copies these files into a project's `.claude/skills/` (or equivalent) directory. There is no CSS, no JS, no components to import — every "recipe" in it is prose + inline code snippets meant to be transcribed by hand (or by an agent) into your own codebase.

File tree:

```
skills/emil-design-eng/SKILL.md        — main knowledge base: animation decision framework,
                                          easing/duration tables, springs, component-building
                                          principles (buttons, popovers, tooltips, toasts),
                                          clip-path recipes, gesture/drag rules, performance
                                          rules, a11y, and "Sonner principles" for shipping a
                                          loved component.
skills/review-animations/SKILL.md      — a strict reviewer persona: 10 non-negotiable
  + STANDARDS.md                         standards, escalation triggers, a markdown
                                          before/after/why table output format, block/approve
                                          verdict. STANDARDS.md is the same rules as
                                          emil-design-eng, reformatted as a lookup reference.
skills/animation-vocabulary/SKILL.md   — reverse-lookup glossary ("the bouncy thing" →
                                          "Pop in") for naming effects precisely when
                                          prompting an AI or a designer.
skills/apple-design/SKILL.md           — Apple's WWDC "Designing Fluid Interfaces" /
                                          typography / materials talks distilled for the web:
                                          springs over fixed-duration animation, interruptibility,
                                          velocity handoff, momentum projection, rubber-banding,
                                          translucent materials, optical typography.
```

License: MIT (`LICENSE` in repo root, copyright Emil Kowalski). MIT permits verbatim or modified reuse of any text/code in the repo, with attribution retained if redistributed as a standalone copy of the files. Since we'd mostly be transcribing individual small snippets (a cubic-bezier value, a scale(0.97) rule) into our own files rather than redistributing the skill files themselves, there's no practical licensing friction either way — but if we copy `SKILL.md`/`STANDARDS.md` wholesale into this repo's `.claude/skills/`, keep the LICENSE file alongside them.

## How it maps onto our stack

Our UI is: R3F for the 3D scene, plain DOM overlays (`src/r3f-shell/*.tsx` for the React-mounted shells, `src/ui/*.ts` for imperative logic bound to that DOM), one shared CSS custom-property system (`src/ui/tokens.css`), plain CSS transitions/keyframes in `src/styles.css` (no Framer Motion / Motion library, no Radix, no Vaul). That matters a lot for fit: most of `emil-design-eng` and `review-animations` is framework-agnostic CSS/vanilla-JS and drops straight in. `apple-design`'s spring/gesture sections assume either a spring library (Motion) or hand-rolled rAF physics — we have neither, so those need translation, not copy-paste.

### Fit matrix

| Area | Verdict | Why / where it lands |
|---|---|---|
| Easing curves, duration bands (`emil-design-eng`, `STANDARDS.md`) | **Usable, already largely adopted** | `src/ui/tokens.css` already defines `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)` (a strong expo-out, close cousin of the skill's `cubic-bezier(0.23, 1, 0.32, 1)`) and a `--dur-instant/fast/base/slow/slower` ladder (80/140/240/420/680ms) that lines up almost exactly with the skill's button-feedback (100-160ms) / dropdown (150-250ms) / modal-drawer (200-500ms) bands. No action needed beyond spot-checking new code against the existing tokens instead of hand-rolled durations. |
| Press feedback (`transform: scale(0.97)` on `:active`) | **Adopt — gap found** | `.lp-button` in `src/styles.css:73-98` has a `:hover`/`:focus-visible` background transition but **no `:active` state at all** — confirmed by grepping the whole CSS surface. Same gap on `.main-menu-item`, `.pause-item`, and every other pressable element. This is the single highest-leverage, lowest-cost fix in the whole assessment. |
| Toast rail (`emil-design-eng` "Sonner principles", `translateY(100%)` percentage rule) | **Adapt** | `src/ui/toast.ts` + `.lp-toast` (`src/styles.css:478-505`) already do the right structural thing — CSS *transitions* (not keyframes) driven by a `lp-toast-in` class toggle, so it's interruptible, matching the skill's #1 toast rule. Two gaps: (1) it animates a fixed `translateY(-10px)`, not a percentage of the toast's own height (the skill calls out `translateY(100%)`/`translateY(-100%)` as literally how Sonner positions toasts, robust to content height); (2) no drag-to-dismiss/momentum threshold — dismissal is click or timer only. |
| Intent-view sheets (`IntentViews.tsx`, apple-design's sheet/drawer section) | **Adapt, partially** | `.lp-view`/`.lp-scrim` (`src/r3f-shell/IntentViews.tsx`, `src/styles.css:1425-1460`) are centered, dialog-style overlays with `opacity`+`translateY(14px)` entrance at `--dur-slow` (420ms) — correctly *not* origin-anchored, since per the skill modals/full-screen dialogs are exempt from trigger-anchored `transform-origin` and should stay centered. That part is already right. What's missing if we ever want these to read as true "sheets" (drawer-from-edge, draggable, swipe-to-dismiss) is the whole Vaul-style gesture layer — rubber-banding at the boundary, velocity-based dismissal, pointer capture — none of which exists today. Given this is a desktop-first, keyboard/mouse skate game, this is optional polish, not a gap that needs closing now. |
| Popover/tooltip origin-awareness (`--radix-popover-content-transform-origin` etc.) | **Skip (not applicable yet)** | We have no Radix/Base UI, and grepping `src/r3f-shell` + `src/ui` turns up no tooltip/popover component today. The technique (scale from trigger rect, not center) is worth keeping in mind the moment one gets added (e.g. a minimap zoom flyout or a cosmetics item tooltip), but there's nothing to retrofit right now. |
| Springs / Framer Motion recipes (`useSpring`, `motion.div animate={{ x }}`, Apple's damping/response params) | **Skip as literal code, adapt as principle** | We don't use Framer Motion or any spring library, and R3F drives the 3D layer while overlays are plain DOM/CSS. If we ever add a draggable HUD element or gesture-driven camera nudge, the *principles* (animate from current not target value on interrupt, hand off release velocity, project momentum rather than snapping to release point, rubber-band at boundaries) are the right mental model — but they'd need a hand-rolled `requestAnimationFrame`/WAAPI implementation, not a library import. |
| `prefers-reduced-motion` handling | **Already adopted** | `src/ui/motion.ts` (`prefersReducedMotion()`, injectable matcher for testability) plus CSS gates at `src/styles.css:627-640` (`@media (prefers-reduced-motion: no-preference)` gating decorative pulses on, the inverse but equivalent framing of the skill's "disable movement, keep opacity/color" rule), `:1293-1302`, `:824-829`, `:873-879`. This already matches the skill's a11y section; no gap. |
| Physically-correct entrances (never `scale(0)`) | **Already adopted** | The trick-result-pop keyframe (`src/styles.css:182-193`, `0% { transform: translate(-50%, 16px) scale(0.9) }`) already starts from `scale(0.9)` with an overshoot to `1.08`, exactly the pattern the skill recommends and explicitly warns against skipping (`scale(0)` from nowhere). No gap. |
| `review-animations` skill / STANDARDS.md as a reviewer | **Usable directly, meta-level** | This is a drop-in Claude Code skill file, not application code. Copying `skills/review-animations/` and `skills/emil-design-eng/` into this repo's own `.claude/skills/` would make future agent sessions touching `src/ui`/`src/r3f-shell` self-check against these exact rules (the ten non-negotiable standards, the before/after/why table format) without re-deriving them each time. Zero code risk, pure process win. |
| `animation-vocabulary` glossary | **Usable directly, low value here** | Handy if a human is describing a desired effect to an agent ("the bouncy thing when the crate opens" → "Pop in" / overshoot). Nice-to-have, not a UI change. |

## Top 5 concrete adoptions for Lunar Pup

1. **Add press feedback to every pressable element.** In `src/styles.css`, extend `.lp-button` (currently lines 73-98, hover/focus-visible only) with:
   ```css
   .lp-button:active:not(:disabled) {
       transform: scale(0.97);
   }
   .lp-button {
       transition: background var(--dur-fast) var(--ease-standard),
                   transform var(--dur-fast) var(--ease-out);
   }
   ```
   Mirror the same `:active` rule on `.main-menu-item` and `.pause-item` (same file, the main-menu/pause-menu blocks around lines 1081-1224) so the whole menu system feels consistently "alive." This is the single biggest gap found — nothing in the game currently gives tactile feedback on press, anywhere.

2. **Make the toast rail's transform percentage-based and add a velocity-aware dismiss.** In `src/styles.css` (`.lp-toast`, lines 489-505) switch the fixed `translateY(-10px)` entrance offset to a percentage (`translateY(-100%)`) so it scales correctly regardless of message length/wrapping — this is literally the technique the skill says Sonner uses. Then, in `src/ui/toast.ts`, add an optional drag handler with a velocity threshold (`distance/elapsedMs > ~0.11` dismisses regardless of distance) so a quick swipe on a toast dismisses it, matching Sonner's actual UX rather than click-or-wait-only.

3. **Adopt the token system's existing alignment as a written house rule, and close the one duration gap it has.** `tokens.css`'s ease/duration ladder already tracks the skill's tables closely; formalize "never hand-roll a `cubic-bezier` or a raw `ms` value outside `tokens.css`" as an explicit rule for future UI work (there is currently no such rule stated anywhere in the repo, even though the practice is mostly followed). While auditing, note `--dur-instant` (80ms) has no current consumer for button press — wiring it into the new `:active` rule from item 1 instead of `--dur-fast` would make press feedback feel even snappier per the skill's 100-160ms band.

4. **Codify `@media (hover: hover) and (pointer: fine)` gating before adding any new hover-triggered motion.** Nothing today violates this (existing hover states are simple background swaps, not transforms), but the moment a hover-scale or hover-reveal effect is added anywhere in `src/styles.css`, it should be gated — worth adding to whatever style-contribution notes exist in `docs/architecture.md` so it isn't missed later, since Lunar Pup could plausibly ship to a touch/Steam Deck context where false-positive tap-hover would otherwise fire a scale animation on every tap.

5. **Install `emil-design-eng` and `review-animations` as actual Claude Code skills in this repo.** Copy `skills/emil-design-eng/SKILL.md` and `skills/review-animations/{SKILL.md,STANDARDS.md}` (plus the LICENSE) into this project's skill directory, or run `npx skills@latest add emilkowalski/skills` from the repo root. This costs nothing in application code and means every future agent session touching `src/ui/*.ts` or `src/r3f-shell/*.tsx` gets the animation-decision framework and the strict before/after/why review format applied automatically, instead of relying on someone remembering to ask for a motion review.

## What doesn't apply and why

- Anything keyed to Framer Motion/Motion's `x`/`y`/`scale` shorthand vs. full `transform` string performance warning — moot, we don't use that library.
- Radix/Base UI `transform-origin` CSS variables — moot, no such dependency; would need manual `getBoundingClientRect()`-based origin calculation if we ever add a trigger-anchored popover.
- The gesture/drag sections of `apple-design` (pointer capture, velocity handoff, momentum projection, rubber-banding as a full system) — real and well-written, but there is currently no draggable UI element in `src/ui`/`src/r3f-shell` to apply them to. Revisit if a draggable HUD element, drag-to-reorder cosmetics list, or swipe gesture is added.
- Translucent-materials/backdrop-filter depth guidance — we already use `--panel-blur: blur(12px)` + semi-transparent backgrounds consistently (`tokens.css` `--panel-bg`, `--panel-bg-strong`), so the underlying pattern is already in place; no new work indicated.
