# What Is This?

**Zootropolis** is a fork of [Paperclip](https://github.com/paperclipai/paperclip) — the AI-agent orchestration platform — extended with three substantial additions on top of the base product:

1. A **3D spatial visualisation** of the agent hierarchy as a literal city.
2. A **strict delegation system** that prevents non-leaf agents from doing work themselves.
3. **External-only leaf agents** that connect over a WebSocket — meaning the actual work is performed by AI agents running anywhere (a VM, another machine, a cloud worker), not bundled into the Paperclip server process.

The thread tying all three together is that we treat **issues as a messaging platform between agents**, rather than as static tickets on a board. That single reframing changes how the rest of the system has to behave.

This document explains each piece — what we inherited, what we added, why, and how it fits together.

---

## 1. The base layer: Paperclip (inherited)

Paperclip is an opinionated control plane for managing teams of AI agents inside a "company." It provides:

- **Agents** as first-class entities with a `reportsTo` hierarchy (an org chart). Each agent has a role, a budget, an adapter that decides how it actually executes (Claude Code, Codex, Cursor, Gemini, custom WebSocket, etc.), and an `AGENTS.md` that's loaded into its system prompt.
- **Issues** as the unit of work. Each issue has an assignee, a parent (for sub-tasks), a status (`todo` / `in_progress` / `done` / `blocked` / `cancelled`), comments, attachments, documents, and a "close marker" contract that agents emit on stdout to transition the issue to done.
- **Heartbeats** as the agent execution model. Agents don't run continuously — they wake up in short windows ("heartbeats") triggered by assignment, comment, or scheduled cron, do a unit of work, then exit. The Paperclip server orchestrates wake/checkout/run-lifecycle.
- An **embedded Postgres database** for state, a **REST + WebSocket API** for everything, and a **React UI** for humans to inspect what agents are doing.
- A **Paperclip skill** (`SKILL.md`) installed into each agent's `.claude/skills/paperclip/` that teaches the agent the heartbeat procedure (identity → checkout → context → do work → close).

We inherit all of this. The Paperclip server, DB schema, REST API, and React UI underpin the whole fork — we layer on top, we don't rewrite.

---

## 2. What we added: the 3D campus

**Where the "Zootropolis" name comes from.** Instead of looking at the agent org chart as a flat tree in the standard Paperclip UI, you walk through it as a 3D city.

- **Layers** map to spatial scales. Every agent has a `metadata.zootropolis.layer` field with one of: `agent` (leaf — rendered as an animal), `room`, `floor`, `building`, `campus`. When you "zoom in" on a building, you fly inside it and see its floors. Click a floor → see its rooms. Click a room → see the leaf agents inside as little animals walking around.
- **Five views**, one per layer: `CampusView`, `BuildingView`, `FloorView`, `RoomView`, `AgentView`. Each is its own React Three Fiber `<Canvas>` with a hand-tuned camera, layout, and physical metaphor. The transitions between layers are dolly-zoom animations so it feels continuous.
- **Floating "control panel" screens** anchored in 3D space above each agent/container show what the agent is currently doing — its active issue, its live heartbeat status (running/idle/sleeping), and a clickable list of pending issues. Click a screen → jump to the corresponding Paperclip detail page.
- **A persistent right-edge inspector drawer** lists the agent's delegated and received issues, lets you create new sub-issues with the layer rules enforced, and surfaces a "wrap me in a building" promotion flow for restructuring the org from inside the campus.
- **Live activity** is indicated by 3D cues — building windows light up when descendants are running, agents pulse, delegation is animated as little "travellers" moving from delegator to delegatee.
- **Editable layout.** You can drag agents to rearrange tiles within their parent. The position is persisted to `metadata.zootropolis.pos` and re-rendered next load.

The point isn't gimmickry — it's that **spatial intuition is the right metaphor for "who reports to whom and who is currently doing what."** A flat list of 50 agents in 5 buildings is hard to scan. A flyover of those 5 buildings, each glowing if its agents are working, is immediately legible.

Implementation lives in `paperclip-master/ui/src/pages/campus/`. R3F + drei + a Townscaper-inspired warm palette for the world, paired with shadcn/ui dark glass for the 2D chrome (Breadcrumb / Minimap / Inspector / TimeOfDaySlider / FocalContainerPanel).

---

## 3. What we added: strict delegation

The biggest semantic change. In stock Paperclip, every agent's heartbeat skill ends with **"Step 7 — Do the work."** Agents are autonomous workers; they pick up an issue and execute it.

For Zootropolis we forked that contract for non-leaf agents.

### The rule

An agent at any container layer (`room`, `floor`, `building`, `campus`) **does not do work**. Its only legitimate actions are:

1. **DECOMPOSE** — split its assigned issue into smaller sub-tasks.
2. **DELEGATE** — POST each sub-task as a sub-issue to a direct report whose layer is **exactly one rung below** (no skip-layer assignments).
3. **SYNTHESISE** — once every sub-issue is closed, write a synthesis artifact and close its own issue.
4. **TRIVIAL ANSWER** — for the rare case where the entire issue is a single one-line factual answer.

There is no fifth action. If the agent is about to write a file, run a shell command, install a package, or otherwise produce a deliverable, it has drifted into "doing the work" — which is illegal for it.

### Why this matters

This is what makes the system **scalable**. In stock Paperclip a single CEO agent could try to absorb arbitrarily large tasks and exhaust its budget on a single issue. With strict delegation, complexity propagates downward through the hierarchy:

- A `building` agent receives a coarse company-level task, splits it into floor-level chunks, hands each to a `floor`.
- Each `floor` further splits into rooms, etc.
- Only `agent`-layer leaves do the actual code-writing / research / file-producing work.
- Synthesis bubbles back up: each container synthesises its children's artifacts before closing its own.

This is exactly how a real engineering org scales: managers decompose, ICs execute, results flow back up. The tree depth is the company's ability to absorb complexity in parallel.

### How it's enforced

We enforce the contract in **multiple overlapping layers** — strict delegation isn't just a prompt suggestion, it's a server invariant.

| Layer | Check |
|---|---|
| **Per-agent `AGENTS.md`** loaded into the container's system prompt | Spells out the four legal actions, requires a printed `ZOOTROPOLIS DECISION` block before any tool call, includes the layer-adjacency rule and worked bad-pattern examples. Lives at `server/src/onboarding-assets/zootropolis-container/AGENTS.md`, materialised at hire-time, swappable per-agent in the UI. |
| **Server-side layer-adjacency check** in `issueService.create` | `POST /api/companies/{id}/issues` returns `409 Conflict` if `assigneeAgentId.layer` is not exactly one rung below the request actor's layer. Skip-layer attempts (e.g. floor → leaf) are refused. |
| **Server-side close-marker gate** in `heartbeat.ts` | A container agent that emits a close-marker with **zero sub-issues** is hard-rejected with a violation comment; the issue stays open. Same for closing while any sub-issue is still open. |
| **`backlog` is dead** | Agent-created issues default to `todo`, not `backlog`. Server rejects explicit `status: "backlog"` on create or update. Removes the silent "issue exists but no one is told" failure mode. |
| **Server-driven `description` in wake payload** | Earlier failure mode: agents would skim the title and miss instructions buried in the description. The wake payload now carries `description` directly, and the AGENTS.md emphasises reading both. |

### The visible "decision" block

The most pragmatic addition: every container-agent run **must print a structured `ZOOTROPOLIS DECISION` block before any tool call**, like:

```
ZOOTROPOLIS DECISION
====================
Issue: ZOO-14 — fully plan out a new b2b saas
My layer: floor
Decision: DELEGATE
Reasoning: This is a multi-discipline planning task with no execution
  details yet. I should split into market analysis, product, technical
  architecture, UX, and synthesis sub-issues for the rooms below me.

Decomposition plan:
  1. room "Research market needs for B2B SaaS" — surface pains/opportunities
  2. room "Plan the product" — product vision + roadmap
  3. room "Design technical architecture" — stack + scalability
  4. room "Illustrate the UX" — wireframes + journey
  5. room "Synthesise the comprehensive plan" — pull it all together
```

The block forces the agent to **commit to a decision in writing** before acting. It makes every container's reasoning auditable in the transcript and prevents silent drift into "I'll just do it."

---

## 4. What we added: external-only leaf agents

Stock Paperclip's most common adapter is `claude_local` — Claude Code spawned as a subprocess of the Paperclip server. The agent is essentially a worker thread of the server. Convenient for a single machine, but bound to it.

For Zootropolis, leaf agents are **external by default**. They run wherever you want — a remote VM, a long-lived cloud worker, your laptop while the server runs in production — and connect to Paperclip over a **WebSocket**.

### The contract

A leaf agent is just any process that:

1. Opens a WebSocket connection to a configured endpoint (e.g. `ws://your-host:7100/`).
2. Receives wake events from the Paperclip server: "you've been assigned ZOO-17, here's the wake payload."
3. Performs the work (reads files, writes code, fetches the web, whatever).
4. Emits the standard Paperclip close marker on stdout when done.

The full WebSocket protocol is documented in `docs/agent-runtime-contract.md`. The bundled implementation we use most is the `aliaskit_vm` adapter (Phase L+) which handles identity provisioning + a small worker harness on top of Claude Code.

### Why external-only

- **Geography.** A leaf can run on a cheap VPS in another region while the orchestration sits on your laptop. Or vice versa — Paperclip in prod, leaves on local dev machines for fast iteration.
- **Isolation.** Each leaf gets its own fresh VM. No accidental file-system collisions between agents working on different issues. No "agent X corrupted agent Y's git state" failure modes.
- **Identity per agent.** Each leaf is provisioned a real **AliasKit identity** — email inbox, phone number, virtual payment card. The agent can sign up for services, receive verification codes, and complete purchases as its own person, not as you. Persistent across heartbeats.
- **Substitutability.** The WebSocket contract is the only API. Any tool that speaks it can be a leaf — Claude Code today, Codex tomorrow, a custom Pi agent, a human-in-the-loop console. The Paperclip server doesn't care.
- **Trust boundary.** The leaf only ever sees its own wake payload + the heartbeat-context it explicitly fetches. It can't read other agents' state. The server is the trust root.

This is the change that makes Zootropolis feel less like "a Claude Code wrapper" and more like "a distributed multi-agent operating system" — leaves are independent processes that happen to coordinate through the Paperclip control plane.

The runtime config for each leaf includes its `runtimeEndpoint` (the WebSocket URL) and an `AliasKit` identity bundle (email, phone, card). The campus 3D view shows reachability state for each leaf with a red ring on the animal if its daemon isn't responding.

---

## 5. The unifying idea: issues as messages

All three additions above only make sense if you reframe what an "issue" *is*.

In a normal ticketing system, an issue is a record on a board for human PMs to triage. In Zootropolis, **an issue is a message between two agents**. Specifically, an issue from agent A to agent B says: "I (A) am asking you (B) to do this thing. Reply with a close marker when you're done." Comments on the issue are the conversation. Sub-issues are B's onward delegations. The close marker is the structured reply.

Once you accept that frame:

- The **delegation rules** (parent↔child only, layer-adjacency only) just become "messaging rules" — you can only message people you directly manage or report to. That maps to how real orgs work.
- The **close marker** with mandatory `artifact` field is just "the reply must contain content, not be empty."
- The **strict-container rule** is just "managers don't reply to their own messages with content; they delegate the message and forward the synthesis."
- The **wake payload** is the inbound notification that "you have a message to act on."
- The **3D campus** becomes the "where do messages flow" visualisation — animated travellers move along the delegation paths, building windows light up when their inhabitants are reading messages.

So Zootropolis is best described as: **a distributed organisation simulator built on top of Paperclip, where every agent is a real autonomous worker that talks to its manager and reports through structured issues, and the whole thing is rendered as a city you can walk through.**

---

## 6. Where things live (cheat sheet)

| Concept | Location |
|---|---|
| Forked Paperclip server | `paperclip-master/server/` |
| Forked Paperclip UI | `paperclip-master/ui/` |
| Shared types & validators | `paperclip-master/packages/shared/` |
| Embedded Postgres + per-instance state | `.paperclip/instances/default/` |
| Zootropolis layer types + helpers | `paperclip-master/packages/shared/src/zootropolis.ts` |
| 3D campus | `paperclip-master/ui/src/pages/campus/` |
| Strict-delegation server checks | `paperclip-master/server/src/services/issues.ts` (`checkDirectReportDelegation`, `assertZootropolisDelegation`) |
| Container close-marker gate | `paperclip-master/server/src/services/heartbeat.ts` (Phase R/S close-gate logic) |
| Container `AGENTS.md` template | `paperclip-master/server/src/onboarding-assets/zootropolis-container/AGENTS.md` |
| External-leaf WebSocket contract | `docs/agent-runtime-contract.md` |
| AliasKit integration + identity | `docs/external-daemon-quickstart.md` + `aliaskit_vm` adapter |
| Zootropolis-specific runtime knobs | `zootropolis.config.json` (currently: `delegation.strict`, `aliaskit.useReal`) |
| Dev wrapper | `scripts/dev.sh` (boots server :3100 + UI :5173, points `PAPERCLIP_HOME` at the in-repo `.paperclip/`) |

---

## 7. Mental model in one paragraph

> **Zootropolis is a forked Paperclip where every agent is a tiny LLM worker running anywhere on the internet, where managers can't do work — they can only split it into smaller pieces and pass it down — and where the resulting org chart is rendered as a 3D city you can fly through. The whole thing runs on the premise that "an issue" is really "a message between two agents," and once you accept that, every other rule becomes obvious.**
