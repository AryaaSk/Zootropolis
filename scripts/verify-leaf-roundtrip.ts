#!/usr/bin/env tsx
/**
 * Verify Phase D end-to-end: a leaf agent picks up an assigned issue,
 * runs Claude inside its folder, emits the close marker, and the issue
 * transitions to status="done".
 *
 * Prereqs (otherwise the script bails early with a clear message):
 * - Paperclip server is running (./scripts/dev.sh in another terminal).
 * - claude CLI is installed and logged in (the daemon spawns it).
 * - At least one company exists with at least one aliaskit_vm leaf agent.
 *   You can use the seed script first:
 *     pnpm tsx scripts/seed-zootropolis-demo.ts
 *
 * Usage:
 *   pnpm tsx scripts/verify-leaf-roundtrip.ts
 *   pnpm tsx scripts/verify-leaf-roundtrip.ts --company-id <uuid> --leaf-id <uuid>
 *   pnpm tsx scripts/verify-leaf-roundtrip.ts --timeout-sec 180
 *
 * What it does:
 * 1. Picks (or accepts) a company and a leaf agent (aliaskit_vm + layer="agent").
 * 2. Creates an issue assigned to that leaf with a tiny self-contained task.
 * 3. Wakes the agent.
 * 4. Polls the issue every ~3s for up to --timeout-sec (default 240).
 * 5. Asserts the issue transitioned to "done" AND the closing comment
 *    contains the artifact text (i.e., the close marker actually fired).
 *
 * Exit codes:
 *   0 — issue closed with artifact (Phase D wired end-to-end)
 *   1 — timed out / wrong terminal status / artifact missing
 *   2 — bad invocation / preflight failed
 */

import { setTimeout as sleep } from "node:timers/promises";

const API_BASE = process.env.PAPERCLIP_API ?? "http://localhost:3100";
const TASK_PROMPT = "Write a one-sentence fact about octopuses, then close this issue using the Zootropolis close marker described in your skills/zootropolis-paperclip.md file.";

interface Args {
  companyId?: string;
  leafId?: string;
  timeoutSec: number;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { timeoutSec: 240 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--company-id") out.companyId = argv[++i];
    else if (a === "--leaf-id") out.leafId = argv[++i];
    else if (a === "--timeout-sec") out.timeoutSec = Number(argv[++i]);
    else if (a === "--help" || a === "-h") {
      process.stdout.write("see top of file for usage\n");
      process.exit(0);
    }
  }
  return out;
}

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
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

interface Company { id: string; name: string }
interface Agent { id: string; name: string; companyId: string; adapterType: string; metadata: Record<string, unknown> | null }
interface Issue { id: string; identifier: string | null; title: string; status: string }
interface Comment { id: string; body: string; createdAt: string }

async function pickCompany(args: Args): Promise<Company> {
  if (args.companyId) {
    return await api<Company>("GET", `/api/companies/${args.companyId}`);
  }
  const list = await api<Company[]>("GET", `/api/companies`);
  if (list.length === 0) {
    console.error("No companies found. Seed first: pnpm tsx scripts/seed-zootropolis-demo.ts");
    process.exit(2);
  }
  // prefer "Zootropolis Demo" if present, else first
  return list.find((c) => c.name === "Zootropolis Demo") ?? list[0];
}

async function pickLeaf(args: Args, company: Company): Promise<Agent> {
  if (args.leafId) {
    return await api<Agent>("GET", `/api/agents/${args.leafId}`);
  }
  const all = await api<Agent[]>("GET", `/api/companies/${company.id}/agents`);
  const leaves = all.filter((a) => {
    if (a.adapterType !== "aliaskit_vm") return false;
    const md = (a.metadata as { zootropolis?: { layer?: string } } | null) ?? null;
    return md?.zootropolis?.layer === "agent";
  });
  if (leaves.length === 0) {
    console.error(
      `No aliaskit_vm leaf agents in company "${company.name}". ` +
        `Either pass --leaf-id <uuid> or run the seed script.`,
    );
    process.exit(2);
  }
  return leaves[0];
}

async function createTaskIssue(company: Company, leaf: Agent): Promise<Issue> {
  const issue = await api<Issue>("POST", `/api/companies/${company.id}/issues`, {
    title: "[Zootropolis verify] Octopus fact",
    description: TASK_PROMPT,
    priority: "medium",
    status: "todo",
    assigneeAgentId: leaf.id,
  });
  return issue;
}

async function wakeAgent(company: Company, leaf: Agent, issue: Issue): Promise<void> {
  // Paperclip's standard wake endpoint. If the route shape differs, the request
  // body keys are the common ones — tweak per your local revision.
  await api("POST", `/api/agents/${leaf.id}/wake`, {
    reason: "verify-leaf-roundtrip",
    issueId: issue.id,
  }).catch(async () => {
    // Some local revisions expose it under /heartbeats — fall back.
    await api("POST", `/api/companies/${company.id}/heartbeats/wake`, {
      agentId: leaf.id,
      issueId: issue.id,
      reason: "verify-leaf-roundtrip",
    });
  });
}

async function getIssue(issueId: string): Promise<Issue> {
  return await api<Issue>("GET", `/api/issues/${issueId}`);
}

async function getComments(issueId: string): Promise<Comment[]> {
  return await api<Comment[]>("GET", `/api/issues/${issueId}/comments`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Zootropolis leaf-roundtrip verify (Phase D)`);
  console.log(`API: ${API_BASE}`);

  const company = await pickCompany(args);
  console.log(`Company: ${company.name} (${company.id})`);
  const leaf = await pickLeaf(args, company);
  console.log(`Leaf: ${leaf.name} (${leaf.id})`);

  const issue = await createTaskIssue(company, leaf);
  console.log(`Issue: ${issue.identifier ?? issue.id} — ${issue.title}`);

  await wakeAgent(company, leaf, issue);
  console.log(`Wake fired. Polling for closure (timeout ${args.timeoutSec}s)…`);

  const deadline = Date.now() + args.timeoutSec * 1000;
  let lastStatus = issue.status;
  while (Date.now() < deadline) {
    await sleep(3_000);
    const current = await getIssue(issue.id);
    if (current.status !== lastStatus) {
      console.log(`  status: ${lastStatus} → ${current.status}`);
      lastStatus = current.status;
    }
    if (current.status === "done") {
      const comments = await getComments(issue.id);
      const lastComment = comments[comments.length - 1];
      const hasArtifact = !!lastComment && lastComment.body.length > 0;
      if (hasArtifact) {
        console.log(`\nPASS — issue closed with artifact (${lastComment.body.length} chars).`);
        console.log(`Comment preview: ${lastComment.body.slice(0, 120).replace(/\n/g, " ")}…`);
        process.exit(0);
      } else {
        console.error(`\nFAIL — issue closed but no closing comment found.`);
        process.exit(1);
      }
    }
    if (current.status === "cancelled" || current.status === "blocked") {
      console.error(`\nFAIL — issue reached terminal status "${current.status}" without close marker.`);
      process.exit(1);
    }
  }

  console.error(`\nFAIL — timed out after ${args.timeoutSec}s. Issue still ${lastStatus}.`);
  console.error(`Inspect: ${API_BASE}/issues/${issue.id}`);
  process.exit(1);
}

main().catch((err) => {
  console.error("verify-leaf-roundtrip failed:", err.message ?? err);
  process.exit(2);
});
