# Claude Code agent-event hook

This adapter forwards Claude Code `SessionStart`, `Notification`, and `Stop` hooks into the Lunar Pup agent harness endpoint.

## Environment

Set the same shared secret on the game server and the hook process. Also copy the owner key from the agent-harness extension owner row into the hook process; it scopes notifications to only your browser session.

```sh
export AGENT_EVENT_TOKEN="replace-with-a-long-random-token"
export AGENT_EVENT_ENDPOINT="http://localhost:3001/agent/event"
export AGENT_EVENT_OWNER_KEY="paste-the-owner-key-from-the-game-hud"
```

`AGENT_EVENT_ENDPOINT` defaults to `http://localhost:3001/agent/event` when omitted. `AGENT_EVENT_OWNER_KEY` is required.

## Claude Code hooks

Add this to your Claude Code `settings.json` hooks block. Use an absolute path if Claude Code runs outside this repository.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "AGENT_EVENT_OWNER_KEY=paste-the-owner-key-from-the-game-hud bun content/extensions/agent-harness/adapters/claude-code/agent-event-hook.ts"
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "AGENT_EVENT_OWNER_KEY=paste-the-owner-key-from-the-game-hud bun content/extensions/agent-harness/adapters/claude-code/agent-event-hook.ts"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "AGENT_EVENT_OWNER_KEY=paste-the-owner-key-from-the-game-hud bun content/extensions/agent-harness/adapters/claude-code/agent-event-hook.ts"
          }
        ]
      }
    ]
  }
}
```

The hook reads Claude Code's JSON hook payload from stdin, converts it to the shared `AgentEvent` contract, and POSTs it with `Authorization: Bearer $AGENT_EVENT_TOKEN` and `ownerKey: $AGENT_EVENT_OWNER_KEY`.
