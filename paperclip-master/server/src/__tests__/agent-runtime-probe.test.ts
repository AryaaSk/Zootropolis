import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { WebSocketServer } from "ws";
import { probeEndpoint } from "../services/agent-runtime-probe.js";

/**
 * Zootropolis J1 — unit tests for the pure WS probe helper.
 *
 * Spins a real local WebSocket server per test case (dynamic port via
 * `listen(0)`), so we exercise the actual hello/ready handshake the daemon
 * contract specifies in `docs/agent-runtime-contract.md`. DB-level
 * dispatching (adapterType checks, endpoint extraction) is covered by the
 * route integration path and not retested here.
 */

interface Harness {
  url: string;
  close: () => Promise<void>;
}

async function startMock(
  onHello: (socket: import("ws").WebSocket) => void,
): Promise<Harness> {
  const server: Server = createServer();
  const wss = new WebSocketServer({ server });
  wss.on("connection", (socket) => {
    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === "hello") onHello(socket);
      } catch {
        /* ignore bad frames */
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  return {
    url: `ws://127.0.0.1:${addr.port}/`,
    close: async () => {
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

describe("probeEndpoint", () => {
  let harness: Harness | null = null;

  afterEach(async () => {
    if (harness) {
      await harness.close().catch(() => {});
      harness = null;
    }
  });

  it("returns reachable=true and rtMs when daemon sends ReadyFrame", async () => {
    harness = await startMock((socket) => {
      socket.send(
        JSON.stringify({ type: "ready", agentId: "test-agent" }),
      );
    });

    const result = await probeEndpoint("test-agent", harness.url, 2000);

    expect(result.reachable).toBe(true);
    expect(typeof result.rtMs).toBe("number");
    expect(result.rtMs!).toBeGreaterThanOrEqual(0);
    expect(typeof result.probedAt).toBe("string");
    expect(result.error).toBeUndefined();
  });

  it("returns reachable=false with timeout when daemon does not reply", async () => {
    // Mock that accepts hello but never sends ready.
    harness = await startMock(() => {
      /* intentionally silent */
    });

    const result = await probeEndpoint("test-agent", harness.url, 200);

    expect(result.reachable).toBe(false);
    expect(result.rtMs).toBeUndefined();
    expect(result.error?.code).toBe("timeout");
    expect(typeof result.probedAt).toBe("string");
  });

  it("returns reachable=false when endpoint is unreachable", async () => {
    // Use a port that won't have anything listening. :1 is reserved-and-filtered
    // on most systems; the connection fails fast with ECONNREFUSED.
    const result = await probeEndpoint(
      "test-agent",
      "ws://127.0.0.1:1/",
      1500,
    );

    expect(result.reachable).toBe(false);
    expect(result.error).toBeDefined();
  });
});
