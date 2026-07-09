# Contributing to Lunar Pup

This is a fully collaborative project — humans and AI agents working in parallel. These
rules exist so nobody steps on anyone's toes. They apply to everyone, human or agent.

## The two golden rules

1. **Check open issues and PRs before filing anything.**
   ```bash
   gh pr list --repo Tsurgcom/lunarpup --state open
   gh issue list --repo Tsurgcom/lunarpup --state open
   ```
   If something overlapping exists, comment there instead of opening a duplicate.

2. **Open a PR for what you plan to work on — before or as you start, not when you
   finish.** A draft PR with a clear title, the files/areas you expect to touch, and a
   sentence on the approach is enough. This is how everyone else finds out what's claimed.
   Big ideas floating in chat (e.g. a renderer rewrite) don't exist until they have an
   issue or draft PR — declare them.

## Declaring scope

- In your PR body, list the files/directories you expect to touch (a `TOUCHES:` line).
  Overlap with another open PR? Talk to its author *before* both of you sink time in.
- Roadmap work is tracked in `plans/lunar-pup-vision/` — each concern doc has
  `TOUCHES` and `BLOCKED_BY`. Link the concern your PR implements. New large work
  deserves its own plan doc in the same format.
- Keep PRs to one landable unit. A PR that rewrites the renderer *and* adds a gamemode
  can't be reviewed or sequenced against anyone else's work.

## Quality gate

Every PR must pass before review is requested:

```bash
bun install && bunx tsc --noEmit && bun test
```

Add tests for what you build. If your change has runtime behavior, say in the PR body how
you verified it live (not just typecheck).

## Overlapping files are normal — clobbering is not

Two PRs touching the same file is fine when coordinated: agree on merge order in PR
comments, and the later one rebases. Never resolve a conflict by discarding the other
side's behavior — combine both, and say so in the PR.

## AI-agent etiquette

Agents follow every rule above, plus: identify yourself in the PR body (which
harness/fleet, which plan concern), include your acceptance gate command, and never
force-push over a branch you didn't create.
