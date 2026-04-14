/**
 * Zootropolis J1 — server-side reachability probe.
 *
 * Opens a short-lived WebSocket to a leaf agent's `adapterConfig.runtimeEndpoint`,
 * sends a `HelloFrame`, waits up to 2s for a matching `ReadyFrame`, and returns
 * a structured {@link ProbeResult}. Never throws — always resolves. Callers can
 * poll this every ~10s from the UI to drive the red-dot / banner soft-fail UX.
 *
 * Mirrors the probe in the aliaskit-vm adapter's `testEnvironment` path
 * (`packages/adapters/aliaskit-vm/src/server/test.ts`), but returns
 * per-agent latency so UI can show a freshness timestamp.
 */
import type { Db } from "@paperclipai/db";
import { agents as agentsTable } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { WebSocket } from "ws";
import type {
  HelloFrame,
  ReadyFrame,
} from "@paperclipai/adapter-aliaskit-vm/shared";

export interface ProbeResult {
  reachable: boolean;
  rtMs?: number;
  error?: { code: string; message: string };
  probedAt: string;
}

const DEFAULT_TIMEOUT_MS = 2_000;

function nowIso(): string {
  return new Date().toISOString();
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Probe the agent's runtime endpoint. Always resolves, never throws.
 *
 * Resolution rules:
 *   - agent not found / not aliaskit_vm → {reachable:false, error:{code:"not_applicable"}}
 *   - endpoint missing or not ws://|wss:// → {reachable:false, error:{code:"no_endpoint"}}
 *   - hello sent, ready received within 2s → {reachable:true, rtMs:<elapsed>}
 *   - timeout / socket error / bad frame → {reachable:false, error:{code,message}}
 */
export async function probeAgentRuntime(
  agentId: string,
  db: Db,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ProbeResult> {
  const row = await db
    .select({
      id: agentsTable.id,
      adapterType: agentsTable.adapterType,
      adapterConfig: agentsTable.adapterConfig,
    })
    .from(agentsTable)
    .where(eq(agentsTable.id, agentId))
    .then((rows) => rows[0] ?? null);

  if (!row) {
    return {
      reachable: false,
      error: { code: "not_found", message: `Agent ${agentId} not found` },
      probedAt: nowIso(),
    };
  }

  if (row.adapterType !== "aliaskit_vm") {
    return {
      reachable: false,
      error: {
        code: "not_applicable",
        message: `Reachability probe only supported for aliaskit_vm agents (got ${row.adapterType}).`,
      },
      probedAt: nowIso(),
    };
  }

  const cfg = (row.adapterConfig ?? {}) as Record<string, unknown>;
  const endpoint = readString(cfg.runtimeEndpoint);

  if (!endpoint) {
    return {
      reachable: false,
      error: {
        code: "no_endpoint",
        message:
          "Agent has no adapterConfig.runtimeEndpoint. Set one at hire time or via the register-external CLI.",
      },
      probedAt: nowIso(),
    };
  }

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return {
      reachable: false,
      error: { code: "invalid_endpoint", message: `Invalid runtimeEndpoint: ${endpoint}` },
      probedAt: nowIso(),
    };
  }

  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    return {
      reachable: false,
      error: {
        code: "invalid_endpoint_protocol",
        message: `Unsupported protocol ${url.protocol} — expected ws:// or wss://.`,
      },
      probedAt: nowIso(),
    };
  }

  return await probeEndpoint(agentId, url.toString(), timeoutMs);
}

/**
 * Pure WS probe — exposed for tests. Sends HelloFrame, awaits ReadyFrame,
 * resolves within `timeoutMs`.
 */
export async function probeEndpoint(
  agentId: string,
  endpoint: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ProbeResult> {
  const started = Date.now();
  return await new Promise<ProbeResult>((resolve) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(endpoint);
    } catch (err) {
      resolve({
        reachable: false,
        error: {
          code: "connect_failed",
          message: err instanceof Error ? err.message : "WebSocket construction failed",
        },
        probedAt: nowIso(),
      });
      return;
    }

    let done = false;
    const finish = (result: ProbeResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({
        reachable: false,
        error: { code: "timeout", message: `No ready frame within ${timeoutMs}ms` },
        probedAt: nowIso(),
      });
    }, timeoutMs);

    ws.on("open", () => {
      const hello: HelloFrame = { type: "hello", agentId };
      try {
        ws.send(JSON.stringify(hello));
      } catch (err) {
        finish({
          reachable: false,
          error: {
            code: "send_failed",
            message: err instanceof Error ? err.message : "hello send failed",
          },
          probedAt: nowIso(),
        });
      }
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Partial<ReadyFrame>;
        if (msg?.type === "ready") {
          finish({
            reachable: true,
            rtMs: Date.now() - started,
            probedAt: nowIso(),
          });
          return;
        }
        finish({
          reachable: false,
          error: {
            code: "bad_frame",
            message: `Expected ready frame, got type=${String(msg?.type)}`,
          },
          probedAt: nowIso(),
        });
      } catch (err) {
        finish({
          reachable: false,
          error: {
            code: "bad_frame",
            message: err instanceof Error ? err.message : "Could not parse daemon frame",
          },
          probedAt: nowIso(),
        });
      }
    });

    ws.on("error", (err: Error) => {
      finish({
        reachable: false,
        error: {
          code: "socket_error",
          message: err?.message ?? "WebSocket error",
        },
        probedAt: nowIso(),
      });
    });

    ws.on("close", () => {
      if (!done) {
        finish({
          reachable: false,
          error: { code: "closed", message: "WebSocket closed before ready" },
          probedAt: nowIso(),
        });
      }
    });
  });
}
