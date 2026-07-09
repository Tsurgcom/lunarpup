STATUS: open
PRIORITY: P0
COMPLEXITY: medium
TOUCHES: src/agent/, src/ui/, adapters/claude-code/
BLOCKED_BY: 01

# 02 — AI-harness integration + notifications

The wedge feature: any harness posts agent events; the game surfaces them and alerts the
player the moment human input is needed.

- Server ingestion: HTTP webhook + WS channel accepting agent-event protocol messages
  (per-session auth token).
- Claude Code adapter: hooks (Notification / Stop / SessionStart) posting to the webhook —
  installable script + README.
- Client: agent status HUD (which agents running, current status), and on `needs_input`:
  in-game pulse/flash, WebAudio bark, browser Notification API (permission-gated).
- Events appended to the event ledger for later Timescale analytics.

DONE WHEN: fake harness event via curl triggers HUD update + notification path in tests;
adapter script posts real Claude Code hook payloads; tsc+tests green.
