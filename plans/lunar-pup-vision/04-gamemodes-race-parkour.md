STATUS: open
PRIORITY: P1
COMPLEXITY: medium
TOUCHES: src/modes/, src/ui/, content/gamemodes/
BLOCKED_BY: 01

# 04 — Gamemode framework + race + parkour

Gamemode runtime on the loop hooks; race and parkour ship as the first two package-based
modes proving the framework.

- Runtime: mode lifecycle (init/start/tick/end), checkpoint system, timers, scoring,
  win conditions, results screen.
- Race: checkpoint circuit on the procedural terrain, best-lap times.
- Parkour: platform/obstacle course, fall-reset, completion time.
- Modes defined as gamemode packages (data + parameters), loaded via the registry.
- Run samples (position over time) appended to the event ledger → ghost replays later.

DONE WHEN: a race can be started, checkpoints trigger in order, finish produces a scored
result; same for parkour; both defined as packages; tsc+tests green.
