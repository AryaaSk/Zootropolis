import { WebSocketServer, type WebSocket } from "ws";
import type {
  AnyFrame,
  ExecuteRequestFrame,
  HelloFrame,
  ReadyFrame,
  ResponseFrame,
  ShutdownRequestFrame,
  StreamFrame,
} from "@paperclipai/adapter-aliaskit-vm/shared";
import { ensureFolderBootstrapped } from "./folder-bootstrap.js";
import { invokeClaude } from "./claude-invoker.js";

export interface DaemonOptions {
  agentId: string;
  port: number;
  folder: string;
  /** Override the agent CLI binary; default is "claude". */
  binary?: string;
  /** Where status messages and the runtime log go. Default is stderr. */
  log?: (msg: string) => void;
}

export interface RunningDaemon {
  port: number;
  agentId: string;
  /** Resolves once the WS server is listening. */
  ready: Promise<void>;
  /** Cleanly shut down the daemon. */
  close: () => Promise<void>;
}

/**
 * Start a per-agent runtime daemon. One Node process per leaf agent in dev;
 * one VM containing this same daemon as PID 1 in prod.
 *
 * Wire protocol: see packages/adapters/aliaskit-vm/src/shared/protocol.ts
 */
export function startDaemon(opts: DaemonOptions): RunningDaemon {
  const log = opts.log ?? ((msg: string) => process.stderr.write(`[agent-runtime ${opts.agentId}] ${msg}\n`));

  const wss = new WebSocketServer({ port: opts.port });
  let ready!: () => void;
  let readyErr!: (err: Error) => void;
  const readyPromise = new Promise<void>((res, rej) => {
    ready = res;
    readyErr = rej;
  });

  wss.on("listening", () => {
    log(`listening on ws://0.0.0.0:${opts.port}/`);
    ready();
  });
  wss.on("error", (err) => {
    log(`WSS error: ${err.message}`);
    readyErr(err);
  });

  wss.on("connection", (socket) => {
    handleConnection(socket, opts, log).catch((err) => {
      log(`connection handler crashed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    });
  });

  return {
    port: opts.port,
    agentId: opts.agentId,
    ready: readyPromise,
    close: () => new Promise<void>((res) => wss.close(() => res())),
  };
}

async function handleConnection(socket: WebSocket, opts: DaemonOptions, log: (msg: string) => void) {
  let helloed = false;

  socket.on("message", (raw) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const frame = parsed as AnyFrame;
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) return;

    if (frame.type === "hello") {
      handleHello(socket, frame, opts).catch((err) => {
        log(`hello handler error: ${err instanceof Error ? err.message : String(err)}`);
      });
      helloed = true;
      return;
    }
    if (!helloed) {
      // Pre-hello frames are ignored (could be a probe).
      return;
    }
    if (frame.type === "req") {
      const req = frame as ExecuteRequestFrame | ShutdownRequestFrame;
      if (req.method === "execute") {
        void handleExecute(socket, req as ExecuteRequestFrame, opts, log);
      } else if (req.method === "shutdown") {
        void handleShutdown(socket, req as ShutdownRequestFrame, log);
      } else {
        sendErrorResponse(socket, (req as { id: string }).id, "unknown_method", `unknown method`);
      }
    }
  });

  socket.on("close", () => {
    /* connection ended; nothing to clean up per-connection */
  });
}

async function handleHello(socket: WebSocket, frame: HelloFrame, opts: DaemonOptions) {
  // We do not enforce token auth in dev; in prod the daemon would validate
  // frame.token against a per-VM secret.
  if (frame.agentId !== opts.agentId && frame.agentId !== "probe") {
    // Accept anyway but log; the daemon is single-tenant by design.
    process.stderr.write(`[agent-runtime ${opts.agentId}] hello with mismatched agentId=${frame.agentId}\n`);
  }
  const ready: ReadyFrame = {
    type: "ready",
    agentId: opts.agentId,
    caps: { sessionResume: true, screenshots: false },
  };
  socket.send(JSON.stringify(ready));
}

async function handleExecute(
  socket: WebSocket,
  req: ExecuteRequestFrame,
  opts: DaemonOptions,
  log: (msg: string) => void,
) {
  await ensureFolderBootstrapped(opts.folder, opts.agentId);
  log(`execute id=${req.id} runId=${req.params.runId} resume=${req.params.resumeSessionId ?? "(fresh)"}`);

  const onChunk = (stream: "stdout" | "stderr", chunk: string) => {
    const frame: StreamFrame = { type: "stream", reqId: req.id, stream, chunk };
    if (socket.readyState === socket.OPEN) {
      try {
        socket.send(JSON.stringify(frame));
      } catch {
        /* socket closed mid-stream; ignore */
      }
    }
  };

  const result = await invokeClaude({
    folder: opts.folder,
    wakePayload: req.params.wakePayload,
    resumeSessionId: req.params.resumeSessionId,
    timeoutMs: req.params.timeoutMs,
    binary: opts.binary,
    onChunk,
  });

  const res: ResponseFrame = {
    type: "res",
    id: req.id,
    ok: result.exitCode === 0,
    result,
  };
  if (socket.readyState === socket.OPEN) {
    try {
      socket.send(JSON.stringify(res));
    } catch {
      /* ignore */
    }
  }
}

async function handleShutdown(
  socket: WebSocket,
  req: ShutdownRequestFrame,
  log: (msg: string) => void,
) {
  log(`shutdown requested (id=${req.id})`);
  const res: ResponseFrame = { type: "res", id: req.id, ok: true, result: { exitCode: 0, signal: null } };
  try {
    socket.send(JSON.stringify(res));
  } catch {
    /* ignore */
  }
  // Give the response a beat to flush, then exit.
  setTimeout(() => process.exit(0), 100);
}

function sendErrorResponse(socket: WebSocket, id: string, code: string, message: string) {
  const res: ResponseFrame = { type: "res", id, ok: false, error: { code, message } };
  try {
    socket.send(JSON.stringify(res));
  } catch {
    /* ignore */
  }
}

// CLI entry — runs when invoked directly (bin/agent-runtime calls into this file).
export function runFromCli(argv: string[]): void {
  const args = parseArgs(argv);
  const daemon = startDaemon({
    agentId: args.agentId,
    port: args.port,
    folder: args.folder,
    binary: args.binary,
  });
  daemon.ready.catch((err) => {
    process.stderr.write(`[agent-runtime] failed to start: ${err.message}\n`);
    process.exit(1);
  });
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));
}

interface CliArgs {
  agentId: string;
  port: number;
  folder: string;
  binary?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const out: Partial<CliArgs> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--agent-id") out.agentId = argv[++i];
    else if (arg === "--port") out.port = Number(argv[++i]);
    else if (arg === "--folder") out.folder = argv[++i];
    else if (arg === "--binary") out.binary = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(usage());
      process.exit(0);
    }
  }
  if (!out.agentId || !out.port || !out.folder) {
    process.stderr.write(usage());
    process.exit(2);
  }
  return out as CliArgs;
}

function usage(): string {
  return `Usage: agent-runtime --agent-id <id> --port <number> --folder <path> [--binary claude]

Per-agent runtime daemon for Zootropolis leaf agents. Owns its folder and
nothing else. Speaks the aliaskit-vm WebSocket protocol; spawns the underlying
agent CLI (default: claude) per heartbeat with stdin = wakePayload.
`;
}

// auto-run if invoked as main module
const isMain = (() => {
  try {
    const url = new URL(import.meta.url);
    return process.argv[1] && url.pathname === process.argv[1];
  } catch {
    return false;
  }
})();
if (isMain) runFromCli(process.argv.slice(2));
