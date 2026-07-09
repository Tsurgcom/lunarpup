STATUS: closed
PRIORITY: P1
COMPLEXITY: medium
TOUCHES: src/net/, src/ui/multiplayer.ts, server room module
BLOCKED_BY: 01

# 06 — Multiplayer rooms & lobbies

Rooms so gamemodes are joinable instead of one global space.

- Server: create/join/leave/list rooms, per-room player rosters, broadcast scoped to room,
  per-room gamemode id, host controls (start mode).
- Client: lobby UI (room list, create with mode selection, join), roster display.
- Default free-skate room preserves current drop-in behavior.

DONE WHEN: two simulated clients in different rooms never see each other's state; room
with a gamemode starts it for all members; tsc+tests green.

## Resolution

landed df73a0f+1058e35 rebased (room protocol, lobby UI; PR #9)
