# Zootropolis — Design

Execution-level design. Captures the decisions that shape how the system actually works. Companion to `idea.md` (the vision) — this doc is what the build follows.

## 1. Hierarchy

Five possible layers, in order from leaf to root:

```
agent  →  room  →  floor  →  building  →  campus
```

- **agent**: a single working entity with its own VM-surrogate and AliasKit identity. Rendered as a little animal/person. Leaf only — agents never contain anything.
- **room**: groups agents doing closely related work.
- **floor**: groups rooms.
- **building**: groups floors — usually one project / one goal.
- **campus**: groups buildings — the whole portfolio.

Containers are created **by intent**, not by auto-emergence. You hire a room when you want a room. Layers aren't computed from headcount thresholds — they exist because someone deliberately put them there.

A campus with one building, one floor, one room, and one agent is fine. Five agents in one flat room with no floor above is fine. Two entirely disconnected agents with no shared ancestor at all is fine. The structure mirrors whatever organization you actually want.

## 2. Everything is an agent

This is the single most important design call. **There is no separate "container" entity.** A room, floor, building, and campus are all just Paperclip agents with a layer tag in their metadata. The edges between them are normal `reportsTo` edges.

```
campus-agent         layer='campus',    adapter=claude-local
  ├─ building-agent  layer='building',  adapter=claude-local
  │   ├─ floor-agent layer='floor',     adapter=claude-local
  │   │   ├─ room-agent  layer='room',  adapter=claude-local
  │   │   │   ├─ leaf-agent  layer='agent', adapter=aliaskit-vm
  │   │   │   └─ leaf-agent  layer='agent', adapter=aliaskit-vm
```

The distinction between "leaf agent" and "container agent" lives entirely in the adapter. Schema-wise they're identical.

| | Leaf agent | Container agent |
|---|---|---|
| `metadata.zootropolis.layer` | `agent` | `room` / `floor` / `building` / `campus` |
| Adapter | `aliaskit-vm` | `claude-local` (or similar lightweight) |
| Has VM-surrogate / daemon | Yes — hire-to-fire | No |
| Has AliasKit identity | Yes | No |
| Has workspace folder | Yes | No |
| Does real internet work | Yes | No — pure text delegation |
| Receives down-issues | Yes (from its direct parent) | Yes (from its direct parent) |
| Creates down-issues | No (has no children) | Yes (to its direct children) |

### 2a. Mapping to Paperclip primitives

Paperclip supports this natively. Nothing in the core schema changes.

- **Tree**: `agents.reportsTo` (self-FK, nullable). Forest is legal — two agents with `reportsTo = null` are two independent root nodes.
- **Layer tag**: `agents.metadata.zootropolis = { layer, displayName, runtime? }` (JSONB on existing column).
- **Identity**: provisioned by the `aliaskit-vm` adapter's `onHireApproved` hook, handles stored in `agents.metadata.aliaskit.*`.
- **Tasks & artifacts**: Paperclip's existing `issues` table. We add at most one nullable column (`parentIssueId`) for lineage — and even that can live in issue metadata if we want truly zero schema changes.

**Zero new entity tables.** This is real — containers are agents, containers don't need a table.

## 3. The delegation contract

The entire coordination protocol collapses to one rule.

> **An issue may only exist between an agent and its direct parent or child in the `reportsTo` tree.**
>
> A creates an issue for B ⟺ `B.reportsTo === A.id`.
>
> No peer communication. No layer-skipping. No cross-subtree shortcuts.

Enforced server-side as a one-line check in `issueService.create`:

```
reject unless assignee.reportsTo === creator.id
```

### 3a. Consequences

- **No skip-layer delegation.** A building can't reach past its floors to task a specific room. The flat-mess failure mode of vanilla Paperclip is gone by construction.
- **No peer-to-peer messaging.** Two rooms on the same floor cannot talk to each other. If Room1 needs something from Room2, Room1 escalates to the floor-owner, who then tasks Room2. Each hop is a separate issue. (See §4 for the full mechanics.)
- **No communication across disconnected subtrees.** Two agents with no shared ancestor cannot coordinate at all. This is correct — every cross-chain coordination *requires* someone to own the decision about whether it should happen. If no one owns that decision, the coordination shouldn't happen.
- **One SQL check does all the enforcement.** Applies identically at every layer — leaf-to-room, room-to-floor, floor-to-building, building-to-campus. No special cases.

### 3b. Worked example: two agents, different rooms, same floor

A (in Room1) needs something from B (in Room2). Neither of them knows the other exists. Here's what happens:

```
  Agent A                                              Agent B
     │                                                   ▲
     │ up-issue to my room-owner                         │ down-issue from
     ▼                                                   │ my room-owner
  Room1-owner                                       Room2-owner
     │                                                   ▲
     │ up-issue to my floor-owner                        │ down-issue from
     ▼                                                   │ my floor-owner
                      Floor-owner
                (reads up-issue from Room1,
                 decides Room2 should handle it,
                 creates down-issue to Room2)
```

Each hop is a strict parent↔child issue. Four separate issues. A never sees B. Room1-owner never sees B. Floor-owner never sees A or B — just sees "a task from Room1" and "a delegation to Room2."

On the way back, the result propagates in the exact same way, one layer at a time, in reverse. Each owner closes its own issue only after reading the result of the child issue it spawned.

This is Parnas 1972 made literal. Every layer abstracts everything below it.

## 4. The issue protocol

**Every layer hop is a new, separate issue.** Never one-issue-with-threads, never nested sub-comments spanning layers.

### 4a. Why separate issues, not sub-issues within one

If there were one root issue with threaded comments propagating up and down, every agent touching it would inherit visibility into the whole thread. Room2-owner would open the issue and see Agent A's original request and Room1-owner's escalation. That breaks the information-hiding rule in a single read.

We could layer ACLs on top of a threaded issue, but that's the "permission the user has to remember" pattern we're specifically avoiding. Separate issues enforce the boundary at the data-model level, not at the permission layer.

### 4b. Lineage via `parentIssueId`

Each issue carries a nullable `parentIssueId` pointing to the issue that caused it to be created. This chain is for audit and lineage only — it does **not** grant visibility. Seeing `parentIssueId` on your own issue does not let you read the parent issue. Following the pointer requires being a party (creator or assignee) of the parent.

Stored either as a new nullable column on `issues`, or inside the existing issue metadata JSONB. Preference: new column for indexability.

### 4c. Issues as the artifact store

Every issue is both a task and its artifact. The deliverable for an issue is the closing comment + `heartbeat_runs.resultJson` from its final run. That pair *is* the artifact.

- **No loose files as deliverables.** Agents do not write their output to files-in-a-workspace and call the task done. They write the output into the issue's closing comment.
- **Large binary/source content stays in the workspace** (git commit, file paths) but the issue's result carries the *index* — commit SHAs, paths, links. The issue is the navigable record; the workspace is the content store.
- **A container's "filing cabinet" is free.** It's the list of issues where that container agent is creator or assignee. Zoom into the engineering floor → see the floor's open and closed issues → you have the floor's work product.

### 4d. Curation is the manager's job

Owners are not forwarders. When Room1-owner creates the up-issue to Floor-owner, it writes that issue's description in its own words — abstracted, compressed, reframed for what the floor needs to know. Same in reverse: when Floor-owner closes its issue back to Room1-owner, it curates the concrete result from below into a summary Room1-owner actually needs.

The entire hierarchy is justified by the fact that each owner adds value in both directions. A pure forwarder is wasting tokens and failing at its actual job.

### 4e. Issue visibility

One-line SQL filter on all list/read endpoints:

```
WHERE creator_agent_id = :me OR assignee_agent_id = :me
```

Agents literally cannot query for issues they're not a party to. This is where the zoom-level permission boundary in §5 comes from — the data is already filtered before the UI renders it.

## 5. Zoom = permission boundary

The UI affordance mirrors the architecture.

```
campus    ─► see child buildings + issues this campus created
building  ─► see child floors + issues this building created
floor     ─► see child rooms + issues this floor created
room      ─► see child agents + issues this room created
agent     ─► see that one agent's VM stream + its own issues
```

You can only interact with what's at your current zoom. You cannot click through an opaque container to the layer inside it from the outside — you have to zoom in. Same isolation the API enforces, made physical.

## 6. Growth mechanics

No auto-materialization. Containers come into existence by being hired, exactly like any other agent.

- **First agent.** Hire a leaf agent. It stands alone on the grass with `reportsTo = null`.
- **Add a room.** Hire a room-agent (layer='room') with `reportsTo = null`, then rehire the leaf with `reportsTo = room-agent.id`. The room visibly appears around the leaf.
- **Add a second room.** Hire another room-agent.
- **Group both rooms onto a floor.** Hire a floor-agent, set both room-agents' `reportsTo` to it.
- **And so on up.**

Single-child containers are fine. Empty containers (a room hired but no leaves yet) are fine — they render as empty shells waiting to be filled.

No thresholds, no downgrades, no auto-compaction. The spatial hierarchy is exactly what has been deliberately created.

## 7. What Zootropolis adds to Paperclip

Four surfaces, all additive. The core heartbeat and scheduler are untouched.

### 7a. `aliaskit-vm` adapter (leaves only)

`packages/adapters/aliaskit-vm/`, following the `openclaw-gateway` shape:

- `server/execute.ts` — WebSocket RPC to the agent's runtime endpoint. Per-run: connect, send `execute` frame, stream stdout/stderr via `onLog`, receive final result.
- `server/test.ts` — environment check (is the agent's daemon reachable?).
- `onHireApproved(payload, config)` — provisions an AliasKit identity (email, phone, card, TOTP), materializes creds into the agent's folder, boots the agent-runtime daemon, allocates a port, writes all of this into `agents.metadata.zootropolis.runtime`.
- `ui/build-config.ts` — config form.

**Leaf agents only.** Container agents use a standard text-mode adapter like `claude-local`; they have no VM surface and no identity needs.

### 7b. Container agent adapter

Container agents use `claude-local` (or equivalent). Their entire job is:

1. Wake when assigned an up-issue from a child OR a down-issue from a parent.
2. Read the issue. Read related open issues they own as context.
3. Either: close the issue with a curated result, OR create a new down-issue to one of their direct children, OR escalate via an up-issue to their parent.
4. Done.

No VM, no AliasKit identity, no workspace folder, no persistent state beyond their Claude session cache. Cheap and fast.

### 7c. Leaf agent runtime — folder-as-VM in dev, real VM in prod

The `aliaskit-vm` adapter talks to exactly one thing: a **WebSocket endpoint per agent**. What sits behind that endpoint is swappable. In dev it's a Node daemon running in a folder on the host. In prod it's a real Cua/Coasty VM (or any external runtime that implements the protocol). Wire protocol is identical — no dev/prod rewrite.

> **External daemon mode (v1.1).** When `agent.adapterConfig.externalEndpoint`
> is set, the broker skips the in-process daemon spawn and just records the
> endpoint as the runtime URL — the adapter dials whatever's at the other
> end. Full contract for building such a daemon is at
> [`docs/agent-runtime-contract.md`](../docs/agent-runtime-contract.md).
> Set `ZOOTROPOLIS_RUNTIME_MODE=external_only` to forbid in-process daemons
> entirely.

#### Folder-as-VM layout (dev)

Each leaf agent is backed by one local directory. It is the agent's entire world.

```
~/zootropolis/agents/<agent-id>/
  .claude/          Claude's session cache (--resume points here)
  workspace/        files the agent creates while working
  memory.md         durable notebook the agent reads/writes across runs
  identity.json     AliasKit creds (mocked locally in v1)
  skills/           Claude skills scoped to this agent only
  CLAUDE.md         per-agent system prompt — role + delegation rules
  runtime.log       daemon log
```

A small **agent-runtime daemon** (one Node process per agent) lives alongside the folder and listens on its own TCP port. It owns that folder and nothing else.

#### Process lifetime: hire-to-fire

The daemon boots when the agent is hired and stays alive until fired. This matches the prod VM model — the "VM" is the long-lived thing; heartbeats are RPC calls into it.

- **Hire** (`onHireApproved`): create folder, allocate port, spawn daemon, persist endpoint + port into `agents.metadata.zootropolis.runtime`.
- **Heartbeat**: adapter connects to daemon port, sends `execute`, streams results back, disconnects. Daemon stays up.
- **Fire**: adapter sends `shutdown`, daemon flushes state and exits, folder is archived (or deleted, per policy), port returns to broker.

Inside the daemon, Claude is still spawned **per wake** via `claude --resume <sessionId>` inside the folder. The daemon is a persistent supervisor; the Claude invocation is the ephemeral worker. Moving to a long-lived Claude subprocess in the future is a daemon-internal change, not a protocol change.

#### Port allocation

One port per agent. No multiplexing supervisor. This matches prod: each VM gets its own IP+port.

- Ports drawn from a configured range (e.g., `7100–7999`).
- Stored in `agents.metadata.zootropolis.runtime.port`.
- A small **port broker** in the server assigns/releases on hire/fire.
- Graduation: when an agent migrates to a real VM, the same stored port becomes the VM's exposed port.

#### Wire protocol (same in dev and prod)

Mirrors `openclaw-gateway`.

```
  Server (aliaskit-vm adapter)          Agent runtime daemon / VM
  ────────────────────────────          ─────────────────────────
  connect ws://<host>:<port>/
         ─── { type: "hello",
                agentId, token } ────►
         ◄── { type: "ready",
                caps: [...] } ─────

  per heartbeat:
         ─── { id, method: "execute",
                runId,
                wakePayload,
                resumeSessionId? } ───►
                                        cd <folder>
                                        spawn claude --resume … or fresh
                                        write wakePayload to stdin
         ◄── { stream: "stdout",
                chunk } ─────────────── (streamed in real time)
         ◄── { stream: "stderr",
                chunk } ───────────────
         ◄── { id, result: {
                exitCode, sessionId,
                usage, resultJson
              } } ─────────────────────

  on fire:
         ─── { method: "shutdown" } ───►
                                        daemon flushes state, exits
```

The adapter's `execute()` is a translator: Paperclip's `AdapterExecutionContext` in, wire frames out, `onLog` callback wired to stdout/stderr stream frames, final `result` envelope → `AdapterExecutionResult`. In prod, the only change is the connection URL.

#### Identity injection

AliasKit creds are materialized as files in the agent's folder at hire time (`identity.json`, plus any secrets under `.claude/` or exported as env vars into the Claude child). The agent reads them from disk like a human would read a password manager export. No network call to AliasKit at wake time — creds are already local.

#### Role enforcement at the agent layer

Per-agent `CLAUDE.md` holds the contract in natural language:

> You are a leaf worker. Your only manager is agent `<id>`. You may only create issues to that manager. You may not accept work from anyone else. When you finish a task, write your output into the closing comment of the issue you were assigned. Do not write deliverables to loose files.

The server-side check from §3 is the hard gate. `CLAUDE.md` is the soft gate that keeps the agent from wasting tokens trying to violate it.

#### Upgrade path to real VMs

Zero adapter changes. The daemon's entrypoint becomes PID 1 inside a Cua/Coasty container. Folder becomes an image layer. Localhost:port becomes VM-IP:port. Hire/fire switch from spawn/kill to VM acquire/release. `aliaskit-vm` never notices.

### 7d. `/campus` route

`ui/src/pages/Campus.tsx`, React Three Fiber + drei on Paperclip's existing React 19 / Vite 6 / Tailwind 4 stack.

See §8 for the visualization architecture in detail. Short version:

- Fetches the tree via existing `orgForCompany()` endpoint.
- Five separate scene components — `CampusView`, `BuildingView`, `FloorView`, `RoomView`, `AgentView` — behind React Router routes.
- Each scene renders only its own layer; navigating between zoom levels swaps scenes with a camera-animated transition that fakes continuous dolly-in.
- Subscribes to Paperclip's existing `/api/companies/:id/events/ws` for live heartbeat pulses and status changes.
- Clicking a container zooms one layer. Clicking an agent opens its VM stream inside the room.

### 7e. Delegation enforcement

Two patches to Paperclip, both small:

1. **`issueService.create`** — reject unless `assignee.reportsTo === creator.id`. The hard gate.
2. **`issueService.list` / `get`** — filter to `creator_agent_id = me OR assignee_agent_id = me`. The visibility gate.

Both are upstreamable as config flags.

## 8. Visualization architecture

Per-layer rendering, not one unified scene.

### 8a. Five scene components, one shared primitive

```
<CampusView>    renders buildings on a grid plane
<BuildingView>  renders floors stacked vertically
<FloorView>     renders rooms on a plane
<RoomView>      renders agent tiles arranged in the room
<AgentView>     renders the VM stream inside a framed box
```

All five are instances of a shared `<ContainerView layer={...} />` primitive parameterized by layer. Each instance: fetch children for this container, render them, attach click handlers that navigate one layer deeper, subscribe to live events for this container only.

React Router v7 (already in Paperclip) handles the URL side. Routes: `/campus/:id`, `/building/:id`, `/floor/:id`, `/room/:id`, `/agent/:id`.

### 8b. Camera-animated transitions, not cross-fades

When the user clicks into a deeper layer, the current scene's camera dollies toward the clicked child while scaling it up. At the moment the child fills the frame, the next scene swaps in with its camera already positioned at "just outside, same angle." The next scene's camera continues the dolly-in.

If the geometry at the handoff matches, the swap is invisible. This is how game engines fake seamless loading zones. Half a day of work vs. a cross-fade, and it's the difference between "this feels cool" and "this feels inevitable."

### 8c. Build order

1. **AgentView stubbed.** One large animal sprite, status light, label. No VNC. Proves the rendering primitive.
2. **RoomView.** Three stubbed agents arranged in a room shell. This is where `ContainerView` earns its keep.
3. **FloorView.** Rooms on a plane.
4. **BuildingView.** Stacked floors.
5. **CampusView.** Buildings on a grid.
6. **Paperclip hookup.** Replace hardcoded trees with `orgForCompany()` data.
7. **Heartbeat animations** via the existing WebSocket.
8. **VM stream** in AgentView — deferred to last, unblocks the Cua dependency.

### 8d. Aesthetic: flat-shaded low-poly

Reference is **Townscaper** / **Monument Valley**, not literally Minecraft. Minecraft was the scope guard (no GLBs, no textures, no asset pipeline), not the visual target.

What gets us from "gray boxes" to "Townscaper vibe" cheaply:

- **Flat Lambert materials + outlines.** `drei`'s `<Edges />` or toon-outline postprocess. Hand-drawn feel, kills the default-three.js look instantly.
- **Fixed 6–8 color palette.** Warm off-whites, muted terracottas, dusty blues, one saturated status accent. Pick from an existing palette (Coolors / Lospec) rather than rolling one.
- **Baked ambient occlusion.** `three-mesh-bvh` or a shader hack. Soft shadows between blocks is the single thing that makes flat geometry feel architectural.
- **Emissive window grids on building faces.** Windows turn on when rooms inside are active ("the lights are on"). Biggest visual payoff per line of code in the project.
- **`@react-three/postprocessing`** for a cel-shade + bloom pass. Bloom on the emissives gives the night-city feel.
- **Instanced roof decorations.** 3–5 archetypes (chimneys, antennas, skylights) stamped procedurally. Breaks up flat tops for free.

Libraries in: `@react-three/drei`, `@react-three/postprocessing`, `three-mesh-bvh`, `maath`.

Libraries out: anything that ships GLBs, any city-generator with its own scene model, CSG.

Guardrail: **no building should use more than 3 mesh types** (body + roof + window grid). If you're modeling a facade, stop.

### 8e. Navigation UX

Five-layer zoom is cognitively deep. Non-negotiable UX glue:

- **Persistent breadcrumb** at top: `Campus › HQ › Engineering › Backend › Agent-3`. Click any crumb to zoom back to that level.
- **Minimap** in a corner: a small stack showing all five layers with a dot at the current zoom.

Both are pure 2D overlays on top of the R3F canvas. ~100 lines of HTML. Ship alongside RoomView.

## 9. What v1 explicitly does not do

- No new entity tables.
- No new artifact store (issues cover it).
- No agent-to-agent RPC or message bus (everything goes through issues).
- No cross-campus coordination.
- No user-draggable spatial layout (positions are derived from the tree).
- No dashboard view — the campus IS the dashboard.
- No long-lived Claude subprocess inside the daemon (per-wake spawn is fine for v1).
- No GLB assets, no textures.

Each is a v2 candidate. None blocks the architecture.

## 10. Open questions

- **Container agent reasoning budget.** How cheap can we make the text adapter for containers? Probably a single API call per wake, not a full CLI invocation.
- **Budget inheritance and rollup.** Paperclip tracks per-agent. We likely want to sum upward at display time (building shows total across all descendants).
- **Issue search across layers.** When an admin wants to trace a request end-to-end through the `parentIssueId` chain, is that an admin-only view or exposed to the top-most agent?
- **Port broker crash recovery.** If the broker dies, how are in-use ports re-reconciled on restart? Probably just re-read `agents.metadata.zootropolis.runtime.port` for all living leaves.
- **Container agent rehiring.** If you want to rename a room or swap its owner, is that a new agent or an update? Default: update in place, `reportsTo` and layer stay the same.
