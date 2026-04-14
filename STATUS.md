# Zootropolis — v1 build status

Snapshot at end of the initial sprint. All 17 plan phases landed on
`work/zootropolis-v1` over commits `25c7f85..HEAD`.

## What works end-to-end

- **Delegation contract** (`design.md` §3) is enforced server-side: an
  agent can only assign issues to its direct report; agents only see
  issues they're a party to. Behind `ZOOTROPOLIS_DELEGATION_STRICT=true`.
  12 unit tests cover all rule cases.
- **Layer metadata** (`design.md` §2) lives in `agents.metadata.zootropolis`
  with no schema migrations. Containers are just Paperclip agents with a
  layer tag; the existing `reportsTo` tree is the spatial hierarchy.
- **`aliaskit-vm` adapter** registered in Paperclip's adapter registry.
  Talks to a per-agent runtime daemon over a small WebSocket protocol.
- **Agent-runtime daemon** (folder-as-VM in dev): one process per leaf
  agent in `~/zootropolis/agents/<id>/`. Spawns `claude --resume <sid>`
  per heartbeat, streams stdout/stderr back as protocol frames, returns
  exit + sessionId on completion.
- **Port broker** allocates a TCP port per leaf at hire (range
  7100–7999), spawns the daemon, persists the endpoint into both
  `agents.adapterConfig.runtimeEndpoint` (where the adapter reads it)
  and `agents.metadata.zootropolis.runtime` (where the UI reads it).
  Releases on fire.
- **Mock identity provisioning** writes a fake email/phone/card/TOTP
  into `<folder>/identity.json` on hire. Real AliasKit gated behind
  `ZOOTROPOLIS_USE_REAL_ALIASKIT`.
- **`/campus/:companyId` route** with five layer views (Campus →
  Building → Floor → Room → Agent), all wired to real Paperclip data
  via `useContainerChildren`. Camera-animated transitions between
  layers, live heartbeat pulses driven by Paperclip's existing WS,
  breadcrumb + minimap overlays, postprocess bloom, framed VM-stream
  surface in AgentView.

## Tests

- `pnpm --filter @paperclipai/server exec vitest run src/__tests__/zootropolis-delegation.test.ts` — 12 pass
- `pnpm --filter @paperclipai/agent-runtime exec vitest run` — 3 pass
- `pnpm --filter @paperclipai/adapter-aliaskit-vm exec vitest run` — 2 pass
- `pnpm typecheck` — clean across all 22 workspace packages.

## How to run

```bash
./scripts/dev.sh                          # boots Paperclip with PAPERCLIP_HOME=$PWD/.paperclip
pnpm tsx scripts/seed-zootropolis-demo.ts # builds the demo tree (one campus/building/2 floors/3 rooms/6 leaves)
# open http://localhost:5173/orgchart   — see layer pills
# open http://localhost:5173/campus/<companyId>  — see the 3D campus
```

See `scripts/verify-e2e.md` for the full manual verification script
(including the live Claude integration).

## v1 deliberate non-goals (locked at design.md §9)

- Real AliasKit API (mocked).
- Real noVNC stream in AgentView (placeholder reads runtime/identity from metadata).
- New entity tables for containers (containers ARE Paperclip agents with a layer tag).
- Camera-animated transitions across browser routes (only within a single Canvas; cross-route is a fade for now).

## v1.1 status — complete

All 17 v1.1 phases shipped on `work/zootropolis-v1` (commits `19b44d2..d0a2fd6`).

**External daemon support (Phase H1–H4)**
- Wire-protocol contract: [`docs/agent-runtime-contract.md`](docs/agent-runtime-contract.md).
- `agent.adapterConfig.externalEndpoint = "ws://your-vm:port/"` short-circuits
  the broker's in-process daemon spawn — Paperclip just dials your endpoint.
- `ZOOTROPOLIS_RUNTIME_MODE=external_only` rejects any in-process attempts.
- `scripts/zootropolis-register-external.ts` patches an existing agent's
  endpoint after the fact (handy for VM-up-after-hire flows).

**Leaf agents close their own issues (Phase D1–D3)**
- JSON close-marker convention (`{zootropolis:{action:"close",status,summary,artifact}}`)
  on the agent's last stdout line.
- Server recognises it, posts the artifact as the closing comment, transitions
  the issue to `done` (or `cancelled`).
- Daemon injects `skills/zootropolis-paperclip.md` on first execute so the
  agent knows the contract.
- `scripts/verify-leaf-roundtrip.ts` verifies end-to-end with real Claude.
- 9 unit tests for the marker parser; 21 total Zootropolis tests pass.

**Interactive campus (Phase E1–E5)**
- `useContainerIssues` hook returns `{issuedDown, receivedFromAbove}` for any
  layer, backed by a new server-side `createdByAgentId` filter.
- `ContainerInspector` side drawer mounted in all 5 views: layer pill,
  live-status dot, "Tasks delegated", "Tasks I owe" sections.
- Per-child "+ Delegate to <name>" buttons preserve `parentId` lineage.
- `IssueQuickLook` embedded in the drawer; back arrow restores layer overview.
- Live transcript inside AgentView's screen frame when the agent is running.

**Bottom-up tree creation (Phase F1–F4)**
- Empty-state campus with "+ Hire your first agent".
- Layer-aware "+ Hire <next layer down>" footer in each view.
- "+ Wrap me in a room/floor/building/campus" promote — creates the new
  container at `reportsTo = self.parent`, then PATCHes self under it.
- UI affordances mirror the strict delegation contract by construction.

**Visual upgrade (Phase G1–G6)**
- Procedural shaders: wall stucco, roof shingle, grass.
- Idle micro-animations: animal bob, status-light float, tree sway, cloud drift.
- Per-window flicker on building shells; intensity scales with descendant activity.
- Sky gradient + atmospheric fog (`<Sky />` + `<fog>`).
- Procedural decorations: trees, lampposts, clouds, chimneys, benches —
  instanced, deterministic positions, no GLB assets.
- `?lq=1` URL toggle skips postprocess for weak GPUs.

Each of these graduates by swapping one piece — the architecture is
already shaped so they're additive, not rewrites.
