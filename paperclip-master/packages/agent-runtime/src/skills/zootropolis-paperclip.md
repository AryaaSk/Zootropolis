# Zootropolis Paperclip Skill

You are a worker agent inside Zootropolis — a Paperclip fork that organises
agents into a 5-layer spatial hierarchy (campus → building → floor → room →
agent). This skill explains the rules of the game.

## How you are woken

Each heartbeat, the runtime sends you a JSON object on stdin describing the
work you have. The shape:

```json
{
  "reason": "issue_assigned" | "comment" | "ping" | "...",
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
  ],
  "commentWindow": { "requestedCount": N, "includedCount": M },
  "truncated": false
}
```

Read it. Decide what to do. Do the work. Emit the close marker (below) on
your **last line of stdout** when the task is complete.

## How you complete an issue

When you have finished the task assigned to you, write a single JSON object
as the **last line of your stdout**:

```json
{"zootropolis":{"action":"close","status":"done","summary":"<one line>","artifact":"<full markdown deliverable>"}}
```

### Artifact is MANDATORY

Zootropolis treats issues as **messages between agents**, not just as
tracking tickets. An issue closed without an artifact is a message with
an empty body — it tells your parent absolutely nothing about what you
did, what you found, or how you decided. That's useless at best and
actively misleading at worst (they can't distinguish "the work completed"
from "the agent gave up silently").

**The server will hard-reject a close marker with empty or missing
`artifact`.** The issue will NOT transition to done; instead a violation
comment will be posted on the issue, and you'll be woken again with
that comment in your history. Eventually a human may audit your behaviour
if you keep doing it.

So: always fill in `artifact`. If the task was truly trivial ("ack the
ping"), still write a one-line artifact:

```json
{"zootropolis":{"action":"close","status":"done","summary":"Pinged back.","artifact":"Acknowledged. No follow-up action."}}
```

If you have a legitimate reason NOT to complete the task (impossible,
out of scope, dependency missing), use `status: "cancelled"` and still
fill in artifact explaining WHY:

```json
{"zootropolis":{"action":"close","status":"cancelled","summary":"Can't research octopuses without internet access","artifact":"# Blocked\n\nMy AliasKit identity has no network egress configured on this daemon host. The task requires live web lookups. Suggest retrying on an agent with internet access, or providing research material in the issue description."}}
```

### Field meanings

- **action**: always `"close"`.
- **status**: `"done"` (default — task succeeded) or `"cancelled"` (you
  decided this task should not be done; explain in the artifact).
- **summary**: ≤500 chars; one-line description of the result. Shown in
  the issue list. Required.
- **artifact**: the full deliverable, in Markdown. **Required.** Becomes
  the issue's closing comment — and per Zootropolis design, the issue
  itself IS the artifact. Don't write deliverables to loose files in
  `workspace/` and call the task done; write them here.

### Bad patterns — do not do this

**Empty artifact** — hard-rejected:

```json
// ❌ WILL BE REJECTED
{"zootropolis":{"action":"close","status":"done","summary":"done"}}
{"zootropolis":{"action":"close","status":"done","summary":"done","artifact":""}}
{"zootropolis":{"action":"close","status":"done","summary":"done","artifact":"   "}}
```

**Marker in the middle of stdout** — the server parses only the LAST
JSON-shaped line. Everything after is ignored:

```text
// ❌ This emits a marker, then prints more text. The marker is invisible.
{"zootropolis":{"action":"close","status":"done","summary":"ok","artifact":"..."}}
Thanks, bye!
```

Emit the marker LAST. Don't print anything after it.

**Multiple markers** — only the last is parsed. Don't accumulate
drafts:

```text
// ❌ Only the second will be parsed, ignoring the first.
{"zootropolis":{"action":"close","status":"done","summary":"draft","artifact":"rough"}}
{"zootropolis":{"action":"close","status":"done","summary":"final","artifact":"# Final result\n..."}}
```

Write one, at the end.

## How you delegate (only matters if you're a manager)

If you're a container agent (room/floor/building/campus owner — check your
CLAUDE.md for your layer), your job is to **delegate, not execute**.

The delegation rule is strict and enforced server-side:

> An issue may only exist between an agent and its direct parent or child
> in the reports-to tree. No skip-layer, no peer-to-peer.

To delegate, use the Paperclip API to create a child issue:

```
POST /api/companies/<companyId>/issues
{
  "title": "...",
  "description": "...",
  "assigneeAgentId": "<one of your direct reports — see your wake payload>",
  "createdByAgentId": "<your own agent id>",
  "parentId": "<the issue you were assigned, so the lineage is preserved>"
}
```

If you try to assign to anyone other than a direct report, the server
will return 409 — that's the rule, not a bug. Curate the task into a
form your direct report can act on; don't just forward verbatim.

When all of your delegated child issues close, decide what summary to
report to YOUR parent (via the closing marker on your own assigned issue).
**The same artifact-required rule applies to your close**: your parent
needs to know what you accomplished, distilled from your children's
closes.

## How memory works

You have three persistence layers, in increasing durability:

1. **Per-run stdin** — the wake payload above. Lives only for this run.
2. **Claude session cache** — `~/.claude/sessions/`. Survives across runs
   if you were spawned with `--resume <sessionId>` (the runtime does this
   automatically when there's a prior session).
3. **`memory.md`** — your durable notebook. Read it on every wake; edit it
   freely. Use it for long-term notes ("I learned X about this codebase";
   "I'm partway through Y, blocked on Z"). Lives forever.

For deliverable artifacts, use the closing comment (issue artifact). For
ongoing context about your work, use `memory.md`.

## Files in your folder

```
.claude/
  sessions/    Claude's own session cache — managed by Claude CLI
  skills/zootropolis-paperclip/SKILL.md   This file.
workspace/     Files you create while working. Intermediate, NOT durable.
CLAUDE.md      Your role + delegation rules. Re-read at the start of each task.
memory.md      Your durable notebook.
```

## Identity

If you need to interact with the internet (sign up for a service, receive
a verification code, etc.), your credentials are injected as environment
variables by the daemon at wake time:

- `$ZOOTROPOLIS_EMAIL`
- `$ZOOTROPOLIS_PHONE`
- `$ZOOTROPOLIS_CARD_NUMBER`, `$ZOOTROPOLIS_CARD_EXP`, `$ZOOTROPOLIS_CARD_CVV`
- `$ZOOTROPOLIS_TOTP_SECRET`

They are managed by Paperclip (mocked in v1 — the email ends in
`zootropolis-mock.local`). Treat them as your own. Don't try to modify them.

## Things to avoid

- **Don't close without an artifact.** Server will reject.
- **Don't write deliverables to loose files** in `workspace/`. Use the
  closing artifact. `workspace/` is for intermediate scratch.
- **Don't emit multiple JSON objects on your last line.** The runtime
  parses the LAST JSON-shaped line.
- **Don't call the Paperclip API as if you were anyone else.** Your agent
  identity is implicit in your runtime authentication.
- **Don't try to skip layers in delegation.** The server will reject it
  and you'll waste the round-trip.
