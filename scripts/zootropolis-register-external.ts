#!/usr/bin/env tsx
/**
 * Patch an existing aliaskit_vm agent's adapterConfig to point at an
 * external daemon (one running on a real VM, not in-process). Useful when
 * your provisioning controller can only get the daemon's URL after the VM
 * has booted.
 *
 * Usage:
 *   pnpm tsx scripts/zootropolis-register-external.ts \
 *     --agent-id <uuid> \
 *     --endpoint ws://10.0.0.5:7100/
 *
 * Or via npx (no install):
 *   npx tsx scripts/zootropolis-register-external.ts \
 *     --agent-id <uuid> --endpoint ws://10.0.0.5:7100/
 *
 * Prereqs:
 * - Paperclip server is running (defaults to http://localhost:3100; override
 *   with PAPERCLIP_API).
 * - Server is in `local_trusted` mode (the default for ./scripts/dev.sh) so
 *   no auth header is needed. For authenticated mode, set PAPERCLIP_TOKEN.
 *
 * Effect:
 * - PATCHes /api/agents/<agent-id> with a merged adapterConfig containing
 *   { externalEndpoint, runtimeEndpoint } both set to your URL.
 * - Next time the broker reconciles or the agent heartbeats, the adapter
 *   will dial your external daemon instead of an in-process one.
 *
 * If the agent currently has an in-process daemon allocated, you should
 * also restart the Paperclip server so the broker drops the local daemon
 * and the next allocate path goes through the external-endpoint branch.
 * (Or call DELETE on the agent and re-create it; v1.1 doesn't yet expose
 * a "rebind" API.)
 */

const API_BASE = process.env.PAPERCLIP_API ?? "http://localhost:3100";
const TOKEN = process.env.PAPERCLIP_TOKEN;

interface Args {
  agentId: string;
  endpoint: string;
}

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--agent-id") out.agentId = argv[++i];
    else if (arg === "--endpoint") out.endpoint = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(USAGE);
      process.exit(0);
    }
  }
  if (!out.agentId || !out.endpoint) {
    process.stderr.write(USAGE);
    process.exit(2);
  }
  if (!out.endpoint.startsWith("ws://") && !out.endpoint.startsWith("wss://")) {
    process.stderr.write(`endpoint must start with ws:// or wss://\n`);
    process.exit(2);
  }
  return out as Args;
}

const USAGE = `Usage: zootropolis-register-external --agent-id <uuid> --endpoint ws://...

Env:
  PAPERCLIP_API     base URL of running Paperclip server (default http://localhost:3100)
  PAPERCLIP_TOKEN   bearer token (only needed for authenticated deployments)
`;

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${method} ${path} → ${res.status} ${res.statusText}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

interface Agent {
  id: string;
  name: string;
  adapterType: string;
  adapterConfig: Record<string, unknown>;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const agent = await api<Agent>("GET", `/api/agents/${args.agentId}`);
  if (agent.adapterType !== "aliaskit_vm") {
    console.warn(
      `Warning: agent ${agent.id} (${agent.name}) has adapterType=${agent.adapterType}, ` +
        `not aliaskit_vm. externalEndpoint will be stored but the adapter won't read it.`,
    );
  }
  const nextAdapterConfig = {
    ...(agent.adapterConfig ?? {}),
    externalEndpoint: args.endpoint,
    runtimeEndpoint: args.endpoint,
  };
  await api("PATCH", `/api/agents/${args.agentId}`, { adapterConfig: nextAdapterConfig });
  console.log(`Agent ${agent.id} (${agent.name}) registered with external endpoint:`);
  console.log(`  ${args.endpoint}`);
  console.log(``);
  console.log(`Next steps:`);
  console.log(`  - If the agent has an in-process daemon currently running, restart`);
  console.log(`    the Paperclip server so the broker re-evaluates the endpoint.`);
  console.log(`  - Confirm the daemon at ${args.endpoint} responds to a hello probe`);
  console.log(`    via the adapter test endpoint in the Paperclip UI.`);
}

main().catch((err) => {
  console.error("Failed:", err.message ?? err);
  process.exit(1);
});
