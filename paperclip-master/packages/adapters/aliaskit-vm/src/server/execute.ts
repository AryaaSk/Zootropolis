import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import type {
  AnyFrame,
  ExecuteRequestFrame,
  HelloFrame,
  ResponseFrame,
  StreamFrame,
} from "../shared/protocol.js";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

function rawDataToString(data: unknown): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (Array.isArray(data)) {
    return Buffer.concat(
      data.map((entry) => (Buffer.isBuffer(entry) ? entry : Buffer.from(String(entry), "utf8"))),
    ).toString("utf8");
  }
  return String(data ?? "");
}

function asAnyFrame(value: unknown): AnyFrame | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as AnyFrame;
}

/**
 * Connect to the agent's runtime daemon and run one heartbeat. The daemon
 * (one process per leaf agent in dev, one VM in prod) owns the agent's
 * folder/identity/Claude session — we just send wake payloads in and stream
 * stdout back.
 */
export async function execute(
  ctx: AdapterExecutionContext,
): Promise<AdapterExecutionResult> {
  const config = parseObject(ctx.config);
  const endpoint = asString(config.runtimeEndpoint, "").trim();

  if (!endpoint) {
    return {
      exitCode: null,
      signal: null,
      timedOut: false,
      errorCode: "aliaskit_vm_runtime_endpoint_missing",
      errorMessage:
        "aliaskit_vm adapter has no runtimeEndpoint configured. " +
        "The Zootropolis port broker should fill this in on hire — " +
        "if you're seeing this for an existing agent, run the broker reconciliation.",
    };
  }

  const timeoutMs = Number.isFinite(config.timeoutMs) && (config.timeoutMs as number) > 0
    ? (config.timeoutMs as number)
    : DEFAULT_TIMEOUT_MS;
  const agentToken = asString(config.agentToken, "").trim() || undefined;

  const reqId = randomUUID();

  return await new Promise<AdapterExecutionResult>((resolve) => {
    let settled = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(endpoint, { maxPayload: 16 * 1024 * 1024 });
    } catch (err) {
      resolve({
        exitCode: null,
        signal: null,
        timedOut: false,
        errorCode: "aliaskit_vm_connect_failed",
        errorMessage: err instanceof Error ? err.message : "Failed to open WebSocket",
      });
      return;
    }

    const stop = (result: AdapterExecutionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve(result);
    };

    const deadline = setTimeout(() => {
      stop({
        exitCode: null,
        signal: null,
        timedOut: true,
        errorCode: "aliaskit_vm_timeout",
        errorMessage: `aliaskit_vm execute timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    ws.on("open", () => {
      const hello: HelloFrame = {
        type: "hello",
        agentId: ctx.agent.id,
        ...(agentToken ? { token: agentToken } : {}),
      };
      try {
        ws.send(JSON.stringify(hello));
      } catch (err) {
        stop({
          exitCode: null,
          signal: null,
          timedOut: false,
          errorCode: "aliaskit_vm_send_failed",
          errorMessage: err instanceof Error ? err.message : "Failed to send hello",
        });
      }
    });

    ws.on("message", (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawDataToString(raw));
      } catch {
        return;
      }
      const frame = asAnyFrame(parsed);
      if (!frame) return;

      switch (frame.type) {
        case "ready": {
          const resumeSessionId = ctx.runtime.sessionId ?? null;
          const req: ExecuteRequestFrame = {
            type: "req",
            id: reqId,
            method: "execute",
            params: {
              runId: ctx.runId,
              wakePayload: ctx.context,
              resumeSessionId,
              timeoutMs,
            },
          };
          try {
            ws.send(JSON.stringify(req));
          } catch (err) {
            stop({
              exitCode: null,
              signal: null,
              timedOut: false,
              errorCode: "aliaskit_vm_send_failed",
              errorMessage: err instanceof Error ? err.message : "Failed to send execute",
            });
          }
          return;
        }

        case "stream": {
          const streamFrame = frame as StreamFrame;
          if (streamFrame.reqId !== reqId) return;
          // Fire-and-forget — adapter execute() does not need to await onLog.
          void ctx.onLog(streamFrame.stream, streamFrame.chunk).catch(() => {
            // intentionally swallowed; logging failures should not crash the run
          });
          return;
        }

        case "res": {
          const res = frame as ResponseFrame;
          if (res.id !== reqId) return;
          if (res.ok && res.result) {
            stop({
              exitCode: res.result.exitCode,
              signal: res.result.signal,
              timedOut: res.result.timedOut ?? false,
              sessionId: res.result.sessionId ?? null,
              usage: res.result.usage,
              resultJson: res.result.resultJson ?? null,
            });
          } else {
            stop({
              exitCode: null,
              signal: null,
              timedOut: false,
              errorCode: res.error?.code ?? "aliaskit_vm_remote_error",
              errorMessage: res.error?.message ?? "Daemon reported error without message",
              errorMeta: res.error?.meta,
            });
          }
          return;
        }
      }
    });

    ws.on("error", (err) => {
      stop({
        exitCode: null,
        signal: null,
        timedOut: false,
        errorCode: "aliaskit_vm_socket_error",
        errorMessage: err instanceof Error ? err.message : "WebSocket error",
      });
    });

    ws.on("close", (code, reason) => {
      stop({
        exitCode: null,
        signal: null,
        timedOut: false,
        errorCode: "aliaskit_vm_socket_closed",
        errorMessage: `Daemon WebSocket closed before result (code=${code}${reason && reason.length ? `, reason=${reason.toString("utf8")}` : ""})`,
      });
    });
  });
}
