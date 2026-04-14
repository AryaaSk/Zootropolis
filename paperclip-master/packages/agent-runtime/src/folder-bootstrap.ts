import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const CLAUDE_MD_TEMPLATE = `# Zootropolis Agent — {agentId}

You are a leaf worker in a Zootropolis agent campus. Your runtime is a folder
on disk that is your entire world: your Claude session cache, your workspace,
your durable memory.md notebook, your AliasKit identity (identity.json), and
any installed Claude skills under skills/.

## Delegation rules (non-negotiable)

You report to exactly ONE manager: the agent named in your reportsTo field
(see the wake payload). You may NOT:
- Create issues for anyone other than your manager.
- Accept work from anyone other than your manager.

If you finish a task, write your output into the closing comment of the issue
you were assigned. Do not write deliverables to loose files in workspace/ —
the issue's closing comment is the canonical artifact (see Zootropolis
design.md §4: "Issues are the artifact store"). You may use workspace/ for
intermediate scratch and link to specific paths/SHAs in your closing comment
when content is too large to inline.

## Your durable memory

memory.md is yours to read and edit between heartbeats. Use it for long-term
notes ("I've been working on X"; "I learned Y"). Claude's session cache
(.claude/) holds short-term conversation; memory.md holds long-term context.

## When you wake

The wake payload (delivered on stdin as JSON) tells you:
- runId: this heartbeat's id
- The current issue assigned to you (title, description, status, prior comments)

Read it, do the work, write the result, exit.
`;

const MEMORY_MD_TEMPLATE = `# {agentId} — durable memory

This file persists across heartbeats. Use it for long-term notes about your
work, learnings, and ongoing context. Claude's session cache (.claude/) is
short-term conversation; this is your long-term notebook.
`;

const DEFAULT_IDENTITY: Record<string, unknown> = {
  email: null,
  phone: null,
  card: null,
  totpSecret: null,
  note: "Identity not yet provisioned. Phase A6 fills this in via aliaskit-vm.onHireApproved.",
};

/**
 * Bootstrap a fresh agent folder on first execute. Idempotent: if the folder
 * already has a .claude/ directory we assume it's been bootstrapped and skip.
 *
 * Layout (per design.md §7c):
 *   <folder>/
 *     .claude/          (left empty; Claude CLI populates)
 *     workspace/
 *     skills/
 *     CLAUDE.md         (per-agent role + delegation rules)
 *     memory.md         (durable notebook)
 *     identity.json     (AliasKit creds; placeholder until A6)
 */
export async function ensureFolderBootstrapped(folder: string, agentId: string): Promise<void> {
  await mkdir(folder, { recursive: true });
  const claudeDir = join(folder, ".claude");
  if (existsSync(claudeDir)) return; // already bootstrapped

  await Promise.all([
    mkdir(claudeDir, { recursive: true }),
    mkdir(join(folder, "workspace"), { recursive: true }),
    mkdir(join(folder, "skills"), { recursive: true }),
  ]);

  const claudeMd = CLAUDE_MD_TEMPLATE.replace("{agentId}", agentId);
  const memoryMd = MEMORY_MD_TEMPLATE.replace("{agentId}", agentId);
  await Promise.all([
    writeFile(join(folder, "CLAUDE.md"), claudeMd, { flag: "wx" }).catch(() => {}),
    writeFile(join(folder, "memory.md"), memoryMd, { flag: "wx" }).catch(() => {}),
    writeFile(join(folder, "identity.json"), JSON.stringify(DEFAULT_IDENTITY, null, 2) + "\n", {
      flag: "wx",
    }).catch(() => {}),
  ]);
}
