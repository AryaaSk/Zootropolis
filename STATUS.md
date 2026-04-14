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

## v1.1 status (in-progress)

Promoted from v1's deferred list:

- **Real per-VM process isolation** — supported via the external-daemon
  contract documented in [`docs/agent-runtime-contract.md`](docs/agent-runtime-contract.md).
  Set `agent.adapterConfig.externalEndpoint = "ws://your-vm:port/"` at hire
  time (or via `scripts/zootropolis-register-external.ts` after the fact),
  and the broker stops spawning an in-process daemon for that agent. To
  forbid in-process daemons entirely, set `ZOOTROPOLIS_RUNTIME_MODE=external_only`.
  The user is building the daemon side of this; the server contract is stable.
- **Leaf agents can actually close issues** (Phase D1 + D2). They emit a
  JSON close marker on their last stdout line; the server recognises it,
  posts the artifact as a comment, and transitions the issue to `done`.
  The daemon now also injects a `zootropolis-paperclip` skill into each
  agent's `skills/` directory on first execute, telling the agent how to
  use the convention.

In flight (this branch):

- Interactive campus (Phase E): drawer with delegated/owed issues, embedded
  issue quicklook, live transcript inside AgentView.
- Bottom-up tree creation (Phase F): hire agents/rooms/floors/buildings
  from inside the campus; "wrap in" promote.
- Visual upgrade (Phase G): procedural shaders + idle micro-animations
  (shipped); per-window flicker, sky+fog, GLB decorations (in flight).

Each of these graduates by swapping one piece — the architecture is
already shaped so they're additive, not rewrites.
