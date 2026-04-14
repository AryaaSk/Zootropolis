#!/usr/bin/env tsx
/**
 * Seed a sample Zootropolis hierarchy into a running Paperclip server.
 *
 * Builds a 5-layer tree:
 *
 *   campus(HQ)
 *     └── building(Product)
 *           ├── floor(Engineering)
 *           │     ├── room(Backend)
 *           │     │     ├── leaf(backend-worker-1)
 *           │     │     └── leaf(backend-worker-2)
 *           │     └── room(Frontend)
 *           │           ├── leaf(frontend-worker-1)
 *           │           └── leaf(frontend-worker-2)
 *           └── floor(Research)
 *                 └── room(Notes)
 *                       ├── leaf(researcher-1)
 *                       └── leaf(researcher-2)
 *
 * Container agents use claude_local (cheap, text-only, just delegators).
 * Leaves use aliaskit_vm (folder-as-VM, real internet work). Everyone gets
 * a metadata.zootropolis.layer tag so /campus knows what shape to draw.
 *
 * Usage:
 *   PAPERCLIP_HOME=$PWD/.paperclip ./scripts/dev.sh           # in one terminal
 *   pnpm tsx scripts/seed-zootropolis-demo.ts [--reuse]       # in another
 *
 *   --reuse   skip creation if a "Zootropolis Demo" company already exists
 */

import { setTimeout as sleep } from "node:timers/promises";

const API_BASE = process.env.PAPERCLIP_API ?? "http://localhost:3100";
const COMPANY_NAME = "Zootropolis Demo";

interface AgentSpec {
  key: string;
  name: string;
  layer: "campus" | "building" | "floor" | "room" | "agent";
  parentKey?: string;
  role?: string;
  title?: string;
}

const TREE: AgentSpec[] = [
  { key: "campus_hq",       name: "HQ",                  layer: "campus",   role: "ceo", title: "Campus" },
  { key: "bld_product",     name: "Product",             layer: "building", parentKey: "campus_hq",       role: "manager",  title: "Building Owner" },
  { key: "fl_engineering",  name: "Engineering",         layer: "floor",    parentKey: "bld_product",     role: "manager",  title: "Floor Owner" },
  { key: "fl_research",     name: "Research",            layer: "floor",    parentKey: "bld_product",     role: "manager",  title: "Floor Owner" },
  { key: "rm_backend",      name: "Backend",             layer: "room",     parentKey: "fl_engineering",  role: "manager",  title: "Room Owner" },
  { key: "rm_frontend",     name: "Frontend",            layer: "room",     parentKey: "fl_engineering",  role: "manager",  title: "Room Owner" },
  { key: "rm_notes",        name: "Notes",               layer: "room",     parentKey: "fl_research",     role: "manager",  title: "Room Owner" },
  { key: "ag_be1",          name: "backend-worker-1",    layer: "agent",    parentKey: "rm_backend",      role: "engineer", title: "Backend Engineer" },
  { key: "ag_be2",          name: "backend-worker-2",    layer: "agent",    parentKey: "rm_backend",      role: "engineer", title: "Backend Engineer" },
  { key: "ag_fe1",          name: "frontend-worker-1",   layer: "agent",    parentKey: "rm_frontend",     role: "engineer", title: "Frontend Engineer" },
  { key: "ag_fe2",          name: "frontend-worker-2",   layer: "agent",    parentKey: "rm_frontend",     role: "engineer", title: "Frontend Engineer" },
  { key: "ag_rs1",          name: "researcher-1",        layer: "agent",    parentKey: "rm_notes",        role: "researcher", title: "Researcher" },
  { key: "ag_rs2",          name: "researcher-2",        layer: "agent",    parentKey: "rm_notes",        role: "researcher", title: "Researcher" },
];

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${method} ${path} → ${res.status} ${res.statusText}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function findOrCreateCompany(reuse: boolean): Promise<string> {
  const existing = await api<Array<{ id: string; name: string }>>("GET", "/api/companies").catch(() => []);
  const found = existing.find((c) => c.name === COMPANY_NAME);
  if (found && reuse) {
    console.log(`Reusing existing company "${COMPANY_NAME}" (${found.id})`);
    return found.id;
  }
  if (found && !reuse) {
    throw new Error(`Company "${COMPANY_NAME}" already exists. Pass --reuse to keep it, or delete it first.`);
  }
  const created = await api<{ id: string }>("POST", "/api/companies", {
    name: COMPANY_NAME,
    description: "Demo Zootropolis hierarchy seeded by scripts/seed-zootropolis-demo.ts",
    status: "active",
    budgetMonthlyCents: 50000,
  });
  console.log(`Created company "${COMPANY_NAME}" (${created.id})`);
  return created.id;
}

interface AgentRow { id: string; name: string }

async function hireAgent(
  companyId: string,
  spec: AgentSpec,
  parentId: string | null,
): Promise<AgentRow> {
  const adapterType = spec.layer === "agent" ? "aliaskit_vm" : "claude_local";
  // claude_local needs at least an empty config; aliaskit_vm config is filled by the broker on hire (A5).
  const adapterConfig = {};
  const body = {
    name: spec.name,
    role: spec.role ?? "manager",
    title: spec.title ?? null,
    reportsTo: parentId,
    adapterType,
    adapterConfig,
    runtimeConfig: {},
    budgetMonthlyCents: 5000,
    metadata: {
      zootropolis: {
        layer: spec.layer,
        displayName: spec.name,
      },
    },
  };
  const created = await api<AgentRow>("POST", `/api/companies/${companyId}/agents`, body);
  return created;
}

async function main() {
  const reuse = process.argv.includes("--reuse");

  // wait briefly for server to be reachable
  for (let i = 0; i < 20; i++) {
    try {
      await api("GET", "/api/health");
      break;
    } catch {
      if (i === 0) console.log(`Waiting for Paperclip at ${API_BASE}…`);
      await sleep(500);
    }
  }

  const companyId = await findOrCreateCompany(reuse);

  const created = new Map<string, AgentRow>();
  for (const spec of TREE) {
    const parentId = spec.parentKey ? created.get(spec.parentKey)?.id ?? null : null;
    if (spec.parentKey && !parentId) {
      throw new Error(`Parent ${spec.parentKey} for ${spec.key} not yet created`);
    }
    const agent = await hireAgent(companyId, spec, parentId);
    created.set(spec.key, agent);
    console.log(`  hired ${spec.layer.padEnd(8)} ${spec.name}  →  ${agent.id}`);
  }

  console.log("\nDone. Open the OrgChart page to see the layer tags, or /campus to see it spatially.");
  console.log(`Company id: ${companyId}`);
}

main().catch((err) => {
  console.error("Seed failed:", err.message ?? err);
  process.exit(1);
});
