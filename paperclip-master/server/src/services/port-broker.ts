import { homedir } from "node:os";
import { join } from "node:path";
import type { Db } from "@paperclipai/db";
import { agents } from "@paperclipai/db";
import { and, eq, ne } from "drizzle-orm";
import { startDaemon, type RunningDaemon } from "@paperclipai/agent-runtime";
import { logger } from "../middleware/logger.js";

/**
 * Zootropolis port broker. Allocates a TCP port from a configured range to
 * each leaf agent on hire, spawns its agent-runtime daemon, and tears the
 * daemon down on fire.
 *
 * v1 implementation note: daemons are hosted IN-PROCESS inside the Paperclip
 * server (one ws listener per agent, all on different ports of localhost).
 * The wire boundary (WebSocket on its own port) is faithful to the prod model
 * so the aliaskit_vm adapter doesn't need to know the difference. Real
 * process-per-agent isolation arrives with the move to actual Cua/Coasty
 * VMs in v2 — at that point startDaemon() is replaced with a VM acquire
 * call, but everything else (port allocation, metadata writes, lifecycle
 * hooks) stays the same.
 */

const DEFAULT_RANGE_START = 7100;
const DEFAULT_RANGE_END = 7999;

function portRangeStart(): number {
  const v = Number(process.env.ZOOTROPOLIS_PORT_RANGE_START);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_RANGE_START;
}
function portRangeEnd(): number {
  const v = Number(process.env.ZOOTROPOLIS_PORT_RANGE_END);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_RANGE_END;
}

function defaultAgentsRoot(): string {
  return process.env.ZOOTROPOLIS_AGENTS_ROOT?.trim()
    || join(homedir(), "zootropolis", "agents");
}

function agentFolderFor(agentId: string): string {
  return join(defaultAgentsRoot(), agentId);
}

function endpointFor(port: number): string {
  return `ws://127.0.0.1:${port}/`;
}

interface BrokerEntry {
  port: number;
  daemon: RunningDaemon;
  folder: string;
}

export interface PortBroker {
  /** Allocate a port + spawn a daemon for this agent. Idempotent. */
  allocate(agentId: string): Promise<{ port: number; endpoint: string; folder: string }>;
  /** Stop the daemon and free the port. Idempotent. */
  release(agentId: string): Promise<void>;
  /** Reconcile in-memory state with DB on server boot. */
  reconcile(companyId?: string): Promise<void>;
  /** Inspect current port usage (for tests / introspection). */
  status(): { allocated: Array<{ agentId: string; port: number }>; range: { start: number; end: number } };
}

// Module-singleton: there's exactly one broker per server process, since it
// owns local TCP ports + in-process daemons.
let _broker: PortBroker | null = null;
export function getPortBroker(db: Db): PortBroker {
  if (_broker) return _broker;
  _broker = portBrokerService(db);
  return _broker;
}

export function portBrokerService(db: Db): PortBroker {
  const allocations = new Map<string, BrokerEntry>();

  function pickFreePort(preferred?: number | null): number {
    const start = portRangeStart();
    const end = portRangeEnd();
    const used = new Set<number>();
    for (const entry of allocations.values()) used.add(entry.port);
    if (preferred && preferred >= start && preferred <= end && !used.has(preferred)) {
      return preferred;
    }
    for (let p = start; p <= end; p++) {
      if (!used.has(p)) return p;
    }
    throw new Error(`Zootropolis port broker exhausted (range ${start}-${end})`);
  }

  async function allocate(agentId: string): Promise<{ port: number; endpoint: string; folder: string }> {
    const existing = allocations.get(agentId);
    if (existing) {
      return { port: existing.port, endpoint: endpointFor(existing.port), folder: existing.folder };
    }

    // Look up the agent so we can prefer the previously stored port.
    const row = await db
      .select({
        id: agents.id,
        adapterConfig: agents.adapterConfig,
        metadata: agents.metadata,
      })
      .from(agents)
      .where(eq(agents.id, agentId))
      .then((rows) => rows[0] ?? null);
    if (!row) throw new Error(`Port broker: agent ${agentId} not found`);

    const previousPort = readPreviousPort(row);
    const port = pickFreePort(previousPort);
    const folder = agentFolderFor(agentId);
    const daemon = startDaemon({
      agentId,
      port,
      folder,
      log: (msg) => logger.debug({ agentId, port }, `[agent-runtime] ${msg}`),
    });
    await daemon.ready;

    allocations.set(agentId, { port, daemon, folder });

    // Persist endpoint into adapterConfig (where the adapter reads it) and
    // into metadata.zootropolis.runtime (where the UI reads it).
    const nextAdapterConfig = {
      ...((row.adapterConfig as Record<string, unknown> | null) ?? {}),
      runtimeEndpoint: endpointFor(port),
      runtimePort: port,
    };
    const nextMetadata = mergeRuntimeMetadata(row.metadata, port);
    await db
      .update(agents)
      .set({ adapterConfig: nextAdapterConfig, metadata: nextMetadata })
      .where(eq(agents.id, agentId));

    logger.info({ agentId, port, folder }, "Zootropolis port broker: allocated");
    return { port, endpoint: endpointFor(port), folder };
  }

  async function release(agentId: string): Promise<void> {
    const entry = allocations.get(agentId);
    if (!entry) return;
    try {
      // Best-effort polite shutdown via the daemon's own close path.
      await entry.daemon.close();
    } catch (err) {
      logger.warn({ agentId, err }, "Zootropolis port broker: daemon close failed");
    }
    allocations.delete(agentId);
    logger.info({ agentId, port: entry.port }, "Zootropolis port broker: released");
  }

  async function reconcile(companyId?: string): Promise<void> {
    const conditions = [eq(agents.adapterType, "aliaskit_vm"), ne(agents.status, "terminated")];
    if (companyId) conditions.push(eq(agents.companyId, companyId));
    const rows = await db
      .select({
        id: agents.id,
        adapterConfig: agents.adapterConfig,
        metadata: agents.metadata,
      })
      .from(agents)
      .where(and(...conditions));
    for (const row of rows) {
      try {
        await allocate(row.id);
      } catch (err) {
        logger.error({ agentId: row.id, err }, "Zootropolis port broker: reconcile allocate failed");
      }
    }
    logger.info(
      { count: rows.length, allocated: allocations.size },
      "Zootropolis port broker: reconciled",
    );
  }

  function status() {
    return {
      allocated: Array.from(allocations.entries()).map(([agentId, entry]) => ({
        agentId,
        port: entry.port,
      })),
      range: { start: portRangeStart(), end: portRangeEnd() },
    };
  }

  return { allocate, release, reconcile, status };
}

function readPreviousPort(row: { adapterConfig: unknown; metadata: unknown }): number | null {
  const ac = row.adapterConfig as Record<string, unknown> | null;
  const fromAc = Number(ac?.runtimePort);
  if (Number.isFinite(fromAc) && fromAc > 0) return fromAc;
  const md = row.metadata as Record<string, unknown> | null;
  const z = md?.zootropolis as Record<string, unknown> | null | undefined;
  const r = z?.runtime as Record<string, unknown> | null | undefined;
  const fromMd = Number(r?.port);
  if (Number.isFinite(fromMd) && fromMd > 0) return fromMd;
  return null;
}

function mergeRuntimeMetadata(metadata: unknown, port: number): Record<string, unknown> {
  const base = (metadata as Record<string, unknown> | null) ?? {};
  const z = (base.zootropolis as Record<string, unknown> | null) ?? {};
  return {
    ...base,
    zootropolis: {
      ...z,
      runtime: { endpoint: endpointFor(port), port },
    },
  };
}
