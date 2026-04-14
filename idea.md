# Zootropolis

Spatial orchestration for AI agent companies. Build your company the way you'd build a city.

## The one-liner

An open-source fork of Paperclip that renders your AI agent org chart as a navigable 3D campus. Each agent is a little animal or person. Agents live in rooms. Rooms sit on floors. Floors stack into buildings. Buildings cluster into a campus. Every agent has a real identity (email, phone, card) so it can actually do work on the internet.

The hierarchy has five possible layers: **agent → room → floor → building → campus**. But you don't start with all of them. You start with nothing and the structure grows up from the bottom as work demands it.

## The problem

Every AI agent platform looks the same right now. Paperclip, Lindy, Cua's dashboard, Scrapybara's console, AutoGen Studio, CrewAI Studio. All of them are flat lists of agents, tasks, and logs. The same UI paradigm Linear and Jira use for human teams.

This breaks at two different scales.

At the small end, it's boring. Founders want to watch their AI company come alive. A list of rows does not feel alive.

At the large end, it falls apart completely. When you have 50 agents spanning 8 departments and 3 projects, a flat issue board is cognitive death. Humans do not reason well about flat lists of 50. Humans reason well about floors of a building, streets of a neighborhood, districts of a city. Three million years of evolution trained us to navigate space, not spreadsheets.

Nobody is using spatial reasoning as a primitive for agent orchestration. That is the gap.

## The concept

You start with an empty plot of land. Nothing else.

You hire one agent. A single animal appears on the grass, standing there, ready to work. No room, no floor, no building — just an agent with an identity and a task.

You hire a second agent. Now there are two animals that need somewhere to coordinate. A **room** materializes around them. The room gets a room-owner who decides how the two leaves split work.

You keep adding. The room fills up, so a second room spawns. Two rooms next to each other need somewhere to stack — a **floor** slab materializes underneath them, with a floor-owner on top who coordinates across rooms.

Add more floors and the floors stack into a **building**, with a building-owner managing the floors. Add more buildings and they arrange themselves into a **campus**, with a campus-owner managing buildings.

The structure is emergent. Layers only exist when they're earning their keep. A two-person project never grows past a single room. A fifty-agent project naturally settles into a building. A portfolio of projects becomes a campus. Same primitive, different scale.

Every new hire gets its own email, phone, virtual card, and its own VM. It is an actual autonomous worker that can log in, receive codes, make purchases, do real work on the internet.

You can zoom into any agent and watch it work. The VM stream renders inside the room. The agent's screen becomes visible. You see it think, browse, type, verify.

The corporate hierarchy and the spatial hierarchy are the same object, rendered differently. An org chart is abstract and forgettable. A campus is concrete and memorable.

## The architectural principle

Spatial containers enforce information hiding. This is the part that makes it more than a reskin.

**Every container has exactly one owner agent, spawned the moment the container is needed.** Go from one agent to two? A room appears and a room-owner is hired. Go from one room to two? A floor appears and a floor-owner is hired. And so on up. Owners are never pre-allocated; they come into existence because the structure now requires one.

The leaf animals/people inside rooms are the only "doing" agents — everyone above them is a manager whose job is to delegate.

**Rule: you only ever task the owner of a container. You never reach inside it.** If you hand a task to a building-owner, you do not know (and do not care) how it gets decomposed across floors, or how each floor decomposes across rooms, or which animal ultimately executes it. The building returns a result. That is the entire contract.

This applies recursively and symmetrically:
- Campus-owner tasks building-owners. It cannot see inside buildings.
- Building-owner tasks its floor-owners. It cannot see inside floors.
- Floor-owner tasks its room-owners. It cannot see inside rooms.
- Room-owner tasks its leaf agents. That is the only layer where individual work actually happens.

Upward reporting is similarly bounded — a floor-owner reports a summary to its building-owner, not a raw dump of every animal's keystrokes.

This is Parnas 1972, applied to AI delegation. It is how human organizations actually scale without collapsing into a flat mess, and it is the pattern every current agent orchestrator (Paperclip, CrewAI, AutoGen) lacks. Today's orchestrators let a top-level agent see every subordinate task if it wants to, which turns every large org into a micromanagement nightmare.

Zootropolis forces clean delegation by making layer isolation a property of the spatial container, not a permission the user has to remember to set. The UI affordance matches the architecture: you can only click on what's visible at your current zoom level, and the zoom level *is* the permission boundary.

## How it works under the hood

Three open-source pieces, bolted together.

1. **Paperclip** is the control plane. 31k GitHub stars. Handles the org chart, heartbeats, task checkout, budget enforcement, governance. Battle-tested. Upstream project.

2. **Cua** (or Coasty as a fallback) runs the VMs. 11.1k stars. Supports macOS, Linux, Windows desktop containers. Each leaf-level worker gets its own VM. Cold start is fast enough that spawning a worker feels live.

3. **AliasKit** gives each leaf agent a real identity. Real email inbox, real phone number, real virtual card, TOTP secrets. Paperclip's existing adapter model treats each agent as a configurable unit; Zootropolis adds an `aliaskit-vm` adapter that, when a leaf agent is hired into a room, provisions a full identity and injects it into the agent's VM. The agent is a citizen of the internet, not a script that blocks at "verify your email."

The 3D campus layer is React Three Fiber on top of Paperclip's existing React 19 + Vite 6 + Tailwind 4 UI. Instanced meshes for the shells. Heartbeat pulses animate when an agent picks up a task. Status lights show active, idle, running, error. Zoom levels map 1:1 to the hierarchy: campus → building → floor → room → agent. Click to descend one layer; you can only interact with what's at your current layer.

## Why this is differentiated

Everyone in the agent market is racing on two axes. Orchestration (Paperclip, Lindy, CrewAI) and computer-use (Cua, Coasty, Scrapybara, Manus). The category leaders on both axes are acknowledging their layer will commoditize. Cua literally says it on their About page.

The visualization layer on top is nearly empty. Gather.town tried it for humans and got acquired at $50M. Nobody has built it for agents.

Zootropolis takes three commoditizing layers (orchestration, VMs, identity) and composes them into something that is not commoditizing. The spatial metaphor is the moat because spatial metaphors do not commoditize. They emerge as cultural references and the first mover anchors the category.

The thing that compounds over time is the campus growing. The thing that monetizes is the identity layer underneath.

## What AliasKit gets out of it

Zootropolis is the forcing function that makes AliasKit obviously necessary.

A flat dashboard can hide the identity question. You might think an agent is doing real work when it is actually stuck at "please verify your email" and hand-waving. A campus cannot hide it. If the animal in the room cannot open doors to the outside world, the room stays empty. The spatial metaphor makes the absence of identity visible.

Anyone who runs a Zootropolis campus will need AliasKit. The two products pull each other forward.

The official line: "Paperclip is the city planner. Cua is the infrastructure. AliasKit is what turns each building's residents into actual citizens."

## Build plan

The story is **growth from the bottom up** — the campus is not prefab, it constructs itself one layer at a time as the work demands.

Core loop:
1. Empty lot. A goal is entered.
2. One animal appears on the grass with an AliasKit identity and starts working.
3. The task needs help — a second animal is hired. A **room** materializes around them; a room-owner spawns to coordinate.
4. Work expands — more animals, then a second room. A **floor** slab appears underneath with a floor-owner.
5. Floors stack into a **building**, with a building-owner on top.
6. Buildings arrange themselves on the lot into a **campus**, with a campus-owner managing across projects.
7. Every leaf animal runs its own VM and does real work on the internet. Results bubble back up through the owners.

Stack:
- Fork `paperclipai/paperclip` as the base.
- Reuse Paperclip's existing `agents.reportsTo` tree as the source of truth; derive the 5 spatial layers from tree depth. No new hierarchy tables required for v1 — layer assignments live in `agent.metadata.zootropolis` (JSONB).
- Write `packages/adapters/aliaskit-vm` following the existing `openclaw-gateway` pattern (leaf agents only — manager agents don't need real identities). Hook `onHireApproved` to provision email/phone/card via AliasKit and store handles in `agent.metadata.aliaskit_*`.
- Add a `/campus` route to the Paperclip UI, rendered with React Three Fiber + drei on top of the existing React 19 + Vite 6 + Tailwind 4 UI. Reuse the `orgForCompany()` service to pull the tree; compute spatial coords client-side.
- Each agent is a little animal/person sprite. Each room is a walled area. Each floor is a horizontal slab. Each building is a stack of floors. The campus is a grid of buildings.
- Aesthetic target: Minecraft, not Pixar. Instanced meshes, flat lighting, one sky gradient.
- Delegation contract is enforced at the API layer: tasks can only be addressed to a container owner. The UI zoom level *is* the permission boundary — you can't click past what's visible.

## Risks worth naming

- Scope bomb. The temptation to build Townscaper-grade visuals is how this dies. Aesthetic target must be enforced at the task level: if the tile is a box with a status light and a label, that is enough.
- Product confusion with AliasKit. Zootropolis is a sister project, not a rebrand. The AliasKit pitch does not change.
- Paperclip compatibility drift. Paperclip ships fast; merging from upstream might hurt later. Fork with intent to upstream the adapter (`aliaskit-vm`) and the optional `/campus` route so the fork stays lean.
- Cua reliability. Keep a Coasty fallback adapter behind the same VM interface.

## Naming note

Zootropolis is the codename. Works because it implies a campus and a zoo of different agent types (the animal leaf agents) living together. If the product catches on, the real name should be shorter and infrastructure-sounding. "Metro," "Zoning," "Hub," "Atlas," "Quarter."
