import type { CreateConfigValues } from "@paperclipai/adapter-utils";

/**
 * Build the initial adapterConfig for a freshly hired aliaskit_vm agent.
 * The runtimeEndpoint and runtimePort are intentionally NOT set here —
 * the Zootropolis port broker fills those in on hire (Phase A5). This
 * builder just returns sane timeouts so the agent is valid before the
 * broker runs.
 */
export function buildAliaskitVmConfig(_v: CreateConfigValues): Record<string, unknown> {
  return {
    timeoutMs: 10 * 60 * 1000,
  };
}
