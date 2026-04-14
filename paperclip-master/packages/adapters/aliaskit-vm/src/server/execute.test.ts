import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDaemon, type RunningDaemon } from "@paperclipai/agent-runtime";
import { execute } from "./execute.js";

let daemon: RunningDaemon;
let folder: string;
let port: number;

function pickPort(): number {
  return 18_100 + Math.floor(Math.random() * 800);
}

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "zootropolis-aliaskit-vm-test-"));
  port = pickPort();
  // /bin/cat as the agent binary echoes wakePayload back via stdout — perfect
  // for verifying the full adapter→daemon→child-process roundtrip.
  daemon = startDaemon({
    agentId: "test-leaf",
    port,
    folder,
    binary: "/bin/cat",
    log: () => {},
  });
  await daemon.ready;
});

afterEach(async () => {
  await daemon.close().catch(() => {});
  await rm(folder, { recursive: true, force: true });
});

describe("aliaskit-vm adapter execute (end-to-end)", () => {
  it("connects to daemon, sends execute, streams stdout back via onLog, returns result", async () => {
    const logs: Array<{ stream: "stdout" | "stderr"; chunk: string }> = [];
    const result = await execute({
      runId: "run-test-1",
      agent: {
        id: "test-leaf",
        companyId: "test-co",
        name: "Test Leaf",
        adapterType: "aliaskit_vm",
        adapterConfig: { runtimeEndpoint: `ws://127.0.0.1:${port}/` },
      },
      runtime: {
        sessionId: null,
        sessionParams: null,
        sessionDisplayId: null,
        taskKey: null,
      },
      config: { runtimeEndpoint: `ws://127.0.0.1:${port}/` },
      context: { hello: "from-paperclip" },
      onLog: async (stream, chunk) => {
        logs.push({ stream, chunk });
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    // /bin/cat will have echoed our context-as-JSON. Verify it appeared in
    // the streamed logs.
    const stdoutCombined = logs
      .filter((l) => l.stream === "stdout")
      .map((l) => l.chunk)
      .join("");
    expect(stdoutCombined).toContain("from-paperclip");
  });

  it("returns an error result when runtimeEndpoint is missing", async () => {
    const result = await execute({
      runId: "run-test-2",
      agent: {
        id: "test-leaf",
        companyId: "test-co",
        name: "Test Leaf",
        adapterType: "aliaskit_vm",
        adapterConfig: {},
      },
      runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
      config: {},
      context: {},
      onLog: async () => {},
    });
    expect(result.errorCode).toBe("aliaskit_vm_runtime_endpoint_missing");
  });
});
