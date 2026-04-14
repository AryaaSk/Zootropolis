# Zootropolis Agent Runtime — External Daemon Contract

This document specifies what an external daemon must do to be reachable by
Paperclip's `aliaskit_vm` adapter. If you implement this contract,
Paperclip will treat your daemon identically to the in-process dev daemon
shipped at `packages/agent-runtime/`.

**Protocol version:** 1 (see `PROTOCOL_VERSION` in
`packages/adapters/aliaskit-vm/src/shared/protocol.ts`).

**Audience:** anyone building a per-VM, per-container, or per-VPS runtime
that hosts a leaf agent's working environment and exposes it to Paperclip
over a network.

---

## 1. Lifecycle overview

```
┌───────────────────────────────────────────────────────────────────┐
│                           Paperclip server                         │
│  ┌──────────────────────┐                                          │
│  │ aliaskit_vm adapter  │                                          │
│  └──────────┬───────────┘                                          │
└─────────────┼─────────────────────────────────────────────────────┘
              │  one WebSocket connection per heartbeat
              │  (URL = agent.adapterConfig.runtimeEndpoint)
              ▼
┌───────────────────────────────────────────────────────────────────┐
│                  Your daemon (one per leaf agent)                  │
│                                                                    │
│   1. Listens on a TCP port (yours to choose; tell Paperclip the   │
│      URL via the registration step below).                         │
│   2. On WS connect → expects HelloFrame → replies ReadyFrame.     │
│   3. On ExecuteRequestFrame → spawns the underlying agent CLI     │
│      (e.g. `claude --resume <sid>`) inside the agent's folder,    │
│      pipes wakePayload to stdin, streams stdout/stderr back as    │
│      StreamFrames, returns ResponseFrame on exit.                  │
│   4. On ShutdownRequestFrame → flushes state, exits cleanly.      │
└───────────────────────────────────────────────────────────────────┘
```

The daemon is **hire-to-fire**. One WebSocket session per heartbeat is
fine; the daemon stays up between sessions.

---

## 2. Wire protocol

All frames are JSON-encoded text WebSocket messages. No binary. No
keepalive ping required (the WebSocket itself handles it).

The TypeScript type definitions are the source of truth — see
`packages/adapters/aliaskit-vm/src/shared/protocol.ts`. Reproduced below
for convenience:

### 2.1 Frame: hello (server → daemon)

Sent immediately after the WebSocket connects.

```ts
{
  type: "hello",
  agentId: string,           // the leaf agent's UUID; matches your daemon's bound agent
  token?: string             // optional bearer token; ignored by dev daemon, may be enforced in prod
}
```

The daemon should accept the connection if `agentId` matches the agent it
was provisioned for. (For probes — the adapter's `testEnvironment` path —
agentId may be the literal string `"probe"`; accept those too.)

### 2.2 Frame: ready (daemon → server)

Reply to hello.

```ts
{
  type: "ready",
  agentId: string,
  caps?: {
    sessionResume?: boolean,  // true if the daemon honours --resume <sid>
    screenshots?: boolean     // reserved for v1.2 (AgentView VNC fallback)
  }
}
```

Send this within ~3 seconds of the hello, otherwise the adapter's
`testEnvironment` probe will report `aliaskit_vm_runtime_probe_failed`.

### 2.3 Frame: req (server → daemon, method="execute")

Sent once per heartbeat run.

```ts
{
  type: "req",
  id: string,                 // unique request id; echo back in res + every stream frame
  method: "execute",
  params: {
    runId: string,            // Paperclip's heartbeat run id; for your logs
    wakePayload:              // the prompt/context for the underlying agent — see §3
      Record<string, unknown> | string,
    resumeSessionId?: string | null,  // last known session id; pass to claude --resume
    timeoutMs?: number        // soft timeout (ms); kill the child when exceeded
  }
}
```

Default `timeoutMs` is `600_000` (10 min) if absent.

### 2.4 Frame: stream (daemon → server)

Streamed log chunks during execute. Send every chunk of stdout/stderr as
it arrives — do not buffer.

```ts
{
  type: "stream",
  reqId: string,              // matches the execute req's id
  stream: "stdout" | "stderr",
  chunk: string               // utf-8 text; partial lines OK
}
```

The adapter forwards each chunk to Paperclip's `onLog` callback, which
persists it to `heartbeat_run_events` and broadcasts to live UI viewers.
Latency matters here.

### 2.5 Frame: res (daemon → server)

Final response to a req. Sent once when the underlying child process
exits (success or failure).

```ts
{
  type: "res",
  id: string,                 // matches the req's id
  ok: boolean,                // exitCode === 0
  result?: ExecuteResult,     // present on success
  error?: { code?: string, message: string, meta?: Record<string, unknown> }
}

interface ExecuteResult {
  exitCode: number | null,    // child process exit code, null if killed
  signal: string | null,      // signal name if killed by signal
  timedOut?: boolean,         // true if killed by your timeout
  sessionId?: string | null,  // updated session id; Paperclip stores for next --resume
  usage?: { inputTokens: number, outputTokens: number, cachedInputTokens?: number },
  resultJson?: Record<string, unknown> | null  // structured result; close-marker lives here
}
```

### 2.6 Frame: req (server → daemon, method="shutdown")

Sent when the agent is being fired (or when the broker is reconciling and
needs to recycle a stale daemon).

```ts
{ type: "req", id: string, method: "shutdown", params?: {} }
```

Reply with a `res` frame, then exit cleanly within a couple of seconds.

---

## 3. Wake payload schema

`wakePayload` is what the underlying agent process receives on stdin.
Paperclip generates it via `buildPaperclipWakePayload`
(`server/src/services/heartbeat.ts:930`). Shape (subject to extension; new
fields will be additive):

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
  "checkedOutByHarness": false,
  "executionStage": null | { ... },
  "commentIds": ["uuid", ...],
  "latestCommentId": "uuid" | null,
  "comments": [
    {
      "id": "uuid",
      "issueId": "uuid",
      "body": "string (may be truncated)",
      "bodyTruncated": false,
      "createdAt": "ISO-8601",
      "author": { "type": "agent" | "user" | "system", "id": "uuid|null" }
    }
  ],
  "commentWindow": { "requestedCount": N, "includedCount": M, "missingCount": K },
  "truncated": false
}
```

**The daemon should pipe this verbatim to the child's stdin.** Don't try
to interpret it — the child (e.g. claude with the `zootropolis-paperclip`
skill installed) knows how to read it.

---

## 4. Folder layout the daemon owns

The agent's folder is the root of its world. Reference layout — defined in
`packages/agent-runtime/src/folder-bootstrap.ts`:

```
<agentRoot>/<agentId>/
  .claude/         Claude CLI's own session cache (read by --resume)
  workspace/       Working files, git clones, intermediate scratch
  skills/          Agent skills; populated on first execute
    zootropolis-paperclip.md   <-- the Paperclip protocol skill (Phase D2)
  CLAUDE.md        Per-agent system prompt: role + delegation rules
  memory.md        Durable notebook, agent-edited
  identity.json    AliasKit creds (mocked in v1; real in v2)
  runtime.log      Daemon's own log
```

Your daemon should:

1. **Idempotently bootstrap the folder on first execute** if it doesn't
   exist. (Mirror `ensureFolderBootstrapped` in `folder-bootstrap.ts`.)
2. **Spawn the agent CLI with `cwd = <agentRoot>/<agentId>/`** so files
   it writes land in `workspace/` and skills resolve correctly.
3. **Persist between sessions** — the folder is the agent's long-term
   memory. Don't blow it away between heartbeats.

`<agentRoot>` defaults to `~/zootropolis/agents/` but can be overridden
with the `ZOOTROPOLIS_AGENTS_ROOT` env var. For an external daemon you
choose your own root; just make sure the path is stable for that agent.

---

## 5. Spawning the underlying agent

Reference implementation: `packages/agent-runtime/src/claude-invoker.ts`.

```bash
# Fresh session
claude < /tmp/wake-payload.json

# Resumed session (use whenever ExecuteRequestFrame.params.resumeSessionId is present)
claude --resume <sessionId> < /tmp/wake-payload.json
```

If `--resume` fails (stale session cache), retry once without it.

The daemon must:

1. Capture stdout+stderr line-by-line and emit `StreamFrame`s in real time.
2. On exit, parse the LAST line of stdout for a JSON object and extract:
   - `sessionId` (or `session_id`) → goes into `ExecuteResult.sessionId`
   - `usage.{input_tokens, output_tokens, cached_input_tokens}` → usage
   - The whole final JSON → `ExecuteResult.resultJson`
3. Return the `ResponseFrame`.

---

## 6. Issue-close marker (Phase D1)

The agent emits a JSON envelope as the last line of stdout when it has
completed its assigned issue:

```json
{"zootropolis":{"action":"close","status":"done","summary":"<one line>","artifact":"<markdown>"}}
```

This object becomes `ExecuteResult.resultJson`. Paperclip detects the
marker and (a) posts `artifact` as the closing comment and (b) transitions
the issue to `status="done"`.

**The daemon doesn't need to interpret the marker** — just preserve it in
`resultJson`. Server-side parsing happens in
`server/src/services/heartbeat-run-summary.ts`.

---

## 7. Identity

When an agent is hired, the `aliaskit_vm` adapter's `onHireApproved` hook
writes an `identity.json` into the agent's folder containing email/phone/
card/TOTP credentials (mocked in v1, real in v2 once AliasKit ships).

For an external daemon, two options:

- **Daemon-managed folder**: `onHireApproved` cannot reach your remote
  filesystem. You must call your provisioning API to seed `identity.json`
  yourself (Paperclip will write to its local `~/zootropolis/agents/<id>/`
  but that's irrelevant if your daemon is remote).
- **Bind-mount or HTTP fetch**: Paperclip writes to its local path; your
  daemon reads from a shared NFS mount or fetches via an HTTP endpoint
  Paperclip exposes. Out of scope for v1.1 — for now, expect to manage
  identity provisioning daemon-side until we add a `GET /api/zootropolis/
  agents/:id/identity` endpoint.

---

## 8. Authentication (optional in v1.1)

`HelloFrame.token` is optional. v1.1 broker doesn't generate tokens; for
prod deployments you'd want:

1. Broker generates a per-agent secret on hire (HMAC of agent.id with a
   server master secret).
2. Broker passes the secret to your provisioning API (out of band).
3. Adapter sends `{ token: <secret> }` in HelloFrame.
4. Daemon validates HMAC matches its provisioned secret before processing
   any req.

For dev / single-machine setups, run on `127.0.0.1` and skip auth.

---

## 9. Registration: telling Paperclip your daemon's URL

Two ways to set `agent.adapterConfig.runtimeEndpoint`:

### 9.1 At hire time

Pass `runtimeEndpoint` in the create-agent body:

```http
POST /api/companies/<companyId>/agents
Content-Type: application/json

{
  "name": "remote-leaf-1",
  "role": "engineer",
  "adapterType": "aliaskit_vm",
  "adapterConfig": {
    "runtimeEndpoint": "ws://10.0.0.5:7100/",
    "externalEndpoint": "ws://10.0.0.5:7100/"
  },
  "metadata": {
    "zootropolis": { "layer": "agent", "displayName": "Remote Leaf 1" }
  },
  "reportsTo": "<room-agent-uuid>",
  "budgetMonthlyCents": 5000,
  "runtimeConfig": {}
}
```

Setting `externalEndpoint` (Phase H2) signals the broker NOT to spawn a
local daemon; it just records the endpoint as-is. `runtimeEndpoint` is
what the adapter actually dials.

### 9.2 After hire (CLI helper, Phase H3)

```bash
npx tsx scripts/zootropolis-register-external.ts \
  --agent-id <agent-uuid> \
  --endpoint ws://10.0.0.5:7100/
```

This patches the agent's adapterConfig in-place. Useful when your
provisioning controller can only get the daemon URL after the VM boots.

### 9.3 Server mode

To force ALL `aliaskit_vm` agents to use external endpoints (and reject
hires that don't supply one):

```bash
ZOOTROPOLIS_RUNTIME_MODE=external_only ./scripts/dev.sh
```

---

## 10. Worked example: minimal external daemon

Skeleton in pseudocode (replace with your language of choice):

```python
import asyncio, json, websockets, subprocess, os

AGENT_ID = "uuid-from-provisioning"
PORT = 7100
FOLDER = f"/var/zootropolis/agents/{AGENT_ID}"

async def handler(ws):
    helloed = False
    async for raw in ws:
        msg = json.loads(raw)
        if msg["type"] == "hello":
            await ws.send(json.dumps({
                "type": "ready",
                "agentId": AGENT_ID,
                "caps": {"sessionResume": True}
            }))
            helloed = True
            continue
        if not helloed: continue

        if msg["type"] == "req" and msg["method"] == "execute":
            req_id = msg["id"]
            params = msg["params"]
            args = ["claude"]
            if params.get("resumeSessionId"):
                args += ["--resume", params["resumeSessionId"]]
            payload = json.dumps(params["wakePayload"])

            os.makedirs(FOLDER, exist_ok=True)  # bootstrap if needed
            proc = await asyncio.create_subprocess_exec(
                *args,
                cwd=FOLDER,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            proc.stdin.write(payload.encode()); proc.stdin.close()

            async def pump(stream_name, reader):
                while True:
                    chunk = await reader.read(4096)
                    if not chunk: break
                    await ws.send(json.dumps({
                        "type": "stream", "reqId": req_id,
                        "stream": stream_name, "chunk": chunk.decode()
                    }))

            await asyncio.gather(
                pump("stdout", proc.stdout),
                pump("stderr", proc.stderr),
                proc.wait(),
            )

            # Best-effort sessionId/usage/resultJson extraction from the last
            # JSON line of stdout — see claude-invoker.ts for the reference.
            await ws.send(json.dumps({
                "type": "res", "id": req_id,
                "ok": proc.returncode == 0,
                "result": {
                    "exitCode": proc.returncode,
                    "signal": None,
                    "sessionId": None,  # extract from stdout in real impl
                    "resultJson": None,
                }
            }))

        elif msg["type"] == "req" and msg["method"] == "shutdown":
            await ws.send(json.dumps({
                "type": "res", "id": msg["id"], "ok": True,
                "result": {"exitCode": 0, "signal": None}
            }))
            asyncio.get_event_loop().stop()

async def main():
    async with websockets.serve(handler, "0.0.0.0", PORT):
        await asyncio.Future()

asyncio.run(main())
```

For a full reference (with proper sessionId parsing, timeout handling, and
folder bootstrap), see `packages/agent-runtime/src/daemon.ts` — the dev
daemon implements every contract clause exactly as written here.

---

## 11. Verification

To confirm your daemon works against a stock Paperclip:

1. Start your daemon, note its WebSocket URL (e.g., `ws://10.0.0.5:7100/`).
2. In Paperclip, hire an agent with `adapterConfig.externalEndpoint =
   <your URL>` and `adapterConfig.runtimeEndpoint = <your URL>` and
   `adapterType = "aliaskit_vm"`.
3. From the Paperclip UI, open the agent's adapter test panel — it'll
   probe your daemon's hello/ready handshake. Should report
   `aliaskit_vm_runtime_probe_ok`.
4. Create an issue, assign it to the agent, fire a heartbeat. Watch your
   daemon's log: it should receive an execute req, spawn the agent CLI,
   stream stdout back, and return a res frame.
5. Confirm in Paperclip the issue's heartbeat run shows the streamed
   logs and (if the agent emitted the close marker) the issue closes.

If any step fails, the dev daemon at `packages/agent-runtime/` is the
oracle — test against it (it should pass every step) to isolate where
your daemon diverges.

---

## Changelog

- **v1 (Apr 2026)**: initial spec. Single-tenant per-port, no auth, JSON
  text frames only, hire-to-fire lifetime.

Future versions will be additive (new optional fields on existing frames)
or signaled by a new `PROTOCOL_VERSION` in the hello/ready handshake.
