# External Leaf Agents — Setup Guide

This doc walks through provisioning a **remote worker** that connects to Zootropolis as a leaf agent. A remote worker is:

- A long-lived Node process (the "daemon") running somewhere — your laptop, a VM, a friend's Raspberry Pi, whatever.
- Exposing a single WebSocket endpoint.
- Hosting its own Claude Code installation + its own local **AliasKit** skill for external-world identity.

Paperclip dials each worker on every heartbeat and streams wake payloads in / stdout back. The worker is the unit of actual work. Containers (rooms / floors / buildings / campus) don't need workers — they run as in-process `claude_local` adapters inside Paperclip.

> **Vocabulary note.** The adapter type in Paperclip is called `aliaskit_vm` for historical reasons. The name is now a misnomer — the adapter no longer has anything to do with AliasKit identity provisioning. Think of it as `external_ws`. Identity lives on the worker, not on the Paperclip server.

---

## 1. Prerequisites

On the machine that will host the worker:

- **Node 18+** (for built-in `fetch` and `WebSocket`)
- **`claude` CLI** on `$PATH` (or set `ZOOTROPOLIS_CLAUDE_BINARY=/abs/path/to/claude`)
- **An AliasKit skill** installed locally *if* the worker needs to sign up for services, receive verification codes, complete purchases, etc. For a toy demo you can skip this.
- **Network:** Paperclip's server must be able to **dial out to your worker's WebSocket** — that's the only networking requirement. Your worker never calls back into Paperclip.

---

## 2. Get the daemon template

There's a reference daemon at `~/Desktop/zootropolis-agent-1/` — a single-file, single-dep (`ws`) Node process. Use it as-is, or copy its pattern.

```bash
# option A: scp / rsync to a remote VM
scp -r ~/Desktop/zootropolis-agent-1 user@vm:/home/user/zootropolis-agent-2

# option B: git clone if you version-controlled it
ssh user@vm
git clone <your-repo>/zootropolis-agent-1 zootropolis-agent-2

# option C: keep it local, just copy
cp -r ~/Desktop/zootropolis-agent-1 ~/Desktop/zootropolis-agent-2
```

Rename the folder per worker (`-agent-2`, `-agent-3`, …) so you can tell them apart when running multiple.

---

## 3. Install deps on the worker machine

```bash
cd zootropolis-agent-2
npm install                     # pulls `ws`

# If claude isn't already installed:
curl -fsSL https://claude.ai/install.sh | sh
claude --version                # confirm it's on $PATH
```

---

## 4. Configure

Edit `package.json` — only the `zootropolis` block matters:

```jsonc
"zootropolis": {
  "agentId": "",              // leave empty; auto-adopts on first hello
  "port": 7100,               // pick any free port
  "companyId": "",            // optional (no longer required by daemon)
  "paperclipApi": "",         // optional (daemon no longer calls back)
  "paperclipToken": null
}
```

Only `port` is load-bearing. `companyId` and `paperclipApi` used to be required for identity fetching; Phase Z removed that, so they're informational-only now.

### Per-instance overrides (useful when running multiple daemons on one host)

Prefer env vars over editing `package.json` for each:

```bash
ZOOTROPOLIS_PORT=7101 npm start   # second worker on :7101
ZOOTROPOLIS_PORT=7102 npm start   # third on :7102
```

You can also set `ZOOTROPOLIS_AGENT_ID=<uuid>` to pin the daemon to a specific agent (prevents mis-adoption when multiple agents share a host — otherwise the first `hello` to arrive wins).

---

## 5. Run the daemon

```bash
cd zootropolis-agent-2
npm start
# → daemon.mjs prints:  listening on ws://0.0.0.0:7100/
```

Keep it running. Use one of:
- `tmux` / `screen` to survive SSH disconnects
- `pm2 start npm --name zoo-2 -- start` for process supervision
- `systemd --user` for auto-start on boot

---

## 6. Make the WebSocket reachable from Paperclip

Paperclip needs to dial the worker's port. Pick ONE option based on where Paperclip lives relative to the worker:

### A. Both on localhost

No setup. Use `ws://127.0.0.1:7100/` in the hire form. This is fine for demos.

### B. Worker on a VM with a public IPv4

Open the port in the VM's firewall / security group, restrict source to Paperclip's IP if possible. Use `ws://<vm-public-ip>:7100/` in the hire form.

### C. Worker on a NAT'd / firewalled machine

Use a tunnel. Options (in order of simplicity):

- **ngrok** — `ngrok tcp 7100` → gives you `tcp://X.tcp.ngrok.io:12345`. Use `ws://X.tcp.ngrok.io:12345/` in the hire form. Free tier is fine for demos; URL changes on restart.
- **cloudflared** — `cloudflared tunnel --url tcp://localhost:7100` via a named tunnel (stable URL).
- **Tailscale** — install on both Paperclip's host and the worker's host; join the same tailnet; use the worker's `100.x.x.x` address. Stable, private, no public exposure. Best long-term choice.

### D. Paperclip on cloud, worker local

Reverse of C: Paperclip needs a route into your laptop. Tailscale mesh or ngrok on the laptop. (Also verify your laptop firewall allows inbound on the chosen port.)

---

## 7. Hire the agent in Paperclip

1. Start Paperclip: `cd ~/Desktop/Zootropolis && ./scripts/dev.sh`
2. Open `http://localhost:5173`.
3. Go to your company's campus: `http://localhost:5173/campus/<companyId>`.
4. Click the **+ Hire agent** button (top-right, below the Minimap).
5. Fill the form:
   - **Name** — whatever you want ("sunny", "leafy", "vm-tokyo", etc).
   - **Agent runtime endpoint** — the `ws://...` URL from step 6.
6. Submit.

Paperclip creates the agent with:
- `adapterType: "aliaskit_vm"`
- `metadata.zootropolis.layer: "agent"`
- `adapterConfig.runtimeEndpoint: "<your ws URL>"`

---

## 8. Verify

Within a few seconds of submitting the hire form:

- The campus UI shows a green reachability indicator on the new animal.
- If it's red, check the daemon's `runtime.log` — Paperclip sends a `hello` probe and expects a `ready` reply within 2 seconds.
- Click the animal → you land in `AgentView`. The drawer shows the endpoint + port.

Assign a tiny issue to the new leaf (e.g. "Write a haiku about Tuesday"):

- Daemon receives an `execute` request on the WebSocket.
- Spawns `claude` in the daemon's folder.
- Streams stdout back.
- Claude emits the close marker. Paperclip transitions the issue to `done`.

You should see the agent's screen in the campus change from "sleeping" to `running · ZOO-N` with a pulsing emerald dot.

---

## 9. Identity (AliasKit on the worker)

> Identity now lives on the worker, **not on Paperclip**. Paperclip only knows where the worker sits in this company's org chart.

If your worker needs an external-world persona (to sign up for services, receive SMS codes, swipe a virtual card), install an AliasKit skill on the worker's machine. The skill should:

1. Hold the credentials the worker owns (email inbox, phone number, card, TOTP secret).
2. Be discoverable by Claude at `<cwd>/.claude/skills/<name>/SKILL.md` — Claude Code auto-loads skills from there.
3. Be invoked by Claude when a task needs those credentials.

The same AliasKit skill powers the worker across every Paperclip company it joins — one worker = one internet persona, just like a real contractor with one email. Swapping skills (or having different workers with different personas) is how you get multiple distinct "employees" in the system.

---

## 10. Running multiple workers on one host

For a demo with 5 leaves, the simplest setup is 5 daemons on 5 different ports of the same machine:

```bash
# terminal 1
cd ~/Desktop/zootropolis-agent-1 && ZOOTROPOLIS_PORT=7100 npm start

# terminal 2
cd ~/Desktop/zootropolis-agent-2 && ZOOTROPOLIS_PORT=7101 npm start

# ... and so on
```

In the hire form, use `ws://127.0.0.1:7100/`, `ws://127.0.0.1:7101/`, etc.

Each daemon runs from its own folder, so session caches, workspace scratch, and memory don't collide. If you want them to appear on different machines in the video's "geography" story, use Tailscale addresses instead — visually identical on camera but actually distributed.

---

## 11. Troubleshooting

### Red reachability dot on the animal

- Is the daemon running? `ps | grep daemon.mjs`.
- Can Paperclip reach the port? From Paperclip's host: `nc -z <your-host> <port>` or `wscat -c ws://<your-host>:<port>/`.
- If tunnelled: is the tunnel URL current? ngrok free-tier URLs rotate every restart.

### Daemon crashes on first `execute`

- Check `runtime.log` in the daemon folder.
- Most common: `claude` not on `$PATH`. Set `ZOOTROPOLIS_CLAUDE_BINARY=/abs/path/to/claude`.
- Second-most-common: Node < 18. Upgrade.

### Issue never transitions to `done`

- Daemon logs show claude spawning but no close marker?
- The agent's `AGENTS.md` needs the Zootropolis skill pointer — check `<daemon-folder>/.claude/skills/zootropolis-paperclip/SKILL.md` exists (the daemon seeds it on first run; delete it and restart the daemon to re-seed).
- Claude may be producing output but no JSON on its last line. Watch the transcript in the campus UI — if it's emitting multiple JSON objects, only the last one on the last line counts.

### "agent_id_mismatch" in daemon logs

- The daemon was configured with `ZOOTROPOLIS_AGENT_ID=X` but Paperclip is trying to dial it for a different agent Y. Either clear the pin (`ZOOTROPOLIS_AGENT_ID=""`) so the daemon adopts whichever agent connects first, or make sure the hire URL points at the right daemon.

### Container agents failing to dial

- They shouldn't be — containers run as `claude_local` (in-process inside Paperclip), not `aliaskit_vm`. If a container is trying to dial a WebSocket it was probably misconfigured at hire time. Check `adapter_type` on the agent row — it should be `claude_local` for any non-leaf.

---

## 12. Tear-down

```bash
# stop the daemon
pkill -f daemon.mjs

# the agent row in Paperclip stays unless you delete it via the UI
# terminate / delete the agent from AgentView → settings or the Agents page
```

If you want a completely clean slate (rare, but useful for filming):

```bash
# stops everything, wipes all Paperclip state (DB, workspaces, agent folders)
rm -rf ~/Desktop/Zootropolis/.paperclip
# then restart: ./scripts/dev.sh — onboarding wizard fires fresh
```

---

## 13. Worked example — provisioning a fresh Mac VM from scratch

The sections above assume Node + `claude` are already on the worker. This section is the bare-metal playbook — what to run when you've just been handed SSH credentials to a blank macOS instance (ARM64 Mac VM from a VPS provider, fresh cloud Mac, etc.).

Concrete example: `ssh m1@62.210.166.166`, macOS 15.6.1 ARM64, 16GB RAM, only Python 3.9 + git preinstalled.

### 13.1 First-time SSH + key setup

```bash
# from your laptop
ssh m1@<vm-ip>                     # password login, one time only

# on the VM, add your pubkey so you never type the password again
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "ssh-ed25519 AAAA... you@laptop" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# verify from laptop
ssh -i ~/.ssh/<your-key> m1@<vm-ip> 'echo ok'
```

### 13.2 Passwordless sudo (optional but saves hours)

Homebrew's non-interactive installer needs sudo that doesn't re-prompt inside subshells. Fix once:

```bash
ssh m1@<vm-ip> 'echo "<password>" | sudo -S bash -c "echo \"$USER ALL=(ALL) NOPASSWD: ALL\" > /etc/sudoers.d/$USER_nopasswd && chmod 440 /etc/sudoers.d/$USER_nopasswd"'
```

**Only do this on a VM where you are the only user and you trust the network.** On a shared box, use `sudo -v` priming + an `expect` wrapper instead.

### 13.3 Homebrew + runtime deps

```bash
# on the VM
NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# put brew on PATH (Apple Silicon default)
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"

brew install node@22
# node@22 is keg-only — symlink if you want `node` globally
brew link --overwrite node@22
node --version                      # expect v22.x
```

Nothing else is strictly required for the daemon — `ws` is the only runtime dep. Python / ripgrep / ffmpeg aren't needed for the leaf itself, only if you're also installing a fuller agent runtime alongside.

### 13.4 Install the `claude` CLI on the VM

```bash
curl -fsSL https://claude.ai/install.sh | sh
claude --version                    # confirm
```

Log in once interactively (`claude` then follow the OAuth prompt), or drop a prebuilt `~/.claude/config.json` if you're provisioning in bulk.

### 13.5 Copy the daemon template onto the VM

```bash
# from your laptop, using the reference daemon in this repo
scp -i ~/.ssh/<your-key> -r ~/Desktop/Zootropolis/external_leaf_example m1@<vm-ip>:~/leaf-agent
```

### 13.6 Install daemon deps + skills

```bash
ssh m1@<vm-ip>
cd ~/leaf-agent
npm install                         # pulls `ws`
npm run sync-skill                  # seeds .claude/skills/zootropolis-paperclip/
```

If you want **Cua** (computer-use) and/or **AliasKit** (identity) skills on this worker, drop them next to the zootropolis one:

```bash
# Cua skill — wraps https://github.com/trycua/cua as a Claude Code skill
mkdir -p .claude/skills/cua
# write SKILL.md that exposes cua's Python SDK via bash snippets
# (example SKILL.md lives in your skills monorepo; not bundled here)

# AliasKit skill — one folder, credentials + invocation recipes
mkdir -p .claude/skills/aliaskit
# write SKILL.md + secrets file (gitignored) with email/phone/card creds
```

Claude Code auto-discovers every `SKILL.md` under `<cwd>/.claude/skills/*/` when spawned from that directory. Nothing else to wire up.

### 13.7 Expose the WebSocket

For a VM with a public IP, open port 7100 on the firewall (or your VPS's security group) and you're done. Skip ngrok/tailscale.

```bash
# test from laptop
nc -z <vm-ip> 7100                  # should exit 0 once daemon is up
```

For a NAT'd box, follow section 6.C.

### 13.8 Run the daemon under a process supervisor

`npm start` in an ssh session dies when you disconnect. Use one of:

```bash
# quickest — tmux
tmux new -s leaf
cd ~/leaf-agent && npm start
# detach: Ctrl-b d

# sturdier — pm2
npm install -g pm2
cd ~/leaf-agent && pm2 start npm --name leaf -- start
pm2 save && pm2 startup            # follow the sudo command it prints

# cleanest — launchd (mac-native, survives reboots)
# drop a ~/Library/LaunchAgents/com.zootropolis.leaf.plist that runs
# `npm start` in ~/leaf-agent with KeepAlive=true
```

### 13.9 Hire it in Paperclip

Back on your laptop: open `http://localhost:5173/campus/<companyId>`, click **+ Hire agent**, put `ws://<vm-ip>:7100/` as the runtime endpoint, submit. Green ring should appear within a couple seconds.

### 13.10 First-run smoke test

Assign the new leaf a throwaway issue like `echo hello and close`. Watch the campus UI:

- Animal transitions `sleeping → running · ZOO-N`
- Transcript streams in
- Issue flips to `done`
- Animal goes back to `sleeping`

If any step hangs, the daemon's `runtime.log` in `~/leaf-agent/` is the source of truth — `tail -f` it while you repro.

### 13.11 Gotchas we hit on the example VM

- **brew install failed with "Need sudo access"** — caused by `NONINTERACTIVE=1` disabling tty prompts. Fixed by the passwordless sudo setup in 13.2.
- **`hermes chat | ...`** piped fine, but interactive TUI doesn't pipe. Use `-Q -q "..."` for programmatic invocation. Same pattern applies to any CLI agent on the worker.
- **zsh prompt characters (`❯` / emoji)** break naive `expect` prompt-matching. Either match on a trailing `%` / `$`, or drop expect entirely and use one-shot SSH commands with the payload pre-written to a file.
- **Apple Silicon brew lives at `/opt/homebrew/bin/brew`**, not `/usr/local/bin/brew` like Intel macs. Hardcoding the Intel path silently fails.

---

## See also

- **`what_is_this.md`** — what Zootropolis is and what we added on top of Paperclip.
- **`docs/external-daemon-quickstart.md`** — the canonical daemon-author guide, referenced from here.
- **`docs/agent-runtime-contract.md`** — full wire protocol if you want to implement your own daemon from scratch (in a different language, with different identity, etc).
- **`external_leaf_example/daemon.mjs`** — the reference implementation you can copy.
