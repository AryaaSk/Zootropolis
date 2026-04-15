# Zootropolis External Daemon — Quickstart for Another Agent

You are building the **agent-side** runtime that Paperclip (Zootropolis fork)
will connect to. Your job: listen on a WebSocket port, spawn `claude` inside
a per-agent folder on each heartbeat, stream stdout back, return a result.

Paperclip never provisions your runtime — every agent's endpoint URL is
manually supplied by the human operator via the campus UI at hire time.

This doc is the short version. For the full spec (all frame types, auth,
graduation path, worked Python skeleton) see
[`agent-runtime-contract.md`](./agent-runtime-contract.md).

## What you own

One long-lived process per leaf agent. Each process:

- Serves a WebSocket on a TCP port of your choosing.
- Owns a local folder at `<root>/<agent-id>/` — the agent's whole world.
- On each heartbeat: spawns `claude` in that folder with the wake payload on
  stdin, streams stdout/stderr back, returns a result frame.
- Stays alive between heartbeats. Only exits on `shutdown` request.

## Wire protocol (JSON over WebSocket, protocol version 1)

**1. Paperclip connects, sends `hello`. You reply `ready`.**

```jsonc
// → incoming from Paperclip
{ "type": "hello", "agentId": "uuid", "token": "optional-bearer" }

// ← you send
{ "type": "ready", "agentId": "uuid", "caps": { "sessionResume": true } }
```

Do this within 3 seconds — Paperclip's test endpoint will time out otherwise.

**2. Paperclip sends an `execute` request per heartbeat.**

```jsonc
// → incoming
{
  "type": "req",
  "id": "unique-request-id",
  "method": "execute",
  "params": {
    "runId": "heartbeat-run-id",
    "wakePayload": { /* see below */ },
    "resumeSessionId": "prior-claude-session-id-or-null",
    "timeoutMs": 600000
  }
}
```

**3. You stream stdout/stderr chunks back as they arrive.**

```jsonc
// ← you send, many times
{
  "type": "stream",
  "reqId": "unique-request-id",  // matches the req.id
  "stream": "stdout",             // or "stderr"
  "chunk": "partial text..."
}
```

Send every chunk immediately — don't buffer. The Paperclip UI renders a live
transcript from these frames; latency matters.

**4. When `claude` exits, you send the final `res`.**

```jsonc
// ← you send, once
{
  "type": "res",
  "id": "unique-request-id",
  "ok": true,  // exitCode === 0
  "result": {
    "exitCode": 0,
    "signal": null,
    "timedOut": false,
    "sessionId": "claude-session-id-for-next-resume",
    "usage": { "inputTokens": 123, "outputTokens": 456 },
    "resultJson": { /* the last JSON line claude emitted on stdout */ }
  }
}
```

**5. On shutdown request, reply `ok:true` then exit.**

```jsonc
// → incoming
{ "type": "req", "id": "shutdown-id", "method": "shutdown" }

// ← you reply, then exit within ~2 seconds
{ "type": "res", "id": "shutdown-id", "ok": true, "result": { "exitCode": 0, "signal": null } }
```

## Wake payload (what to feed into `claude`'s stdin)

```jsonc
{
  "reason": "issue_assigned" | "comment" | "ping" | "...",
  "issue": {
    "id": "uuid",
    "identifier": "ENG-12",
    "title": "Research octopuses",
    "status": "in_progress",
    "priority": "medium"
  } | null,
  "comments": [
    { "id": "uuid", "body": "...", "createdAt": "ISO-8601",
      "author": { "type": "agent" | "user", "id": "uuid" } }
  ],
  "commentWindow": { "requestedCount": N, "includedCount": M },
  "truncated": false
}
```

**Pipe this verbatim to `claude`'s stdin.** Don't interpret it — the
`skills/zootropolis-paperclip.md` skill (which Paperclip installs into the
agent's folder on first execute) tells claude how to read it and respond.

## Spawning `claude`

```bash
# fresh session
claude < wake-payload.json

# resumed session (when resumeSessionId is present)
claude --resume <sessionId> < wake-payload.json
```

- Set `cwd` to `<root>/<agent-id>/`.
- If `--resume` fails (stale cache), retry once without it.
- Capture stdout+stderr line-by-line; emit `stream` frames in real time.
- On exit, parse the **last JSON line of stdout** for:
  - `sessionId` (or `session_id`) → `ExecuteResult.sessionId`
  - `usage.{inputTokens, outputTokens, cachedInputTokens}` → `ExecuteResult.usage`
  - the whole JSON → `ExecuteResult.resultJson`

## Folder layout — bootstrap on first execute

```
<root>/<agent-id>/
  .claude/
    sessions/                             # managed by claude CLI
    skills/zootropolis-paperclip/
      SKILL.md                            # Paperclip agent-interaction skill; you write on bootstrap
  workspace/                              # scratch files
  CLAUDE.md                               # role + close-marker reminder; you write on bootstrap
  memory.md                               # durable notebook; you write on bootstrap
  runtime.log                             # your own log
```

Idempotent bootstrap — if `.claude/` exists, assume bootstrapped and skip.

**Identity is worker-side, not Paperclip-side (Phase Z).** Your daemon
does NOT fetch any identity from Paperclip. Instead, each remote
worker runs its own AliasKit skill locally that owns its external-world
persona (email / phone / card / TOTP). The same identity follows the
worker across every company it powers. Install / configure the
AliasKit skill on the VM alongside this daemon; invoke it from Claude
when a task needs internet credentials.

**Skill location matters.** Claude Code discovers per-project skills at
`<cwd>/.claude/skills/<name>/SKILL.md`. A plain `skills/foo.md` at the
project root is NOT picked up.

`CLAUDE.md` template (you can copy this verbatim):

```markdown
# Zootropolis Agent

You are a leaf worker in a Zootropolis agent campus. Read your
skills/zootropolis-paperclip.md file — it's the protocol manual for
how to interact with Paperclip (wake payload shape, close marker,
delegation rules).

When you complete a task, emit this as your LAST line of stdout:

  {"zootropolis":{"action":"close","status":"done","summary":"<one line>","artifact":"<full markdown>"}}

The artifact becomes the issue's closing comment and the issue
transitions to done.
```

`memory.md` template:

```markdown
# Durable memory

This file persists across heartbeats. Use it for long-term notes.
```

## Identity — worker-managed (Phase Z)

Paperclip **no longer** provisions or serves AliasKit identity for leaf
agents. The old `GET /api/companies/:id/agents/:id/identity` route is
removed; the `agents.metadata.zootropolis.aliaskit` field is gone from
the schema. There is nothing to fetch and no `companyId` required by
the daemon itself.

Instead:

- Install a local **AliasKit skill** on the VM that hosts this daemon.
  The skill owns the credentials (email, phone, card, TOTP) the worker
  presents to the outside world.
- When a task requires those credentials, Claude invokes the local
  skill — it doesn't reach back to Paperclip.
- The same AliasKit identity stays with the worker across every
  company/agent-wrapper it powers. One worker = one internet persona.

This matches the real-world analogy: a contractor working for 5
companies doesn't have 5 different email addresses. They have their
own, and they bring it along.

## Registering your daemon with Paperclip

The human operator hires the leaf agent via the campus UI and provides your
endpoint URL at that moment. Concretely:

- Operator visits `http://localhost:5173/campus/<companyId>`.
- Operator clicks **+ Hire an agent** (only visible on the campus root).
- Form asks for: `name`, `role`, `title`, and (required) `Agent runtime
  endpoint` — they paste `ws://<your-host>:<your-port>/`.
- Operator submits. Paperclip creates an agent with:
  - `adapterType: "aliaskit_vm"`
  - `adapterConfig.externalEndpoint: "ws://your-host:your-port/"`
  - `adapterConfig.runtimeEndpoint: "ws://your-host:your-port/"` (same)
  - `metadata.zootropolis.layer: "agent"`
- Paperclip's adapter will now dial your endpoint on every heartbeat.

## Probe endpoint

Paperclip exposes `GET /api/agents/:id/runtime-probe` which opens a brief
WebSocket to your endpoint, sends `hello`, waits 2s for `ready`, and returns
`{ reachable: boolean, error?: string }`. The campus UI calls this every 10s
while a leaf is on screen and shows a red indicator above the agent when
unreachable. Make sure your `hello → ready` handshake responds quickly.

## What your daemon MUST NOT do

- Don't interpret the wake payload.
- Don't share a WebSocket across agents. One WS per agent per heartbeat.
- Don't buffer streams — send every stdout chunk as it arrives.

## Verification

1. Start your daemon at `ws://localhost:7100/` (or wherever).
2. Run Paperclip: `cd ~/Desktop/Zootropolis && ./scripts/dev.sh` (in another
   terminal).
3. Create a company and hire one agent pointing at your URL.
4. In the campus UI, click the agent. The drawer's agent panel shows its
   runtime endpoint and a live reachability indicator.
5. Assign the agent an issue with a trivial prompt. Paperclip fires a
   heartbeat; your daemon receives an `execute` req; you spawn claude;
   stdout streams back; claude emits the close marker; the issue closes.

For the exhaustive spec (auth, graduation to real VMs, shutdown semantics,
edge cases), see `agent-runtime-contract.md`.
