# External daemon — v1.3 migration

Assumes you already applied [`external-agent-v1.2-migration.md`](./external-agent-v1.2-migration.md)
(identity-via-API, `.claude/skills/` layout, `companyId` bootstrap input).

## Why

Two things the v1.2 daemon handles poorly, both surfaced in real usage:

1. **Stale `agentId` silently 404s.** If you hired an agent in Paperclip
   AFTER configuring the daemon's `pkg.zootropolis.agentId`, the daemon
   connects and sees hello frames with a different id. Today it logs a
   mismatch warning and keeps going; the identity fetch then 404s because
   it's asking for the wrong agent. You end up with "why didn't my issue
   get invoked?" and have to dig through `runtime.log` to find the
   mismatched hello.
2. **Silent Claude failures.** If `claude` isn't on PATH (ENOENT) or
   exits with a non-zero status, v1.2 returns `resultJson: {stdout:"", stderr:""}`
   with a null exit code. Paperclip treats it as "run didn't produce a
   result" and leaves the issue open. Nothing in `runtime.log` tells you
   why.

v1.3 replaces the silent-warning path with two explicit behaviours and
adds verbose spawn logging so failure modes are visible.

## Changes to `daemon.mjs`

### 1. Make `agentId` optional; auto-adopt on first hello

**Currently**, around line 16:

```js
const AGENT_ID = process.env.ZOOTROPOLIS_AGENT_ID ?? pkg.zootropolis.agentId;
```

**Replace with**:

```js
// Configured agentId is now optional. If unset ("" or undefined), the
// daemon adopts the first non-probe hello's agentId. If set, any hello
// with a different id is refused with agent_id_mismatch.
let RESOLVED_AGENT_ID =
  process.env.ZOOTROPOLIS_AGENT_ID
  ?? pkg.zootropolis.agentId
  ?? null;
if (typeof RESOLVED_AGENT_ID === "string" && RESOLVED_AGENT_ID.length === 0) {
  RESOLVED_AGENT_ID = null;
}
```

Also update `pkg.zootropolis.agentId` docs/examples so operators know
they can leave it blank.

### 2. Rewrite `handleHello` with strict match + auto-adopt

**Currently**, something like:

```js
if (msg.type === "hello") {
  if (msg.agentId !== AGENT_ID && msg.agentId !== "probe") {
    await log(`hello with mismatched agentId=${msg.agentId}`);
  }
  await send(socket, { type: "ready", agentId: AGENT_ID, caps: { sessionResume: true } });
  return;
}
```

**Replace with**:

```js
if (msg.type === "hello") {
  if (msg.agentId === "probe") {
    // Test-environment probe — reply but don't latch identity.
    await send(socket, {
      type: "ready",
      agentId: RESOLVED_AGENT_ID ?? "probe",
      caps: { sessionResume: true },
    });
    return;
  }
  if (RESOLVED_AGENT_ID === null) {
    RESOLVED_AGENT_ID = msg.agentId;
    await log(`adopted agentId from first hello: ${msg.agentId}`);
  } else if (RESOLVED_AGENT_ID !== msg.agentId) {
    const detail =
      `agent_id_mismatch: daemon is configured for ${RESOLVED_AGENT_ID} ` +
      `but hello carried ${msg.agentId}. Restart the daemon with the ` +
      `Paperclip-minted agentId, or leave it unset for auto-adopt.`;
    await log(`refusing hello: ${detail}`);
    try {
      await send(socket, {
        type: "res",
        id: "hello-refused",
        ok: false,
        error: { code: "agent_id_mismatch", message: detail },
      });
    } catch { /* ignore */ }
    socket.close(1008, "agent_id_mismatch");
    return;
  }
  await send(socket, {
    type: "ready",
    agentId: RESOLVED_AGENT_ID,
    caps: { sessionResume: true },
  });
  return;
}
```

Everywhere else in the daemon that reads `AGENT_ID` (e.g., the identity
fetch URL, the listening log line, bootstrap folder creation), replace
with `RESOLVED_AGENT_ID`. If anything uses it before the first hello —
guard with `if (!RESOLVED_AGENT_ID) throw new Error(...)` so the
failure is loud.

### 3. Verbose spawn / exit logging + ENOENT handling

**Currently**, the spawn section looks something like:

```js
const child = spawn(BINARY, args, { cwd: FOLDER, ... });
child.stdout.on("data", ...);
child.on("close", (code) => { resolve(...); });
```

**Add around it**:

```js
await log(
  `spawning ${BINARY} cwd=${FOLDER} resume=${resumeSessionId ?? "(fresh)"}`
);
const startedAt = Date.now();

let child;
try {
  child = spawn(BINARY, args, { cwd: FOLDER, ... });
} catch (err) {
  await log(`spawn() threw synchronously: ${err.message}`);
  // Paperclip will mark the run failed; surface a clear resultJson.
  resolve({
    exitCode: null,
    signal: null,
    timedOut: false,
    resultJson: {
      error: err.message,
      hint: `Binary "${BINARY}" not spawnable. Check PATH in the shell that started the daemon.`,
    },
  });
  return;
}

child.on("error", (err) => {
  const hint = err.code === "ENOENT"
    ? `Binary "${BINARY}" not found on PATH.`
    : undefined;
  log(`spawn error: ${err.message}${hint ? " " + hint : ""}`);
  // …existing resolve() code…
});

child.on("close", (code, signal) => {
  const dur = Date.now() - startedAt;
  log(`claude exited code=${code} signal=${signal ?? "(none)"} durationMs=${dur}`);
  // …existing resolve() code…
});
```

Now `runtime.log` tells you exactly when Claude started, how long it
ran, and why it failed if it did.

### 4. Update the embedded `PAPERCLIP_SKILL` and README

Neither file needs a content change, but the skill now lives at
`.claude/skills/zootropolis-paperclip/SKILL.md` (from v1.2) — this
hasn't changed in v1.3. Just a reminder if you haven't moved it yet.

In your README, update the hire-flow section to note the two allowed
configurations for `pkg.zootropolis.agentId`:

```
- Leave it out (recommended for dev): daemon adopts the first hello's
  agentId. Paperclip owns the UUID — you never copy-paste it.
- Set it explicitly: daemon enforces a strict match and refuses any
  hello that carries a different id. Use this for prod or multi-tenant
  hosts where you want to guarantee which agent this daemon services.
```

## Minimal diff summary

| Part | Change |
|---|---|
| `AGENT_ID` bootstrap | Becomes `RESOLVED_AGENT_ID`, mutable, starts as `null` when unset. |
| `handleHello` | Probe → don't latch. Unset → adopt. Mismatch → close with agent_id_mismatch. |
| Everywhere else reading `AGENT_ID` | Switch to `RESOLVED_AGENT_ID`. |
| Spawn block | Wrap in try/catch, log pre-spawn + on-exit, handle ENOENT with a hint. |
| `identity fetch` (v1.2) | No change — still `${PAPERCLIP_API}/api/companies/${COMPANY_ID}/agents/${RESOLVED_AGENT_ID}/identity`. The id just comes from the new variable. |
| `package.json` | `zootropolis.agentId` becomes optional. |

## Verification

Same as before — start Paperclip, hire an agent, ensure the daemon's URL
is the hire's endpoint. Two scenarios to exercise:

**Scenario A — auto-adopt (recommended dev flow)**: leave
`pkg.zootropolis.agentId` blank. Start the daemon. Hire an agent in the
campus pointing at the daemon's URL. On first heartbeat you should see:

```
listening on ws://0.0.0.0:7100/ (agentId=unset — will auto-adopt from first hello)
adopted agentId from first hello: <paperclip-minted-uuid>
execute id=... runId=... resume=(fresh) binary=claude
spawning claude cwd=... resume=(fresh)
claude exited code=0 signal=(none) durationMs=3142
execute id=... done exitCode=0 signal=null durationMs=3156 sessionId=<id>
```

**Scenario B — strict match**: put the right agentId in
`pkg.zootropolis.agentId`, start the daemon, hire the agent pointing at
it. Everything works as before. Now wipe `.paperclip/` and re-hire —
the new agent has a different UUID, daemon refuses the first hello:

```
listening on ws://0.0.0.0:7100/ (agentId=<old-uuid>)
refusing hello: agent_id_mismatch: daemon is configured for <old-uuid> but hello carried <new-uuid>...
```

Paperclip's adapter sees the close and the reachability probe goes red
— you get a clear failure at second 1 instead of a silent-drift debug
session.

**Scenario C — claude not on PATH**: rename `claude` temporarily
(`mv $(which claude) $(which claude).hidden`), assign an issue. You'll
now see:

```
spawning claude cwd=... resume=(fresh)
spawn error: spawn claude ENOENT Binary "claude" not found on PATH.
execute id=... done exitCode=null signal=null durationMs=18
```

…and the heartbeat run comes back to Paperclip with a clear error
message in `resultJson.hint`. Restore claude and re-wake the agent.

## Rollback

If something breaks and you need to fall back to v1.2 daemon behaviour
quickly: revert this patch and set `pkg.zootropolis.agentId` to the
current Paperclip UUID. The identity fetch URL is the same in both
versions.
