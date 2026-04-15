import fs from "node:fs/promises";
import { readZootropolisLayer } from "@paperclipai/shared";

const DEFAULT_AGENT_BUNDLE_FILES = {
  default: ["AGENTS.md"],
  ceo: ["AGENTS.md", "HEARTBEAT.md", "SOUL.md", "TOOLS.md"],
  // Phase Y — Zootropolis container agents (layer ∈ room/floor/building/
  // campus) get a much stricter AGENTS.md that overrides the generic
  // Paperclip "do the work" behaviour with the four-action delegate /
  // synthesise contract + the mandatory decision block.
  "zootropolis-container": ["AGENTS.md"],
} as const;

type DefaultAgentBundleRole = keyof typeof DEFAULT_AGENT_BUNDLE_FILES;

function resolveDefaultAgentBundleUrl(role: DefaultAgentBundleRole, fileName: string) {
  return new URL(`../onboarding-assets/${role}/${fileName}`, import.meta.url);
}

export async function loadDefaultAgentInstructionsBundle(role: DefaultAgentBundleRole): Promise<Record<string, string>> {
  const fileNames = DEFAULT_AGENT_BUNDLE_FILES[role];
  const entries = await Promise.all(
    fileNames.map(async (fileName) => {
      const content = await fs.readFile(resolveDefaultAgentBundleUrl(role, fileName), "utf8");
      return [fileName, content] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export function resolveDefaultAgentInstructionsBundleRole(role: string): DefaultAgentBundleRole {
  return role === "ceo" ? "ceo" : "default";
}

/**
 * Phase Y — Zootropolis-aware bundle resolver.
 *
 * Looks at the agent's `metadata.zootropolis.layer` first: if it's a
 * container layer (room/floor/building/campus), returns the Zootropolis
 * container bundle (the strict decompose+delegate AGENTS.md). Otherwise
 * falls back to the standard role-based resolver.
 *
 * Used at hire-time and by the backfill script so container agents
 * always receive container instructions, regardless of their `role`.
 */
export function resolveAgentInstructionsBundleRole(agent: {
  role: string;
  metadata: unknown;
}): DefaultAgentBundleRole {
  const layer = readZootropolisLayer(agent.metadata);
  if (layer === "room" || layer === "floor" || layer === "building" || layer === "campus") {
    return "zootropolis-container";
  }
  return resolveDefaultAgentInstructionsBundleRole(agent.role);
}

/**
 * Marker string that exists in every Zootropolis container AGENTS.md.
 * Used by the materializer to detect when an agent's instructions are
 * stale and should be regenerated from the latest template (e.g. after
 * we ship a new revision of the container override).
 */
export const ZOOTROPOLIS_CONTAINER_INSTRUCTIONS_MARKER =
  "Zootropolis container agent";
