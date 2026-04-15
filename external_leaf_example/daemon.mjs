#!/usr/bin/env node
// Self-contained Zootropolis leaf-agent daemon.
// Implements protocol v1 of agent-runtime-contract.md.
// Spawns `claude` in this folder per heartbeat, streams stdout back.

import { spawn } from "node:child_process";
import { mkdir, writeFile, access, appendFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WebSocketServer } from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8"));

// Configured agentId is optional. If unset ("" / null / undefined), the
// daemon adopts the first non-probe hello's agentId. If set, any hello
// with a different id is refused with agent_id_mismatch.
let RESOLVED_AGENT_ID =
  process.env.ZOOTROPOLIS_AGENT_ID
  ?? pkg.zootropolis.agentId
  ?? null;
if (typeof RESOLVED_AGENT_ID === "string" && RESOLVED_AGENT_ID.length === 0) {
  RESOLVED_AGENT_ID = null;
}
const PORT = Number(process.env.ZOOTROPOLIS_PORT ?? pkg.zootropolis.port);
// Config below is forwarded into the env of the spawned Claude process so
// its Paperclip skill can authenticate + route API calls correctly.
// Shell env wins over package.json so per-run overrides still work.
const COMPANY_ID = process.env.PAPERCLIP_COMPANY_ID ?? pkg.zootropolis.companyId ?? null;
const PAPERCLIP_API_URL =
  process.env.PAPERCLIP_API_URL
  ?? pkg.zootropolis.paperclipApiUrl
  ?? "http://localhost:3100";
const PAPERCLIP_API_KEY =
  process.env.PAPERCLIP_API_KEY
  ?? pkg.zootropolis.paperclipApiKey
  ?? "";
const FOLDER = __dirname;
const BINARY = process.env.ZOOTROPOLIS_CLAUDE_BINARY ?? "claude";
const LOG_PATH = join(FOLDER, "runtime.log");

async function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stderr.write(line);
  try { await appendFile(LOG_PATH, line); } catch { /* ignore */ }
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

// Idempotently seed the agent folder on first run.
async function bootstrap() {
  const dirs = [".claude", "workspace"];
  for (const d of dirs) await mkdir(join(FOLDER, d), { recursive: true });

  const claudeMd = join(FOLDER, "CLAUDE.md");
  if (!(await exists(claudeMd))) {
    await writeFile(claudeMd, `# Zootropolis Agent

You are a leaf worker in a Zootropolis agent campus. Read
\`skills/zootropolis-paperclip.md\` — it's the protocol manual for how to
interact with Paperclip (wake payload shape, close marker, delegation rules).

When you complete a task, emit this as your LAST line of stdout:

    {"zootropolis":{"action":"close","status":"done","summary":"<one line>","artifact":"<full markdown>"}}

The artifact becomes the issue's closing comment and the issue transitions
to done.
`);
  }

  const memoryMd = join(FOLDER, "memory.md");
  if (!(await exists(memoryMd))) {
    await writeFile(memoryMd, `# Durable memory

This file persists across heartbeats. Use it for long-term notes.
`);
  }

  // The paperclip skill must exist or the close-marker protocol won't work.
  // Claude Code auto-discovers skills at .claude/skills/<name>/SKILL.md.
  const skillDir = join(FOLDER, ".claude", "skills", "zootropolis-paperclip");
  await mkdir(skillDir, { recursive: true });
  const skillPath = join(skillDir, "SKILL.md");
  if (!(await exists(skillPath))) {
    await writeFile(skillPath, PAPERCLIP_SKILL);
  }
}

// Phase Z — identity is managed locally by the AliasKit skill (installed
// on this VM), NOT fetched from Paperclip. The old `getIdentity()` that
// called `/api/companies/:id/agents/:id/identity` is gone. When Claude
// needs identity at runtime, its local AliasKit skill handles it.
//
// This means the daemon no longer needs `paperclipApi` or `companyId`
// for its own operation — kept in package.json only as optional context
// an invoked Claude session might consult.

// ---------- Claude invoker ----------

function extractLastJsonLine(stdout) {
  const lines = stdout.split(/\r?\n/).reverse();
  for (const line of lines) {
    const t = line.trim();
    if (!t || t[0] !== "{") continue;
    try { return JSON.parse(t); } catch { /* keep looking */ }
  }
  return null;
}

function extractSessionId(obj) {
  if (!obj) return null;
  const sid = obj.sessionId ?? obj.session_id;
  return typeof sid === "string" && sid.length > 0 ? sid : null;
}

function extractUsage(obj) {
  const u = obj?.usage;
  if (!u || typeof u !== "object") return undefined;
  const input = Number(u.inputTokens ?? u.input_tokens ?? 0);
  const output = Number(u.outputTokens ?? u.output_tokens ?? 0);
  const cached = Number(u.cachedInputTokens ?? u.cached_input_tokens ?? 0);
  if (!Number.isFinite(input) || !Number.isFinite(output)) return undefined;
  return {
    inputTokens: input,
    outputTokens: output,
    ...(cached > 0 ? { cachedInputTokens: cached } : {}),
  };
}

async function invokeClaude({ runId, wakePayload, resumeSessionId, timeoutMs, onChunk }) {
  await log(`spawning ${BINARY} cwd=${FOLDER} resume=${resumeSessionId ?? "(fresh)"}`);
  const startedAt = Date.now();

  // Build the env the Paperclip skill expects on Claude's side. Values
  // come from package.json.zootropolis (with shell-env overrides); runId
  // is per-heartbeat, sourced from the execute request's params.runId.
  // Identity (AliasKit) is NOT injected here — the remote worker's
  // local AliasKit skill owns that and is invoked by Claude at runtime.
  const paperclipEnv = {
    ...(PAPERCLIP_API_URL ? { PAPERCLIP_API_URL } : {}),
    ...(PAPERCLIP_API_KEY ? { PAPERCLIP_API_KEY } : {}),
    ...(RESOLVED_AGENT_ID ? { PAPERCLIP_AGENT_ID: RESOLVED_AGENT_ID } : {}),
    ...(COMPANY_ID ? { PAPERCLIP_COMPANY_ID: COMPANY_ID } : {}),
    ...(runId ? { PAPERCLIP_RUN_ID: runId } : {}),
  };

  return new Promise((resolve) => {
    const args = ["--dangerously-skip-permissions"];
    if (resumeSessionId) args.push("--resume", resumeSessionId);

    let child;
    try {
      child = spawn(BINARY, args, {
        cwd: FOLDER,
        env: { ...process.env, ...paperclipEnv },
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      log(`spawn() threw synchronously: ${err.message}`);
      resolve({
        exitCode: null, signal: null, timedOut: false,
        sessionId: null, usage: undefined,
        resultJson: {
          error: err.message,
          hint: `Binary "${BINARY}" not spawnable. Check PATH in the shell that started the daemon.`,
        },
      });
      return;
    }

    let stdoutBuf = "";
    let stderrBuf = "";
    let timedOut = false;
    const deadline = timeoutMs > 0 ? setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGTERM"); } catch {}
      setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 5000);
    }, timeoutMs) : null;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c) => { stdoutBuf += c; onChunk?.("stdout", c); });
    child.stderr.on("data", (c) => { stderrBuf += c; onChunk?.("stderr", c); });

    child.on("error", (err) => {
      if (deadline) clearTimeout(deadline);
      const hint = err.code === "ENOENT" ? `Binary "${BINARY}" not found on PATH.` : undefined;
      log(`spawn error: ${err.message}${hint ? " " + hint : ""}`);
      resolve({
        exitCode: null, signal: null, timedOut,
        sessionId: null, usage: undefined,
        resultJson: { error: err.message, ...(hint ? { hint } : {}), stderr: stderrBuf },
      });
    });

    child.on("close", (code, signal) => {
      if (deadline) clearTimeout(deadline);
      const dur = Date.now() - startedAt;
      log(`claude exited code=${code} signal=${signal ?? "(none)"} durationMs=${dur}`);
      const last = extractLastJsonLine(stdoutBuf);
      resolve({
        exitCode: code ?? null,
        signal: signal ?? null,
        timedOut,
        sessionId: extractSessionId(last),
        usage: extractUsage(last),
        resultJson: last ?? { stdout: stdoutBuf, stderr: stderrBuf },
      });
    });

    try {
      const payload = typeof wakePayload === "string" ? wakePayload : JSON.stringify(wakePayload);
      child.stdin.write(payload);
      child.stdin.end();
    } catch { /* close handler resolves */ }
  });
}

// ---------- WebSocket server ----------

function send(socket, obj) {
  if (socket.readyState !== socket.OPEN) return;
  try { socket.send(JSON.stringify(obj)); } catch { /* ignore */ }
}

async function handleExecute(socket, req) {
  await bootstrap();
  await log(`execute id=${req.id} runId=${req.params?.runId} resume=${req.params?.resumeSessionId ?? "(fresh)"}`);

  const result = await invokeClaude({
    runId: req.params?.runId ?? null,
    wakePayload: req.params.wakePayload,
    resumeSessionId: req.params.resumeSessionId ?? null,
    timeoutMs: Number(req.params.timeoutMs ?? 600_000),
    onChunk: (stream, chunk) => send(socket, { type: "stream", reqId: req.id, stream, chunk }),
  });

  // Retry once without --resume if the session cache was stale.
  if (result.exitCode !== 0 && req.params.resumeSessionId && /session|resume/i.test(JSON.stringify(result.resultJson ?? {}))) {
    await log(`resume failed; retrying fresh`);
    const retry = await invokeClaude({
      runId: req.params?.runId ?? null,
      wakePayload: req.params.wakePayload,
      resumeSessionId: null,
      timeoutMs: Number(req.params.timeoutMs ?? 600_000),
      onChunk: (stream, chunk) => send(socket, { type: "stream", reqId: req.id, stream, chunk }),
    });
    send(socket, { type: "res", id: req.id, ok: retry.exitCode === 0, result: retry });
    return;
  }

  send(socket, { type: "res", id: req.id, ok: result.exitCode === 0, result });
}

function handleShutdown(socket, req) {
  log(`shutdown requested (id=${req.id})`);
  send(socket, { type: "res", id: req.id, ok: true, result: { exitCode: 0, signal: null } });
  setTimeout(() => process.exit(0), 100);
}

function handleConnection(socket) {
  let helloed = false;
  socket.on("message", async (raw) => {
    let frame;
    try { frame = JSON.parse(raw.toString()); } catch { return; }
    if (!frame || typeof frame !== "object") return;

    if (frame.type === "hello") {
      if (frame.agentId === "probe") {
        // Test-environment probe — reply but don't latch identity.
        send(socket, {
          type: "ready",
          agentId: RESOLVED_AGENT_ID ?? "probe",
          caps: { sessionResume: true, screenshots: false },
        });
        helloed = true;
        return;
      }
      if (RESOLVED_AGENT_ID === null) {
        RESOLVED_AGENT_ID = frame.agentId;
        await log(`adopted agentId from first hello: ${frame.agentId}`);
      } else if (RESOLVED_AGENT_ID !== frame.agentId) {
        const detail =
          `agent_id_mismatch: daemon is configured for ${RESOLVED_AGENT_ID} ` +
          `but hello carried ${frame.agentId}. Restart the daemon with the ` +
          `Paperclip-minted agentId, or leave it unset for auto-adopt.`;
        await log(`refusing hello: ${detail}`);
        send(socket, {
          type: "res",
          id: "hello-refused",
          ok: false,
          error: { code: "agent_id_mismatch", message: detail },
        });
        try { socket.close(1008, "agent_id_mismatch"); } catch { /* ignore */ }
        return;
      }
      helloed = true;
      send(socket, { type: "ready", agentId: RESOLVED_AGENT_ID, caps: { sessionResume: true, screenshots: false } });
      return;
    }
    if (!helloed) return;

    if (frame.type === "req") {
      if (frame.method === "execute") {
        handleExecute(socket, frame).catch(async (err) => {
          await log(`execute crash: ${err?.stack ?? err}`);
          send(socket, { type: "res", id: frame.id, ok: false, error: { code: "execute_crash", message: String(err?.message ?? err) } });
        });
      } else if (frame.method === "shutdown") {
        handleShutdown(socket, frame);
      } else {
        send(socket, { type: "res", id: frame.id, ok: false, error: { code: "unknown_method", message: `unknown method ${frame.method}` } });
      }
    }
  });
}

async function main() {
  await bootstrap();
  const wss = new WebSocketServer({ port: PORT });
  wss.on("listening", () => log(`listening on ws://0.0.0.0:${PORT}/ (agentId=${RESOLVED_AGENT_ID ?? "unset — will auto-adopt from first hello"})`));
  wss.on("error", (err) => log(`WSS error: ${err.message}`));
  wss.on("connection", handleConnection);
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));
}

// Paperclip skill — embedded so the daemon can seed it without a repo dep.
const PAPERCLIP_SKILL = `# Zootropolis Paperclip Skill

You are a **leaf worker** in a Zootropolis campus. You receive a single issue
from your direct parent (a room-owner, floor-owner, or whoever), do the work,
and close the issue with a deliverable. You have no children, no sub-tasks,
no other agents to coordinate with. Your job is simple and bounded.

(Delegation — splitting work into sub-tasks — is the job of container agents,
not you. They live server-side on Paperclip's host and see their rules via
the wake payload. If you ever wonder whether you should be "delegating," the
answer is no. Just do the task.)

## How you are woken

Each heartbeat, Paperclip sends you a JSON object on stdin describing the
work. The shape:

\`\`\`json
{
  "zootropolis": {
    "version": 1,
    "campusRules": ["...top-level rules the server wants you to read..."],
    "closeMarkerSchema": { "...": "..." }
  },
  "reason": "issue_assigned" | "comment" | "ping",
  "issue": {
    "id": "uuid",
    "identifier": "ENG-12",
    "title": "Research octopuses",
    "status": "in_progress",
    "priority": "medium"
  },
  "comments": [
    {
      "id": "uuid",
      "body": "string (may be truncated)",
      "createdAt": "ISO-8601",
      "author": { "type": "agent" | "user", "id": "uuid" }
    }
  ]
}
\`\`\`

Read it. Decide what to do. Do the work. Emit the close marker as the
**last line of your stdout** when the task is complete.

## How you complete the issue

Write a single JSON object as your **last line of stdout**:

\`\`\`json
{"zootropolis":{"action":"close","status":"done","summary":"<one line>","artifact":"<full markdown deliverable>"}}
\`\`\`

### \`artifact\` is MANDATORY

Zootropolis treats issues as **messages between agents**, not as tracking
tickets. An issue closed with no artifact is an empty message — it tells
your parent absolutely nothing about what you did, what you found, or how
you decided. That's useless at best, misleading at worst (they can't
distinguish "completed" from "gave up silently").

**The server hard-rejects a close marker with empty or missing \`artifact\`.**
The issue does NOT transition to done. A violation comment is posted on
the issue, and you'll be woken again with that comment in your history.
Keep doing it and the org will notice.

So: always fill in \`artifact\`. Even for trivial tasks, write a one-line
deliverable:

\`\`\`json
{"zootropolis":{"action":"close","status":"done","summary":"Pinged back.","artifact":"Acknowledged. No follow-up action."}}
\`\`\`

If you have a legitimate reason NOT to complete (blocked, out of scope,
dependency missing), use \`status: "cancelled"\` and still fill in artifact
explaining WHY:

\`\`\`json
{"zootropolis":{"action":"close","status":"cancelled","summary":"Blocked — no internet access on this daemon","artifact":"# Blocked\\n\\nTask requires live web lookups but my AliasKit identity has no network egress configured on this daemon host. Suggest retrying on an agent with internet access."}}
\`\`\`

### Field meanings

- **action**: always \`"close"\`.
- **status**: \`"done"\` or \`"cancelled"\`.
- **summary**: ≤500 chars, one-line description. Required.
- **artifact**: full Markdown deliverable. **Required.** Becomes the issue's
  closing comment — the issue IS the artifact (Zootropolis design.md §4).
  Don't write deliverables to loose files in \`workspace/\`.

### Bad patterns — do not do this

**Empty artifact** — hard-rejected:

\`\`\`json
// ❌ WILL BE REJECTED
{"zootropolis":{"action":"close","status":"done","summary":"done"}}
{"zootropolis":{"action":"close","status":"done","summary":"done","artifact":""}}
{"zootropolis":{"action":"close","status":"done","summary":"done","artifact":"   "}}
\`\`\`

**Marker in the middle of stdout** — the server parses only the LAST
JSON-shaped line. Everything after is ignored:

\`\`\`text
// ❌ This emits a marker, then prints more text. The marker is invisible.
{"zootropolis":{"action":"close","status":"done","summary":"ok","artifact":"..."}}
Thanks, bye!
\`\`\`

Emit the marker LAST. Don't print anything after it.

**Multiple markers** — only the last is parsed:

\`\`\`text
// ❌ Only the second is parsed.
{"zootropolis":{"action":"close","status":"done","summary":"draft","artifact":"rough"}}
{"zootropolis":{"action":"close","status":"done","summary":"final","artifact":"# Final result\\n..."}}
\`\`\`

Write one, at the end.

## Memory — where state lives

Three layers, in increasing durability:

1. **Per-run stdin** — the wake payload above. This run only.
2. **Claude session cache** — \`~/.claude/sessions/\`. Survives across runs if
   the daemon spawns you with \`--resume <sessionId>\` (it does, when you had
   a prior session).
3. **\`memory.md\`** — your durable notebook. Read it on every wake; edit it
   freely. Use it for long-term notes ("I learned X about this codebase";
   "I'm mid-task on Y, blocked on Z"). Persists forever.

Deliverables go in the closing artifact. Ongoing context goes in \`memory.md\`.

## Files in your folder

\`\`\`
.claude/
  sessions/                                Claude CLI's session cache
  skills/zootropolis-paperclip/SKILL.md    This file.
workspace/                                 Scratch files. Not durable.
CLAUDE.md                                  Your role + close rules.
memory.md                                  Your durable notebook.
\`\`\`

## Identity

If you need to interact with the internet (sign up for a service, receive
a verification code, etc.), invoke your local **AliasKit** skill
installed on this VM. The skill owns your persona — email, phone, card,
TOTP — and it is yours as a remote worker, not a per-company thing. The
same identity follows you across every Paperclip company you work for.

Paperclip no longer injects credentials via env vars. Your AliasKit
skill is the source of truth.

## Things to avoid

- **Don't close without an artifact.** Server will reject.
- **Don't write deliverables to loose files** in \`workspace/\`. Use the
  closing artifact.
- **Don't emit multiple JSON objects on your last line.** Only the last
  JSON-shaped line is parsed.
- **Don't try to create new issues or delegate.** That's a container-agent
  action. Leaves don't have children.
`;

main().catch((err) => { log(`fatal: ${err?.stack ?? err}`); process.exit(1); });
