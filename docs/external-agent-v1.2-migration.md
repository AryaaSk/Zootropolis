# Migrating an external daemon to v1.2

Specific to the existing implementation at
`/Users/aryaask/Desktop/zootropolis-agent-1/daemon.mjs`. The wire
protocol did **not** change — your hello/ready/execute/stream/res
handling is compliant as-is. Only the folder layout + identity
semantics changed.

Two breaking changes:

1. **Per-project Claude skill lives at `.claude/skills/<name>/SKILL.md`**
   (Claude Code's discovery convention). The old path
   `skills/zootropolis-paperclip.md` at the project root isn't picked up.
2. **Identity is no longer a local file.** Paperclip mints it on hire
   and exposes it via `GET /api/companies/:companyId/agents/:id/identity`.

Plus one new bootstrap input you'll need: `companyId` (so your daemon
knows where to fetch identity from).

## Required edits to `daemon.mjs`

### 1. Add `companyId` + Paperclip base URL bootstrap inputs

Around **line 14-20** (where you read agent ID + port), add:

```js
const AGENT_ID = process.env.ZOOTROPOLIS_AGENT_ID ?? pkg.zootropolis.agentId;
const PORT = Number(process.env.ZOOTROPOLIS_PORT ?? pkg.zootropolis.port);
const COMPANY_ID = process.env.ZOOTROPOLIS_COMPANY_ID ?? pkg.zootropolis.companyId;
const PAPERCLIP_API = process.env.ZOOTROPOLIS_PAPERCLIP_API ?? pkg.zootropolis.paperclipApi ?? "http://localhost:3100";
const PAPERCLIP_TOKEN = process.env.ZOOTROPOLIS_PAPERCLIP_TOKEN ?? pkg.zootropolis.paperclipToken ?? null;
const FOLDER = __dirname;
// ...
```

Then update `package.json` to include the new fields under `zootropolis`:

```json
{
  "zootropolis": {
    "agentId": "<same as before>",
    "port": 7100,
    "companyId": "<the uuid from Paperclip — same company where the operator hired this agent>",
    "paperclipApi": "http://localhost:3100",
    "paperclipToken": null
  }
}
```

If `COMPANY_ID` is missing at startup, log a warning — identity fetch will
fail, but the daemon can still service `execute` requests that don't
involve credentials.

### 2. Move the skill write

**Currently, lines 75-79:**

```js
const skill = join(FOLDER, "skills", "zootropolis-paperclip.md");
if (!(await exists(skill))) {
  await writeFile(skill, PAPERCLIP_SKILL);
}
```

**Replace with:**

```js
const skillDir = join(FOLDER, ".claude", "skills", "zootropolis-paperclip");
await mkdir(skillDir, { recursive: true });
const skillPath = join(skillDir, "SKILL.md");
if (!(await exists(skillPath))) {
  await writeFile(skillPath, PAPERCLIP_SKILL);
}
```

Also drop the `"skills"` entry from the `dirs` array at **line 34** — you
don't need a top-level `skills/` directory anymore. New line:

```js
const dirs = [".claude", "workspace"];
```

Clean up the old file if you want: `rm -rf skills/`.

### 3. Remove the local `identity.json` write

**Currently, lines 62-73:**

```js
const identity = join(FOLDER, "identity.json");
if (!(await exists(identity))) {
  await writeFile(identity, JSON.stringify({
    email: `agent-${AGENT_ID.slice(0, 8)}@zootropolis-mock.local`,
    phone: "+15550000000",
    card: { number: "4111111111110000", expMonth: 12, expYear: 2029, cvv: "123", brand: "visa-mock" },
    totpSecret: "",
    createdAt: new Date().toISOString(),
    source: "zootropolis-mock",
    note: "Mock identity. Real AliasKit integration is v1.2."
  }, null, 2) + "\n");
}
```

**Delete this whole block.** Identity is Paperclip's responsibility now.

If you've already got an `identity.json` on disk from previous runs, delete
it so nobody relies on stale creds:

```bash
rm /Users/aryaask/Desktop/zootropolis-agent-1/identity.json
```

### 4. Add an identity fetcher

Add this helper somewhere after `bootstrap()` (around line 80):

```js
// Fetch identity from Paperclip. Cached in memory between heartbeats.
let cachedIdentity = null;
let cachedIdentityAt = 0;
const IDENTITY_TTL_MS = 5 * 60 * 1000; // 5 min

async function getIdentity({ force = false } = {}) {
  if (!COMPANY_ID) {
    throw new Error("ZOOTROPOLIS_COMPANY_ID not set — cannot fetch identity");
  }
  if (!force && cachedIdentity && Date.now() - cachedIdentityAt < IDENTITY_TTL_MS) {
    return cachedIdentity;
  }
  const url = `${PAPERCLIP_API}/api/companies/${COMPANY_ID}/agents/${AGENT_ID}/identity`;
  const res = await fetch(url, {
    headers: PAPERCLIP_TOKEN ? { Authorization: `Bearer ${PAPERCLIP_TOKEN}` } : {},
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Identity fetch failed: ${res.status} ${res.statusText} ${body}`);
  }
  cachedIdentity = await res.json();
  cachedIdentityAt = Date.now();
  return cachedIdentity;
}
```

### 5. Inject identity into the Claude child process

You have two options, pick whichever fits the agent better:

**Option A — environment variables** (simplest; works for any `claude` skill
that reads from env). In the `invokeClaude` function, before `spawn`:

```js
let envIdentity = {};
try {
  const id = await getIdentity();
  envIdentity = {
    ZOOTROPOLIS_EMAIL: id.email,
    ZOOTROPOLIS_PHONE: id.phone,
    ZOOTROPOLIS_CARD_NUMBER: id.card.number,
    ZOOTROPOLIS_CARD_EXP: `${id.card.expMonth}/${id.card.expYear}`,
    ZOOTROPOLIS_CARD_CVV: id.card.cvv,
    ZOOTROPOLIS_TOTP_SECRET: id.totpSecret,
  };
} catch (err) {
  await log(`identity fetch failed: ${err.message} — continuing without creds`);
}
const child = spawn(BINARY, args, {
  cwd: FOLDER,
  env: { ...process.env, ...envIdentity },
  stdio: ["pipe", "pipe", "pipe"],
});
```

**Option B — wake-payload injection** (cleaner semantically, but requires
your skill to know to read it). Merge identity into the wake payload before
piping to stdin:

```js
const wake = typeof wakePayload === "string" ? JSON.parse(wakePayload) : wakePayload;
try { wake.identity = await getIdentity(); } catch {}
child.stdin.write(JSON.stringify(wake));
child.stdin.end();
```

Update the skill's "When you wake" section to mention the new `identity`
field so the agent knows it exists.

**My lean:** option A. Environment variables are the ambient pattern for
secrets; the skill file in `PAPERCLIP_SKILL` can just document "read your
email from `$ZOOTROPOLIS_EMAIL`" without needing to parse the wake payload
for it.

### 6. Update the embedded `PAPERCLIP_SKILL` text

In the skill content (around line 280+ of `daemon.mjs`), the section
describing files in the agent's folder currently says:

> `identity.json    Your AliasKit identity (email/phone/card/TOTP).`

Replace with the env-var version (or wake-payload version, matching your
Option A/B choice above):

> The identity credentials (email, phone, card, TOTP) you need to act on
> the internet are passed to you as environment variables at wake time:
> `$ZOOTROPOLIS_EMAIL`, `$ZOOTROPOLIS_PHONE`, `$ZOOTROPOLIS_CARD_NUMBER`,
> etc. They're managed by Paperclip; don't try to modify them.

Also the "Files in your folder" ASCII block — drop `identity.json`.

### 7. README update

Your `README.md` probably documents the hire flow. Add a note under
"Paperclip hire":

> Before hiring this agent in the Paperclip campus, make sure to also
> set `ZOOTROPOLIS_COMPANY_ID` in package.json or env to the target
> company's UUID (see the URL in the campus view:
> `/campus/<companyId>`). The daemon needs it to fetch identity.

## Minimal diff summary

| Line(s) in `daemon.mjs` | Change |
|---|---|
| ~16-20 | Add `COMPANY_ID`, `PAPERCLIP_API`, `PAPERCLIP_TOKEN` bootstrap inputs. |
| ~34 | Drop `"skills"` from `dirs` array. |
| ~62-73 | **Delete** the `identity.json` write block entirely. |
| ~75-79 | Move skill to `.claude/skills/zootropolis-paperclip/SKILL.md`. |
| after `bootstrap()` | Add `getIdentity()` with 5-min cache. |
| inside `invokeClaude` before `spawn` | Fetch identity, inject as env vars. |
| Embedded `PAPERCLIP_SKILL` content | Drop `identity.json` references; mention env vars. |

## Verification after the migration

1. Remove stale state:
   ```bash
   rm -rf /Users/aryaask/Desktop/zootropolis-agent-1/.claude
   rm -rf /Users/aryaask/Desktop/zootropolis-agent-1/skills
   rm /Users/aryaask/Desktop/zootropolis-agent-1/identity.json
   ```
2. Start Paperclip: `cd ~/Desktop/Zootropolis && ./scripts/dev.sh`.
3. In the campus UI, create a company, hire an agent, paste the URL
   `ws://localhost:7100/` (or wherever your daemon listens).
4. Copy the `companyId` out of the URL bar and into your daemon's
   `package.json`.
5. Start the daemon. On boot it bootstraps the folder — you should see
   `.claude/skills/zootropolis-paperclip/SKILL.md` created.
6. The reachability dot in the campus should go green within ~10s.
7. Assign the agent an issue. Heartbeat fires, your daemon receives an
   `execute` req, identity is fetched once (log line should show), Claude
   spawns with the env vars set, eventually emits the close marker,
   issue closes.
8. Confirm: `curl http://localhost:3100/api/companies/<id>/agents/<agent-id>/identity`
   returns the JSON that your daemon is injecting.

If anything fails, compare against `packages/agent-runtime/src/daemon.ts`
and `folder-bootstrap.ts` in the Paperclip repo — they're the reference
implementation and they pass all the above checks.
