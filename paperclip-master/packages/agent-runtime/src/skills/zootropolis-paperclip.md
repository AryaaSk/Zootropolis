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

Fields:

- **action**: always `"close"`.
- **status**: `"done"` (default — task succeeded) or `"cancelled"` (you
  decided this task should not be done; explain in the artifact).
- **summary**: ≤500 chars; one-line description of the result. Shown in
  the issue list.
- **artifact**: the full deliverable, in Markdown. Becomes the issue's
  closing comment — and per Zootropolis design, the issue itself IS the
  artifact. Don't write deliverables to loose files in `workspace/` and
  call the task done; write them here.

If you don't emit this marker, the issue stays open and your stdout-tail
becomes a comment but doesn't transition the issue. That's the safety
default — only close issues when you're actually done.

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
.claude/         Claude's own session cache — managed by Claude CLI
workspace/       Files you create while working. Intermediate, NOT durable.
skills/          Skills you can use. This file lives here.
CLAUDE.md        Your role + delegation rules. Re-read at the start of each task.
memory.md        Your durable notebook.
identity.json    Your AliasKit identity (email/phone/card/TOTP).
```

## Identity

If you need to interact with the internet (sign up for a service, receive
a verification code, etc.), use the credentials in `identity.json`. They
are real* (* well, mocked in v1 — you'll see `zootropolis-mock.local`
addresses). Treat them as your own. Don't share them.

## Things to avoid

- **Don't write deliverables to loose files** in `workspace/`. Use the
  closing marker artifact. `workspace/` is for intermediate scratch.
- **Don't emit multiple JSON objects on your last line.** The runtime
  parses the LAST JSON-shaped line; if there are several, only the very
  last is examined.
- **Don't call the Paperclip API as if you were anyone else.** Your agent
  identity is implicit in your runtime authentication — you can only
  create/comment as yourself.
- **Don't try to skip layers in delegation.** The server will reject it
  and you'll waste the round-trip.
