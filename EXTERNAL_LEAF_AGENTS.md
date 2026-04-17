# External Leaf Agents — Setup Guide

This doc walks through provisioning a **remote worker** that connects to a Zootropolis company as a leaf agent. A remote worker is:

- A long-lived Node process (the "daemon") running somewhere — your laptop, a VM, a cloud instance.
- Exposing a single WebSocket endpoint.
- Hosting its own Claude Code installation + optionally a local **AliasKit** skill for external-world identity.

Paperclip dials each worker on every heartbeat and streams wake payloads in / stdout back. The worker is the unit of actual work. Containers (rooms / floors / buildings / campus) don't need workers — they run as in-process `claude_local` adapters inside Paperclip.

> **Vocabulary note.** The adapter type in Paperclip is called `aliaskit_vm` for historical reasons. Think of it as `external_ws` — it's just "connect to an external WebSocket." Identity lives on the worker, not on the Paperclip server.

---

## 1. Prerequisites

On the machine that will host the worker:

- **Node 18+** (for built-in `fetch` and `WebSocket`)
- **`claude` CLI** on `$PATH` (or set `ZOOTROPOLIS_CLAUDE_BINARY=/abs/path/to/claude`)
- **An AliasKit skill** installed locally *if* the worker needs to sign up for services, receive verification codes, complete purchases, etc. For a toy demo you can skip this.
- **Network:** Paperclip's server must be able to **dial out to your worker's WebSocket** — that's the only hard networking requirement.

---

## 2. Get the daemon template

The repo includes a reference daemon at `external_leaf_example/`. Copy it to wherever you want a worker to run:

```bash
# local copy
cp -r external_leaf_example ~/my-leaf-agent

# or scp to a remote VM
scp -r external_leaf_example user@vm:/home/user/my-leaf-agent

# or if this repo is on the VM already
cp -r external_leaf_example ~/my-leaf-agent
```

Each worker gets its own copy of the folder. Rename per worker (`my-leaf-1`, `my-leaf-2`, …) so you can tell them apart.

---

## 3. Install deps on the worker machine

```bash
cd ~/my-leaf-agent
npm install                     # pulls `ws`

# If claude isn't already installed:
curl -fsSL https://claude.ai/install.sh | sh
claude --version                # confirm it's on $PATH
```

---

## 4. Configure

All config lives in `package.json` under the `zootropolis` block:

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

**In `local_trusted` mode** (the default when Paperclip runs via `./scripts/dev.sh`), you can leave `paperclipApiKey` empty.

### Per-instance overrides

Shell env vars override `package.json` — useful for running multiple daemons on one host:

```bash
ZOOTROPOLIS_PORT=7101 npm start   # second worker on :7101
ZOOTROPOLIS_PORT=7102 npm start   # third on :7102
```

---

## 5. Run the daemon

```bash
cd ~/my-leaf-agent
npm start
# → daemon.mjs prints:  listening on ws://0.0.0.0:7100/
```

Keep it running. Use `tmux` / `screen` / `pm2` / `systemd` to survive SSH disconnects.

---

## 6. Make the WebSocket reachable from Paperclip

Paperclip needs to dial the worker's port. Pick ONE option:

### A. Both on the same machine (local dev)

No setup. Use `ws://127.0.0.1:7100/` in the hire form.

### B. Worker on a VM with a public IPv4

Open the port in the VM's firewall. Use `ws://<vm-public-ip>:7100/`.

### C. Worker behind NAT / firewall

Use a tunnel:

- **ngrok** — `ngrok tcp 7100` on the worker → gives you `tcp://X.tcp.ngrok.io:12345` → use as `ws://X.tcp.ngrok.io:12345/`. Free tier works for demos.
- **Tailscale** — install on both Paperclip host + worker host, join same tailnet, use `ws://<worker-tailnet-ip>:7100/`. Stable, private, recommended long-term.

### D. Paperclip on cloud, worker local

Reverse of C: Paperclip's server needs a route into your machine. Tailscale or ngrok on the Paperclip host.

### Paperclip API reachability (for the spawned Claude)

The leaf daemon's spawned Claude process needs to reach Paperclip's REST API (for checkout, comments, close). Set `paperclipApiUrl` in `package.json` to:

- Same machine: `http://localhost:3100` (default)
- Paperclip on another machine: `http://<paperclip-host>:3100` or `https://<ngrok-url>`
- Via Tailscale: `http://<paperclip-tailnet-ip>:3100`

---

## 7. Hire the agent in Paperclip

1. Start Paperclip: `./scripts/dev.sh`
2. Open the campus UI: `http://localhost:5173/campus/<companyId>`
3. Click **+ Hire agent** (top-right, below the Minimap).
4. Fill the form:
   - **Name** — whatever you want.
   - **Agent runtime endpoint** — the `ws://...` URL from step 6.
5. Submit.

Paperclip creates the agent with `adapterType: "aliaskit_vm"`, `metadata.zootropolis.layer: "agent"`, and your endpoint URL.

---

## 8. Verify

- Campus UI shows a **green reachability indicator** on the new animal. Red = daemon unreachable (check `runtime.log` in the daemon folder).
- Assign a tiny issue (e.g. "Write a haiku about Tuesday"). The daemon receives an `execute` request, spawns Claude, streams stdout back, Claude emits the close marker, the issue closes.
- The agent's floating screen in the campus should change from "sleeping" to `running · ZOO-N` with a pulsing emerald dot.

---

## 9. Identity

Identity (email, phone, card, TOTP) is **not** provisioned by Paperclip. If the agent needs to interact with the outside world, install a local **AliasKit** skill on the worker's machine. The same identity follows the worker across every Paperclip company it powers — one worker = one internet persona, like a real contractor.

---

## 10. Running multiple workers on one host

For demos, run N daemons on N ports of the same machine:

```bash
# terminal 1
cd ~/my-leaf-1 && ZOOTROPOLIS_PORT=7100 npm start

# terminal 2
cd ~/my-leaf-2 && ZOOTROPOLIS_PORT=7101 npm start

# ...
```

In the hire form, use `ws://127.0.0.1:7100/`, `ws://127.0.0.1:7101/`, etc.

---

## 11. Git workflow

Leaf agents create PRs, not just branches. See `GIT_POLICY.md` in the repo root for the full company-wide convention. The key points:

- Branch as `<your-github-username>/<issue-identifier>`
- Create a PR via `gh pr create` after pushing
- Include the PR URL in your close artifact
- If asked to rebase, you resolve the conflict (you wrote the code)

The leaf skill at `.claude/skills/zootropolis-paperclip/SKILL.md` (auto-seeded on first daemon boot) includes the full git workflow instructions.

---

## 12. Troubleshooting

| Problem | Check |
|---|---|
| Red dot on the animal | Is the daemon running? Can Paperclip reach the port? (`nc -z <host> <port>`) |
| Daemon crashes on `execute` | `runtime.log` — usually `claude` not on `$PATH`. Set `ZOOTROPOLIS_CLAUDE_BINARY`. |
| Issue never closes | Check the transcript in the campus UI. Missing close marker = Claude didn't emit the JSON on its last line. Verify the skill exists at `<daemon>/.claude/skills/zootropolis-paperclip/SKILL.md`. |
| `agent_id_mismatch` | Daemon is pinned to a different agent. Clear `agentId` in `package.json` or set it to the correct UUID. |

---

## 13. Tear-down

```bash
pkill -f daemon.mjs              # stop the daemon
# agent row in Paperclip stays unless you delete it via the UI
```

To wipe everything and start fresh:

```bash
rm -rf .paperclip                # from the repo root — wipes all Paperclip state
./scripts/dev.sh                 # re-run — onboarding wizard fires fresh
```

---

## See also

- `what_is_this.md` — what Zootropolis is.
- `GIT_POLICY.md` — company-wide git conventions.
- `external_leaf_example/` — the reference daemon you copy from.
- `docs/external-daemon-quickstart.md` — daemon-author guide.
- `docs/agent-runtime-contract.md` — full wire protocol spec.
