import type { TranscriptEntry } from "@paperclipai/adapter-utils";

/**
 * The aliaskit_vm adapter forwards raw stdout/stderr from the daemon, which
 * forwards raw stdout/stderr from `claude` (or whatever the leaf agent is
 * running) inside the agent's folder. We don't try to parse JSON line-by-line
 * here — Claude has its own parser; for now we just bucket everything into
 * stdout/stderr entries and let downstream UI render them as terminal output.
 */
export function parseAliaskitVmStdoutLine(line: string, ts: string): TranscriptEntry[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  return [{ kind: "stdout", ts, text: line }];
}
