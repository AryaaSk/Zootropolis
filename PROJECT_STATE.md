# Zootropolis — Project State

**Snapshot written 2026-04-14, end of v1.3.**
Branch: `work/zootropolis-v1`. Most recent commit at time of writing:
`73c6ab8 fix(ui): hoist dialogs to App root so /campus can open them`.

This document is the handoff memo — what exists, how it fits together,
what's known-broken, what's next. If you're resuming work on this repo
after a break, read this end-to-end first.

---

## 1. What Zootropolis is

A fork of [Paperclip](https://github.com/paperclipai/paperclip) (AI agent
control plane) that:

- Renders the agent org as a **navigable 3D campus** (`/campus/:companyId`)
  with five spatial layers: `agent → room → floor → building → campus`.
- Enforces **strict parent↔child delegation** — issues flow only between
  an agent and its direct parent or child; no skip-layer, no peer.
  Information hiding enforced at the API, not as a UI nudge.
- Treats **issues as messages** between agents, with a required `artifact`
  field. No silent closes; the server hard-rejects any close without a
  deliverable.
- Supports **external runtime daemons** for leaf agents — the agent runs
  on any VM/container you bring, connects to Paperclip via WebSocket,
  fetches identity via API, ships artifacts back via the close marker.

## 2. Capabilities (v1.3)

### Paperclip core (unchanged from upstream)

All of upstream Paperclip continues to work: the org-chart flat view
(`/orgchart`), issue board (`/issues`), agent detail pages, heartbeat
scheduler, adapter registry, local Postgres, company switcher, sidebar nav.

### Zootropolis additions

**Delegation + visibility (strict, enforced server-side):**
- `issueService.create` rejects unless `assignee.reportsTo === creator.id`.
- `issueService.list` / `getById` scope results so agents only see issues
  they're a party to. Humans / board keep full visibility.
- Behind `ZOOTROPOLIS_DELEGATION_STRICT=true` (default in `dev.sh`).
- 12 unit tests in `zootropolis-delegation.test.ts`.

**Hierarchy model:**
- No new entity tables. Containers ARE Paperclip agents with a
  `metadata.zootropolis.layer` tag (room / floor / building / campus).
- `reportsTo` is the spatial parent edge.
- Leaves use `adapterType: "aliaskit_vm"`; containers use `claude_local`.

**3D campus UI (`/campus/:companyId`):**
- Per-layer archetype rendering: agents=animals, rooms=shells, floors=
  slabs, buildings=GLB models, campuses=tower clusters (N1).
- Auto-redirect from campus root to the single-root view when only one
  thing exists, so a lone leaf doesn't render as a ghost tower (N2).
- Persistent "+ Hire agent" button top-right, always visible (N3).
- Side-drawer inspector: "Tasks delegated", "Tasks I owe", embedded
  IssueQuickLook, reachability status, Wrap-in / Add-to-existing
  structure controls.
- Camera-animated transitions between layers (B6).
- Live heartbeat pulses, status lights, window flicker on buildings
  (B5, G4).
- Townscaper-style aesthetic: flat Lambert + outlines + procedural
  shaders (stucco, shingle, grass) (G1).
- Idle micro-animations: animal bob, tree sway, cloud drift, lamppost
  glow (G3).
- `?lq=1` URL toggle skips GLBs + postprocess for weak GPUs (G6).
- Breadcrumb + minimap + exit-campus button (B8, M2).
- Skip-agent button in Paperclip's onboarding wizard for
  Zootropolis-native flow (M1).

**Real low-poly 3D (24 GLBs, 497 KB total, CC0):**
- 8 animals (fox/cat/owl/bear/rabbit/wolf/dog/sheep) role-mapped
  (engineer=fox, researcher=owl, pm=bear, …) (K2).
- 5 buildings (small-house/office/shop/tower/cottage), hashed per
  agentId (K3).
- 6 nature models (trees, rocks, bush, fence-post, lamppost) (K4).
- 5 furniture pieces (desk, chair, monitor, lamp, bookshelf) in
  RoomInterior (K5).
- All under `ui/public/assets/zootropolis/` with LICENSES.md.
- Procedural fallbacks preserved under `?lq=1`.

**Leaf-agent runtime:**
- `aliaskit_vm` adapter talks to any WebSocket endpoint over a small
  5-frame protocol (hello/ready/req/stream/res). Spec at
  `docs/agent-runtime-contract.md`.
- External daemons supply their `externalEndpoint` at hire time;
  Paperclip never auto-provisions runtimes.
- Reference daemon at `packages/agent-runtime/` (dormant — the
  server doesn't spawn it; useful as a reference implementation).
- External-daemon skeleton at `~/Desktop/zootropolis-agent-1/`
  (separate repo, outside `Zootropolis/`).
- Identity (email/phone/card/TOTP) minted into
  `agents.metadata.zootropolis.aliaskit` at hire time, served via
  `GET /api/companies/:id/agents/:id/identity`. Mocked (v1); real
  AliasKit integration gated behind `ZOOTROPOLIS_USE_REAL_ALIASKIT`.
- Reachability probe at `GET /api/companies/:id/agents/:id/runtime-probe`
  opens a brief hello/ready handshake with 2s timeout. Polled by the
  campus UI every 10s per leaf; unreachable leaves render red.

**Issue-close contract (hard-enforced):**
- Agents emit `{"zootropolis":{"action":"close","status":"done|cancelled","summary":"...","artifact":"..."}}`
  as the last line of stdout.
- `artifact` is **mandatory**. The server hard-rejects empty/missing
  artifact with a violation comment; the issue does not transition.
- Next heartbeat wakes the agent with the violation in the thread.
- Propagated to agents via two channels:
  - **Leaf skill** at `.claude/skills/zootropolis-paperclip/SKILL.md`
    (written by daemon bootstrap).
  - **Wake-payload preamble** (`zootropolis` field on every stdin JSON)
    split into `allAgents` and `containersOnly` sections.

**Onboarding & navigation:**
- `/campus` is a proper sidebar entry under Company (next to Org).
- Onboarding wizard has a "Skip: go to campus" button that creates
  the company without the default CEO-agent (M1).
- Exit-campus button top-left of the overlay returns to standard
  Paperclip (M2).
- `zootropolis.config.json` at repo root controls the two Zootropolis
  env vars (`ZOOTROPOLIS_DELEGATION_STRICT`, `ZOOTROPOLIS_USE_REAL_ALIASKIT`);
  loaded by `scripts/dev.sh`.

## 3. Architecture map (where the code lives)

```
Zootropolis/
├── paperclip-master/                     # vendored Paperclip fork
│   ├── server/src/
│   │   ├── services/
│   │   │   ├── issues.ts                 # A1: strict delegation + visibility filter
│   │   │   ├── heartbeat.ts              # D1/P2/P3: close marker + wake preamble + hard reject
│   │   │   ├── agent-runtime-probe.ts    # J1: reachability probe
│   │   │   └── port-broker.ts            # dormant (L2 unhooked)
│   │   └── routes/
│   │       └── agents.ts                 # I1/L1/P4: endpoint-required hire + identity API
│   ├── packages/
│   │   ├── shared/src/zootropolis.ts     # A2/D1: layer types + close marker parser
│   │   ├── adapters/aliaskit-vm/         # A3/L1: WS client adapter
│   │   │   └── src/server/
│   │   │       ├── execute.ts            # WS client for heartbeats
│   │   │       ├── test.ts               # environment check probe
│   │   │       ├── identity.ts           # L1: mockIdentityFor() pure helper
│   │   │       └── on-hire-approved.ts   # L1: now a no-op (identity moved to API)
│   │   └── agent-runtime/                # A4/O1: reference daemon (auto-adopt + strict mismatch)
│   │       └── src/
│   │           ├── daemon.ts             # WebSocket server
│   │           ├── folder-bootstrap.ts   # L3: skill at .claude/skills/<name>/SKILL.md
│   │           ├── claude-invoker.ts     # O2: spawn + ENOENT handling
│   │           └── skills/zootropolis-paperclip.md   # Q1: leaf-focused skill
│   └── ui/src/
│       ├── App.tsx                       # routes + hoisted dialogs (most recent fix)
│       ├── components/
│       │   ├── OnboardingWizard.tsx      # M1: Skip-to-campus button
│       │   └── Sidebar.tsx               # Campus sidebar entry
│       └── pages/campus/                 # the whole 3D campus UI
│           ├── Campus.tsx                # root dispatcher
│           ├── views/
│           │   ├── CampusView.tsx        # N1/N2: archetype dispatch + single-root redirect
│           │   ├── BuildingView.tsx
│           │   ├── FloorView.tsx
│           │   ├── RoomView.tsx
│           │   └── AgentView.tsx         # E5/B7: live transcript + VM-stream frame
│           ├── components/
│           │   ├── ContainerInspector.tsx # E2/E3/F2/F3: drawer + hire + wrap + delegate
│           │   ├── AddToExistingDialog.tsx # I3
│           │   ├── HireAgentButton.tsx   # N3
│           │   ├── ExitCampusButton.tsx  # M2
│           │   ├── CampusOverlay.tsx     # mounts Breadcrumb/Minimap/Hire/Exit
│           │   ├── Animal.tsx            # K2/J2: GLB animal + reachability red dot
│           │   ├── StatusLight.tsx       # J2: unreachable state
│           │   ├── RootArchetype.tsx     # N1: per-layer child dispatcher
│           │   ├── Breadcrumb.tsx, Minimap.tsx, CampusOverlay.tsx
│           │   ├── CampusDecorations.tsx # K4: GLB nature
│           │   ├── CampusEnvironment.tsx # G5: sky + fog
│           │   ├── BuildingWindows.tsx   # G4: per-window flicker
│           │   ├── CampusPostFx.tsx      # G6: bloom + lq toggle
│           │   ├── IssueQuickLook.tsx    # E4
│           │   ├── ReachabilityStatus.tsx # J2
│           │   └── models/
│           │       ├── AnimalModel.tsx   # K2: role → GLB
│           │       ├── BuildingModel.tsx # K3
│           │       ├── NatureModels.tsx  # K4
│           │       └── RoomInterior.tsx  # K5
│           ├── hooks/
│           │   ├── useContainerChildren.ts
│           │   ├── useContainerIssues.ts      # E1
│           │   ├── useContainerLiveStatus.ts
│           │   ├── useAgentLiveStatus.ts
│           │   └── useAgentReachability.ts    # J2
│           ├── lib/
│           │   ├── zoom-transition.ts         # B6
│           │   └── quality-mode.ts            # G6: useLowQualityMode()
│           ├── shaders/{wall-stucco,roof-shingle,grass}.ts   # G1
│           └── palette.ts
│
├── docs/                                 # human-facing
│   ├── agent-runtime-contract.md         # H1: exhaustive daemon wire-protocol spec
│   ├── external-daemon-quickstart.md     # H1: short action-oriented guide
│   ├── external-agent-v1.2-migration.md  # L: identity-via-API migration
│   ├── external-agent-v1.3-migration.md  # O: auto-adopt + strict mismatch + spawn logs
│   └── external-agent-skill-update.md    # Q: how to sync embedded PAPERCLIP_SKILL
│
├── scripts/
│   ├── dev.sh                            # boots server+UI with config loaded
│   ├── zootropolis-env.mjs               # config→env loader
│   ├── zootropolis-config.schema.json    # JSON Schema for the config
│   ├── seed-zootropolis-demo.ts          # seed a demo tree (needs update — top-down)
│   ├── verify-e2e.md                     # manual full-stack verification
│   ├── verify-leaf-roundtrip.ts          # D3: automated leaf-roundtrip check
│   └── zootropolis-register-external.ts  # patches agent with external endpoint
│
├── zootropolis.config.json               # delegation.strict + aliaskit.useReal (only)
├── idea.md                               # vision
├── design.md                             # execution-level design (§1–§10)
└── STATUS.md                             # auto-updated per-version summary
```

## 4. External agent (outside the Paperclip repo)

`~/Desktop/zootropolis-agent-1/` is the user's self-contained daemon
(separate folder, not in this repo). Contract is in `docs/agent-runtime-contract.md`.
It has gone through three migration passes:

- **v1.2:** identity via API (no local `identity.json`), `.claude/skills/`
  layout, `companyId` bootstrap input.
- **v1.3:** auto-adopt `agentId` from first hello OR strict-match refuse
  on mismatch. Verbose spawn/exit logging with ENOENT hint.
- **Current state:** `package.json`'s `zootropolis` block should contain
  `companyId`, `port`, `paperclipApi`, optionally `agentId` (blank means
  auto-adopt).

Hand off `docs/external-agent-v1.3-migration.md` + `docs/external-agent-skill-update.md`
to keep this daemon in sync with Paperclip.

## 5. Version history (commits by phase)

All commits on `work/zootropolis-v1`:

### v1.0 — ship
- Phase 0: repo init + dev.sh wrapper
- Phase A1-A7: backend foundation (delegation, layer metadata, adapter
  scaffold, daemon, port broker, mock identity, E2E)
- Phase B1-B8: 3D campus UI (route, views, data hookup, heartbeat
  animations, camera transitions, VM stream placeholder, polish)
- Phase C1: integration demo

### v1.1 — real work end-to-end
- D1: close marker
- D2: skill injection
- D3: verify-leaf-roundtrip script
- E1-E5: interactive campus (issues hook, drawer, delegate buttons,
  quicklook, transcript)
- F1-F4: bottom-up tree creation (empty state, hire controls, wrap-in)
- G1-G6: visual upgrade (shaders, decorations, animations, window flicker,
  sky, LQ toggle)
- H1-H4: external daemon contract + docs

### v1.2 — external-only
- I1-I3: bottom-up hire + Add-to-existing + endpoint-required
- J1-J2: reachability probe + red indicator
- K1-K7: real GLB models
- L1-L4: identity-via-API; port broker off hot path; `.claude/skills/`
  convention
- M1-M2: skip-wizard + exit-campus escape hatches

### v1.3 — tighter contract
- N1-N4: right-layer landing, per-child archetype, persistent Hire,
  re-parent semantics note
- O1-O3: daemon auto-adopt + strict mismatch + spawn logs
- P1-P4: mandatory artifact (skill + preamble + hard reject); pending@
  slug bug fix
- Q1-Q3: skill/preamble separation (leaves don't delegate)

## 6. Known limitations (current)

- **Mocked AliasKit identities** — all emails end `@zootropolis-mock.local`.
  Real AliasKit API integration is gated behind
  `ZOOTROPOLIS_USE_REAL_ALIASKIT`. Switch is unimplemented; setting true
  returns an error.
- **No noVNC stream** — AgentView shows an HTML placeholder with the
  agent's runtime endpoint + email. Real VNC stream is v1.4+ work once
  Cua/Coasty integration exists.
- **No memory.md editor in the drawer** — the file exists in the agent's
  folder but there's no UI to inspect or edit it from the campus.
- **No drag-to-move** — Wrap-in / Add-to-existing are button-driven.
  Drag-and-drop between containers is v1.4+.
- **Reverse-RPC not implemented** — external daemons can only receive
  frames; they cannot initiate control-plane calls back to Paperclip.
  Meaning external agents can't delegate (only closing works). Since
  only containers ever delegate and all containers are currently
  `claude_local` (in-process on Paperclip's host), this doesn't block
  anyone today.
- **No auth tokens for external daemons** — the `HelloFrame.token` field
  is spec'd but Paperclip doesn't generate or validate it. Dev/single-
  machine only. Prod-readiness requires this.
- **Port broker module still in repo but dormant** — no code path calls
  it. Removed from the hot path in Phase L2. Safe to delete in a future
  cleanup, or repurpose if we ever want an in-process dev-daemon.
- **Seed script (`scripts/seed-zootropolis-demo.ts`) is top-down** — it
  hires container agents via the API with explicit parents, contradicting
  the v1.2+ bottom-up flow. Still works for dev convenience; should be
  rewritten for v1.4 to either skip or bootstrap leaves first.
- **`BuildingPlaceholder` deleted** — replaced by `RootArchetype` in N1.
  If any code references `BuildingPlaceholder` it'll be an import error
  (none found as of this writing).
- **HireAgentButton position** is hard-coded below the minimap at
  `top-52` (208px). If the minimap's height changes, the button needs
  to move in tandem. Long-term fix: wrap them in a flex column in
  `CampusOverlay`.

## 7. Future work (prioritized)

### v1.4 candidates — pick any

**A. Real noVNC stream in AgentView.**
- Replaces the text placeholder.
- Requires Cua/Coasty integration or a VNC server on the agent's VM.
- Extend `AdapterRuntime` to include a `vncUrl`; plumb through
  `metadata.zootropolis.runtime.vncUrl` end-to-end.
- noVNC iframe mounted inside the existing `<Html transform>` frame in
  `AgentView.tsx`.

**B. Real AliasKit API integration.**
- Implement the `ZOOTROPOLIS_USE_REAL_ALIASKIT=true` branch in
  `on-hire-approved.ts`.
- Needs a real AliasKit account + credentials vault (use Paperclip's
  existing `secretService` for the master secret).
- Mock identity JSON shape already matches; just swap the source.

**C. memory.md API + editor.**
- `GET/PATCH /api/companies/:id/agents/:id/memory`.
- Drawer panel to view/edit; agents can read via wake-payload injection
  (instead of or in addition to the filesystem file they have today).
- Sync bidirectionally: the daemon writes memory.md, the API reads it,
  the UI mutates and pushes back.

**D. Drag-to-move for agents.**
- DnD between containers; respects layer constraints.
- Visual: drag an animal out of one room into another.
- Backend: re-parent API already exists (N2/I3); pure UI work.

**E. Reverse-RPC protocol frames.**
- Extend the WS protocol with `daemon→server` req frames: e.g., the
  daemon tells Paperclip "create child issue X assigned to Y, parentId Z".
- Paperclip validates the strict-delegation rule and executes.
- Unblocks external container agents (container running on a remote VM).
- Bump `PROTOCOL_VERSION` to 2 in a backward-compatible way (old
  daemons still work; new feature opt-in via `caps` in ReadyFrame).

**F. Auth tokens for external daemons.**
- Broker generates per-agent secret at hire (HMAC of agentId with
  server master key).
- Secret passed to daemon out of band (env var at VM boot / config).
- Daemon sends `token` in HelloFrame; server validates.
- Required for any prod deployment.

**G. Visual polish & performance.**
- Wrap HireAgentButton + Minimap in a flex column in CampusOverlay so
  they auto-stack.
- Bundle-size-aware GLB loading (tree-shake unused archetypes per
  visible layer).
- Proper bake/GI on the PostFx pass if GPU budget allows.
- Settings UI for `?lq=1` toggle (currently hidden URL param).

### v1.5+ speculative

- **Agent-to-agent memory sharing.** Container could read descendants'
  memory.md snapshots to distil into its own — useful for "what has
  my floor actually done this week" type reflections.
- **Multi-company campus** — show several companies side-by-side as
  separate campuses on a world map. Paperclip's data model already
  supports multi-tenancy; needs a UI at a layer above `/campus/:id`.
- **Activity log / audit view.** Campus-native view of recent
  heartbeats, close markers, violations. Taps into Paperclip's
  activity-log service.
- **Custom skill injection per agent-archetype.** E.g., a "researcher"
  role gets a different skill file than an "engineer" on first bootstrap.
- **Agent "personality" metadata** — role-mapped dialog preferences,
  preferred decomposition style, etc. Stored in `agents.metadata.zootropolis`.

## 8. How to resume development

```bash
# Install (one-time, ≥Node 20, pnpm 9.15.4)
cd ~/Desktop/Zootropolis/paperclip-master
pnpm install

# Dev loop
cd ~/Desktop/Zootropolis
./scripts/dev.sh          # terminal 1: server (:3100) + UI (:5173)

# External agent (separate terminal, outside the repo)
cd ~/Desktop/zootropolis-agent-1
npm start

# Fresh start
rm -rf .paperclip
./scripts/dev.sh
```

Browser: `http://localhost:5173` → onboarding wizard → "Skip: go to
campus" → click "+ Hire agent" top-right → paste `ws://localhost:7100/`
→ watch the leaf appear and turn green.

### Verification

- `cd paperclip-master && pnpm typecheck` — all 22 packages clean.
- `pnpm --filter @paperclipai/server exec vitest run src/__tests__/zootropolis-*.test.ts`
- `pnpm --filter @paperclipai/agent-runtime exec vitest run`
- `pnpm --filter @paperclipai/adapter-aliaskit-vm exec vitest run`

All tests should pass (21+ total across Zootropolis-specific test files).

### When you're lost

- `idea.md` — the vision.
- `design.md` — execution-level design decisions.
- `STATUS.md` — per-version shipping summary.
- `docs/agent-runtime-contract.md` — everything about external daemons.
- This file — structural handoff.
- `~/.claude/plans/misty-noodling-valiant.md` — most recent plan (v1.3).
- `git log --oneline work/zootropolis-v1` — per-commit narrative.

## 9. Principles to preserve

Listed so future changes don't quietly erode them:

1. **Containers emerge, never pre-exist.** Hire leaves → group into rooms
   → stack rooms into floors → etc. Never the other way around.
2. **Issues are messages.** The artifact IS the deliverable. Server
   rejects closes without artifacts.
3. **Strict layer-by-layer delegation.** An issue is between an agent and
   its direct parent or child. Never skip. Never sideways.
4. **Paperclip doesn't provision runtimes.** Leaf agents run somewhere
   the operator provisions. Paperclip just dials the URL.
5. **Zoom level = permission boundary.** What you see is what you're
   allowed to touch. Drill down to interact.
6. **Config is small.** `zootropolis.config.json` is two booleans. Resist
   adding knobs; prefer sensible defaults.
7. **Archetype per layer.** A lone leaf renders as an animal, not a
   ghost tower. Every visual element matches its semantic layer.
8. **Townscaper, not Minecraft and not Pixar.** Flat Lambert + palette
   + outlines + GLBs that fit the aesthetic. No textures beyond
   procedural shaders. No ray tracing.
