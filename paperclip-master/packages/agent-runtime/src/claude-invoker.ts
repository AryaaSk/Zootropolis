import { spawn } from "node:child_process";
import type { ExecuteResult } from "@paperclipai/adapter-aliaskit-vm/shared";

export interface InvokeOptions {
  folder: string;
  wakePayload: Record<string, unknown> | string;
  resumeSessionId?: string | null;
  timeoutMs?: number;
  /** Override the binary used; defaults to "claude". Useful for tests. */
  binary?: string;
  /** Called for each chunk of stdout/stderr as it arrives. */
  onChunk?: (stream: "stdout" | "stderr", chunk: string) => void;
  /** Optional environment variables to merge in (over the daemon's env). */
  env?: Record<string, string>;
}

interface InvokeRunReturn extends ExecuteResult {}

/**
 * Spawn `claude` (or the configured binary) inside the agent folder,
 * piping the wake payload to stdin and streaming stdout/stderr back to
 * the caller via onChunk. Returns when the process exits.
 *
 * If a resumeSessionId is provided we add `--resume <id>`. If the binary
 * rejects the session id (stale cache), the daemon-level retry-without-
 * resume happens at the daemon layer, not here — this function is just the
 * single-shot invocation.
 *
 * Best-effort sessionId extraction: we look for the last JSON object on
 * stdout containing a `sessionId` field. Real Claude Code emits a final
 * `result` event with this; if we don't see one, sessionId stays null and
 * the next heartbeat starts fresh.
 */
export function invokeClaude(opts: InvokeOptions): Promise<InvokeRunReturn> {
  return new Promise((resolve) => {
    const args: string[] = [];
    if (opts.resumeSessionId) args.push("--resume", opts.resumeSessionId);
    // claude takes the prompt on stdin when invoked with no positional arg.

    const binary = opts.binary ?? "claude";
    const child = spawn(binary, args, {
      cwd: opts.folder,
      env: { ...process.env, ...(opts.env ?? {}) },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutBuf = "";
    let stderrBuf = "";
    let timedOut = false;
    const deadline = opts.timeoutMs && opts.timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          try {
            child.kill("SIGTERM");
            // hard-kill grace
            setTimeout(() => {
              try {
                child.kill("SIGKILL");
              } catch {
                /* ignore */
              }
            }, 5_000);
          } catch {
            /* ignore */
          }
        }, opts.timeoutMs)
      : null;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutBuf += chunk;
      opts.onChunk?.("stdout", chunk);
    });
    child.stderr.on("data", (chunk: string) => {
      stderrBuf += chunk;
      opts.onChunk?.("stderr", chunk);
    });

    child.on("error", (err) => {
      if (deadline) clearTimeout(deadline);
      resolve({
        exitCode: null,
        signal: null,
        timedOut,
        sessionId: null,
        usage: undefined,
        resultJson: { error: err.message, stderr: stderrBuf },
      });
    });

    child.on("close", (code, signal) => {
      if (deadline) clearTimeout(deadline);
      const sessionId = extractSessionId(stdoutBuf);
      const usage = extractUsage(stdoutBuf);
      const resultJson = extractResultJson(stdoutBuf, stderrBuf);
      resolve({
        exitCode: code ?? null,
        signal: signal ?? null,
        timedOut,
        sessionId,
        usage,
        resultJson,
      });
    });

    // Pipe wake payload in.
    const payloadString = typeof opts.wakePayload === "string"
      ? opts.wakePayload
      : JSON.stringify(opts.wakePayload);
    try {
      child.stdin.write(payloadString);
      child.stdin.end();
    } catch {
      /* the close handler will resolve */
    }
  });
}

function extractSessionId(stdout: string): string | null {
  // Walk stdout backwards looking for a JSON object with "sessionId".
  const lines = stdout.split(/\r?\n/).reverse();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed[0] !== "{") continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === "object") {
        const sid = (obj as Record<string, unknown>).sessionId
          ?? (obj as Record<string, unknown>).session_id;
        if (typeof sid === "string" && sid.length > 0) return sid;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function extractUsage(stdout: string): { inputTokens: number; outputTokens: number; cachedInputTokens?: number } | undefined {
  const lines = stdout.split(/\r?\n/).reverse();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed[0] !== "{") continue;
    try {
      const obj = JSON.parse(trimmed);
      const u = (obj as Record<string, unknown>)?.usage;
      if (u && typeof u === "object") {
        const usage = u as Record<string, unknown>;
        const input = Number(usage.inputTokens ?? usage.input_tokens ?? 0);
        const output = Number(usage.outputTokens ?? usage.output_tokens ?? 0);
        const cached = Number(usage.cachedInputTokens ?? usage.cached_input_tokens ?? 0);
        if (Number.isFinite(input) && Number.isFinite(output)) {
          return {
            inputTokens: input,
            outputTokens: output,
            ...(Number.isFinite(cached) && cached > 0 ? { cachedInputTokens: cached } : {}),
          };
        }
      }
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

function extractResultJson(stdout: string, stderr: string): Record<string, unknown> | null {
  const lines = stdout.split(/\r?\n/).reverse();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed[0] !== "{") continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === "object") return obj as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }
  // No structured result; return raw stdout/stderr for debugging.
  return { stdout, stderr };
}
