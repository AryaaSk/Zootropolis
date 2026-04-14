import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { startDaemon, type RunningDaemon } from "./daemon.js";
import type {
  ExecuteRequestFrame,
  HelloFrame,
  ResponseFrame,
} from "@paperclipai/adapter-aliaskit-vm/shared";

let daemon: RunningDaemon;
let folder: string;
let port: number;

function pickPort(): number {
  // pick an ephemeral-ish port; tests may run in parallel across files but
  // each file is sequential within itself.
  return 17_100 + Math.floor(Math.random() * 800);
}

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "zootropolis-daemon-test-"));
  port = pickPort();
  // Use /bin/cat as the "binary" — it echoes stdin to stdout, perfect for
  // round-tripping the wake payload back so we can inspect it.
  daemon = startDaemon({
    agentId: "test-agent",
    port,
    folder,
    binary: "/bin/cat",
    log: () => {}, // quiet
  });
  await daemon.ready;
});

afterEach(async () => {
  await daemon.close().catch(() => {});
  await rm(folder, { recursive: true, force: true });
});

async function connectAndExpect<T>(work: (socket: WebSocket) => Promise<T>): Promise<T> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/`);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  try {
    return await work(socket);
  } finally {
    socket.close();
  }
}

describe("agent-runtime daemon", () => {
  it("responds to hello with ready", async () => {
    await connectAndExpect(async (socket) => {
      const ready = waitForFrame(socket);
      const hello: HelloFrame = { type: "hello", agentId: "test-agent" };
      socket.send(JSON.stringify(hello));
      const frame = await ready;
      expect(frame).toMatchObject({ type: "ready", agentId: "test-agent" });
    });
  });

  it("bootstraps the agent folder on first execute", async () => {
    await connectAndExpect(async (socket) => {
      socket.send(JSON.stringify({ type: "hello", agentId: "test-agent" } satisfies HelloFrame));
      await waitForFrame(socket); // ready

      const execReq: ExecuteRequestFrame = {
        type: "req",
        id: "exec-1",
        method: "execute",
        params: {
          runId: "run-1",
          wakePayload: { hello: "world" },
        },
      };
      socket.send(JSON.stringify(execReq));
      const final = await waitForFinal(socket, "exec-1");
      expect(final.ok).toBe(true);
    });

    // CLAUDE.md, memory.md, identity.json should now exist
    const claudeMd = await readFile(join(folder, "CLAUDE.md"), "utf8");
    expect(claudeMd).toContain("test-agent");
    const memoryMd = await readFile(join(folder, "memory.md"), "utf8");
    expect(memoryMd).toContain("test-agent");
    const identity = JSON.parse(await readFile(join(folder, "identity.json"), "utf8"));
    expect(identity).toHaveProperty("note");
  });

  it("streams stdout chunks during an execute", async () => {
    const collected: string[] = [];
    await connectAndExpect(async (socket) => {
      socket.send(JSON.stringify({ type: "hello", agentId: "test-agent" } satisfies HelloFrame));
      await waitForFrame(socket); // ready

      socket.on("message", (raw) => {
        const f = JSON.parse(raw.toString());
        if (f.type === "stream" && f.reqId === "exec-2") {
          collected.push(f.chunk);
        }
      });

      const execReq: ExecuteRequestFrame = {
        type: "req",
        id: "exec-2",
        method: "execute",
        params: {
          runId: "run-2",
          wakePayload: "hello-from-stdin",
        },
      };
      socket.send(JSON.stringify(execReq));
      await waitForFinal(socket, "exec-2");
    });

    // /bin/cat echoes stdin → so we should see "hello-from-stdin" come back
    expect(collected.join("")).toContain("hello-from-stdin");
  });
});

function waitForFrame(socket: WebSocket, timeoutMs = 5_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout waiting for frame")), timeoutMs);
    const onMessage = (raw: { toString: () => string }) => {
      clearTimeout(t);
      socket.off("message", onMessage);
      try {
        resolve(JSON.parse(raw.toString()));
      } catch (err) {
        reject(err);
      }
    };
    socket.on("message", onMessage);
  });
}

async function waitForFinal(socket: WebSocket, id: string, timeoutMs = 10_000): Promise<ResponseFrame> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout waiting for response")), timeoutMs);
    const onMessage = (raw: { toString: () => string }) => {
      let frame: { type?: string; id?: string };
      try {
        frame = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (frame.type === "res" && frame.id === id) {
        clearTimeout(t);
        socket.off("message", onMessage);
        resolve(frame as ResponseFrame);
      }
    };
    socket.on("message", onMessage);
  });
}
