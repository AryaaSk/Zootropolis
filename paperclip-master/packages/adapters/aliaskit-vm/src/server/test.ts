import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import { WebSocket } from "ws";
import type { HelloFrame, ReadyFrame } from "../shared/protocol.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

async function probeRuntime(endpoint: string, timeoutMs: number): Promise<"ok" | "no_ready" | "failed"> {
  return await new Promise((resolve) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(endpoint);
    } catch {
      resolve("failed");
      return;
    }
    let done = false;
    const finish = (status: "ok" | "no_ready" | "failed") => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(status);
    };
    const timer = setTimeout(() => finish("failed"), timeoutMs);

    ws.on("open", () => {
      const hello: HelloFrame = { type: "hello", agentId: "probe" };
      try {
        ws.send(JSON.stringify(hello));
      } catch {
        finish("failed");
      }
    });
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as ReadyFrame;
        if (msg?.type === "ready") finish("ok");
        else finish("no_ready");
      } catch {
        finish("no_ready");
      }
    });
    ws.on("error", () => finish("failed"));
    ws.on("close", () => {
      if (!done) finish("failed");
    });
  });
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const endpoint = asString(config.runtimeEndpoint, "").trim();

  if (!endpoint) {
    checks.push({
      code: "aliaskit_vm_runtime_endpoint_missing",
      level: "error",
      message: "aliaskit_vm requires a runtimeEndpoint (set by the port broker on hire).",
      hint:
        "If this is a freshly hired agent, the broker should have populated " +
        "adapterConfig.runtimeEndpoint. For an existing agent, try the " +
        "broker reconciliation endpoint.",
    });
    return {
      adapterType: ctx.adapterType,
      status: summarizeStatus(checks),
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  let url: URL | null = null;
  try {
    url = new URL(endpoint);
  } catch {
    checks.push({
      code: "aliaskit_vm_runtime_endpoint_invalid",
      level: "error",
      message: `Invalid runtimeEndpoint: ${endpoint}`,
    });
  }

  if (url && url.protocol !== "ws:" && url.protocol !== "wss:") {
    checks.push({
      code: "aliaskit_vm_runtime_endpoint_protocol_invalid",
      level: "error",
      message: `Unsupported runtimeEndpoint protocol: ${url.protocol}`,
      hint: "Use ws:// (dev folder daemon) or wss:// (prod VM).",
    });
  }

  if (url) {
    checks.push({
      code: "aliaskit_vm_runtime_endpoint_valid",
      level: "info",
      message: `Configured runtime endpoint: ${url.toString()}`,
    });
    try {
      const probe = await probeRuntime(url.toString(), 3_000);
      if (probe === "ok") {
        checks.push({
          code: "aliaskit_vm_runtime_probe_ok",
          level: "info",
          message: "Daemon hello → ready handshake succeeded.",
        });
      } else if (probe === "no_ready") {
        checks.push({
          code: "aliaskit_vm_runtime_probe_no_ready",
          level: "warn",
          message: "Daemon connected but did not return a ready frame.",
          hint: "Check that the daemon is at least version 1 of the protocol.",
        });
      } else {
        checks.push({
          code: "aliaskit_vm_runtime_probe_failed",
          level: "warn",
          message: "Could not reach the agent runtime daemon.",
          hint: "Ensure the daemon is running on the configured port (port broker should keep it alive while the agent exists).",
        });
      }
    } catch (err) {
      checks.push({
        code: "aliaskit_vm_runtime_probe_error",
        level: "warn",
        message: err instanceof Error ? err.message : "Runtime probe failed",
      });
    }
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
