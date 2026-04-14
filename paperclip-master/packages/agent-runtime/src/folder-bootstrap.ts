import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CLAUDE_MD_TEMPLATE = `# Zootropolis Agent — {agentId}

You are a leaf worker in a Zootropolis agent campus. Your runtime is a folder
on disk that is your entire world: your Claude session cache, your workspace,
your durable memory.md notebook, your AliasKit identity (identity.json), and
any installed Claude skills under skills/.

## Read this skill first

\`skills/zootropolis-paperclip.md\` is the protocol manual: the wake-payload
shape, how you close issues (the JSON close marker on your last stdout line),
how the delegation rule works, and what each file in your folder is for.
Re-read it at the start of each task.

## Delegation rules (non-negotiable)

You report to exactly ONE manager: the agent named in your reportsTo field
(see the wake payload). You may NOT:
- Create issues for anyone other than your manager.
- Accept work from anyone other than your manager.

## How you complete a task

Emit a JSON object as your LAST line of stdout:

  {"zootropolis":{"action":"close","status":"done","summary":"<one line>","artifact":"<full markdown>"}}

The artifact becomes the closing comment on your assigned issue and the
issue transitions to status="done". Without this marker, your stdout-tail
becomes a comment but the issue stays open. Full spec is in the skill file.

Do not write deliverables to loose files in workspace/ — the issue's
closing comment is the canonical artifact (Zootropolis design.md §4:
"Issues are the artifact store"). workspace/ is for intermediate scratch.

## Your durable memory

memory.md is yours to read and edit between heartbeats. Use it for long-term
notes ("I've been working on X"; "I learned Y"). Claude's session cache
(.claude/) holds short-term conversation; memory.md holds long-term context.

## When you wake

The wake payload (delivered on stdin as JSON) tells you:
- runId: this heartbeat's id
- The current issue assigned to you (title, status, priority, prior comments)

Read it, do the work, emit the close marker, exit.
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
    copyZootropolisPaperclipSkill(folder).catch(() => {}),
  ]);
}

/**
 * Copy the bundled Zootropolis Paperclip skill into the agent's
 * skills/ directory. Defines the close-marker convention (matched
 * server-side by readZootropolisCloseMarker in @paperclipai/shared)
 * and the delegation contract.
 *
 * Resolves the source path relative to this module so it works in both
 * dev (tsx, source layout) and prod (compiled dist/ layout). When run
 * from dist/, the skill source lives one level up.
 */
async function copyZootropolisPaperclipSkill(folder: string): Promise<void> {
  const candidates = [
    // dev: __dirname = packages/agent-runtime/src/, skill is in src/skills/
    join(__dirname, "skills", "zootropolis-paperclip.md"),
    // prod: __dirname = packages/agent-runtime/dist/, skill copied alongside
    join(__dirname, "..", "src", "skills", "zootropolis-paperclip.md"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const contents = await readFile(candidate, "utf8");
      await writeFile(join(folder, "skills", "zootropolis-paperclip.md"), contents, {
        flag: "wx",
      });
      return;
    }
  }
}
