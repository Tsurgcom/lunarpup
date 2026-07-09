# Lunar Pup Claude Briefing

Read `AGENTS.md` before changing this repository. It is the full cross-agent workflow and architecture guide.

Project target: one production React + R3F game. The default entry is `index.html`; the vanilla entry is temporary reference tooling only. Keep frame-time simulation mutable in R3F refs and `useFrame`, and reserve React state for human-paced UI and coarse session/settings state.

Core checks:

```bash
bun run typecheck
bun test
bun run build
```

Before a batch, read `R3F-MIGRATION-PLAN.md` and `CONTRIBUTING.md`. After a bounded, verified commit, fetch `upstream` and rebase when `upstream/main` advanced. Draft PR #7 remains draft until the migration surface is self-contained and preview-tested.
