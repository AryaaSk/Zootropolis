# external-leaf-example

Reference implementation of a Zootropolis **leaf-agent daemon**. Copy this folder wherever you want a remote worker to run — your laptop, a VM, a remote server — and point Paperclip at its WebSocket.

This is the canonical shape. Nothing exotic: a single Node file (`daemon.mjs`), a `ws` dependency, a seed `CLAUDE.md` + `memory.md`, and the Zootropolis protocol skill.

## What's in here

| File | What |
|---|---|
| `daemon.mjs` | WebSocket daemon (protocol v1, single file, only dep is `ws`). Accepts Paperclip's `hello`, receives `execute` requests per heartbeat, spawns `claude` in this folder, streams stdout back. |
| `package.json` | `ws` dep + the `zootropolis` config block. **All configuration lives here.** |
| `CLAUDE.md` | Seed system prompt for Claude Code when it runs inside this folder. |
| `memory.md` | Durable notebook the agent is encouraged to use for long-term notes. Persists across heartbeats. |
| `.claude/skills/zootropolis-paperclip/SKILL.md` | Protocol manual (wake payload shape, close marker, delegation rules). Claude Code auto-discovers skills here. |
| `workspace/` | Agent scratch directory (created on first run). Not durable — use `memory.md` or the close artifact for anything you want to keep. |
| `runtime.log` | Daemon log (created on first run). Gitignored. |

## Configuration

All config lives in `package.json` under the `zootropolis` block. Edit the file, no env vars required (they still work as overrides if you want them — shell env wins over `package.json`).

```jsonc
"zootropolis": {
  "port": 7100,                                    // WebSocket port this daemon listens on
  "agentId": "",                                   // leave empty to auto-adopt on first hello
  "companyId": "<uuid-from-paperclip-campus-url>", // used by the spawned Claude for API calls
  "paperclipApiUrl": "http://localhost:3100",      // where Claude should hit Paperclip's /api/*
  "paperclipApiKey": ""                            // bearer token, optional in local_trusted mode
}
```

The daemon reads these at startup and forwards the Paperclip ones as env vars into the spawned Claude process (`PAPERCLIP_API_URL`, `PAPERCLIP_API_KEY`, `PAPERCLIP_AGENT_ID`, `PAPERCLIP_COMPANY_ID`, plus `PAPERCLIP_RUN_ID` per-heartbeat).

**In `local_trusted` mode** (the default when Paperclip runs via `./scripts/dev.sh`), you can leave `paperclipApiKey` empty — the server doesn't check tokens. Only fill it in if Paperclip is running in `authenticated` mode.

**Committing secrets?** If your `paperclipApiKey` is sensitive and this folder is in version control, either add `package.json` to `.gitignore` or leave `paperclipApiKey` empty in the committed file and set `PAPERCLIP_API_KEY` via shell env at run time (the daemon picks up env-var overrides).

## Quickstart

```bash
cp -r external_leaf_example ~/Desktop/my-leaf-agent    # or scp to a VM
cd ~/Desktop/my-leaf-agent
npm install                                            # one-time; pulls `ws`

# edit package.json — set companyId (from your campus URL)
# and paperclipApiUrl if Paperclip isn't at http://localhost:3100

npm start                                              # listens on ws://0.0.0.0:7100/
```

### Running multiple daemons on one host

`package.json` fields can be overridden with env vars (shell wins). Useful when you want 5 workers on 5 different ports without 5 edited `package.json`s:

```bash
ZOOTROPOLIS_PORT=7101 npm start                        # second worker on :7101
ZOOTROPOLIS_PORT=7102 npm start                        # third on :7102
```

Env var names for overrides: `ZOOTROPOLIS_PORT`, `PAPERCLIP_API_URL`, `PAPERCLIP_API_KEY`, `PAPERCLIP_COMPANY_ID`, `ZOOTROPOLIS_AGENT_ID`, `ZOOTROPOLIS_CLAUDE_BINARY`.

## Register with Paperclip

1. Start Paperclip: `cd ~/Desktop/Zootropolis && ./scripts/dev.sh`
2. Open `http://localhost:5173/campus/<companyId>` and click **+ Hire agent**.
3. Fill `Agent runtime endpoint` with the URL Paperclip should dial (`ws://127.0.0.1:7100/` for a local daemon, `ws://<public-host>:<port>/` for a remote one).
4. Submit. Paperclip now dials this daemon on every heartbeat.

## Identity

Identity (email, phone, card, TOTP) is **not** provisioned by Paperclip. If the agent needs to interact with the outside world, install a local **AliasKit** skill on this same machine — it owns the worker's persona and is invoked by Claude when a task needs credentials. The same AliasKit identity follows the worker across every Paperclip company it powers.

See `../EXTERNAL_LEAF_AGENTS.md` in the repo root for the full guide (networking options, running multiple daemons, troubleshooting, tunnelling with ngrok / Tailscale, etc.).

## Requirements

- **Node 18+** (for built-in `fetch` / `WebSocket`).
- **`claude` CLI** on `$PATH`. Override with `ZOOTROPOLIS_CLAUDE_BINARY=/abs/path/to/claude`.
