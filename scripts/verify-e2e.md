# Phase A7 — end-to-end verification

Two paths: automated (no real Claude needed) and manual (real Claude).

## Automated (always green)

The integration test in `paperclip-master/packages/adapters/aliaskit-vm/src/server/execute.test.ts`
exercises the **full protocol roundtrip**:

```
adapter.execute()
  ↓ WebSocket connect
agent-runtime daemon (real, on a free port)
  ↓ child_process.spawn
/bin/cat (stand-in for `claude`)
  ↓ stdin = wakePayload
/bin/cat echoes stdin back to stdout
  ↓ daemon captures stdout in real time
{stream:"stdout",chunk} frames over WS
  ↓ adapter.execute receives them
ctx.onLog("stdout", chunk) callback fires
  ↓ daemon emits final res frame on /bin/cat exit
adapter.execute resolves with { exitCode: 0, ... }
```

Run:
```
cd paperclip-master
pnpm --filter @paperclipai/adapter-aliaskit-vm exec vitest run
pnpm --filter @paperclipai/agent-runtime exec vitest run
pnpm --filter @paperclipai/server exec vitest run src/__tests__/zootropolis-delegation.test.ts
```

All 17 tests should pass.

## Manual (requires real Claude installed and a running Paperclip)

1. `./scripts/dev.sh` (uses repo-local `.paperclip/`).
2. In another terminal: `pnpm tsx scripts/seed-zootropolis-demo.ts` — creates
   the 5-layer demo tree.
3. Open `http://localhost:5173/orgchart` and confirm the layer-pill colors
   appear on each agent.
4. Open `http://localhost:5173/campus/<companyId>` and walk down through the
   layers (campus → building → floor → room → agent).
5. Inside Paperclip's normal issue UI, create an issue assigned to a leaf
   agent (e.g., `backend-worker-1`). Description: "Write a one-sentence
   octopus fact into your closing comment."
6. Trigger a heartbeat manually (Paperclip CLI: `pnpm paperclipai agent wake
   <agent-id>`) or wait for the next scheduled tick.
7. Watch the issue page: logs should stream live as Claude works inside
   `~/zootropolis/agents/<agent-id>/`. The issue should close with the result.
8. Run again — the `--resume` flag should pick up the same Claude session.
   Confirm by inspecting `~/zootropolis/agents/<agent-id>/.claude/sessions/`.

## Delegation contract verification (manual)

With `ZOOTROPOLIS_DELEGATION_STRICT=true` set:

1. Try to assign an issue from a building agent directly to a leaf (skipping
   floor + room). The API should 409 with the rule message.
2. Try to assign from a leaf to a peer leaf. Same — 409.
3. Try to fetch an issue you're not a party to via the agent's API key. 404.
