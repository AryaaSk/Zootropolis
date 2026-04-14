/**
 * Wire protocol between the Paperclip server (aliaskit-vm adapter) and the
 * agent runtime daemon (one daemon process per leaf agent in dev; one VM in
 * prod). Identical in both environments — only the connection URL changes.
 *
 * See design.md §7c for the rationale and full message diagram.
 */

/** Sent by the server immediately after the WebSocket connects. */
export interface HelloFrame {
  type: "hello";
  agentId: string;
  /** Optional auth token for prod VMs; ignored by the dev folder daemon. */
  token?: string;
}

/** Daemon's response to hello, advertising what it supports. */
export interface ReadyFrame {
  type: "ready";
  agentId: string;
  caps?: {
    /** True if the daemon can resume Claude sessions via --resume. */
    sessionResume?: boolean;
    /** True if the daemon exposes /screenshot.png for the AgentView preview. */
    screenshots?: boolean;
  };
}

/** Server asks the daemon to run one heartbeat. */
export interface ExecuteRequestFrame {
  type: "req";
  id: string;
  method: "execute";
  params: {
    runId: string;
    /** Wake payload to feed the underlying agent process via stdin. */
    wakePayload: Record<string, unknown> | string;
    /**
     * Last known Claude session id. If present, daemon spawns
     * `claude --resume <sessionId>`; otherwise starts fresh.
     */
    resumeSessionId?: string | null;
    /** Soft timeout in ms; daemon should kill the child when exceeded. */
    timeoutMs?: number;
  };
}

/** Server asks the daemon to shut down (e.g., the agent is being fired). */
export interface ShutdownRequestFrame {
  type: "req";
  id: string;
  method: "shutdown";
  params?: Record<string, never>;
}

export type RequestFrame = ExecuteRequestFrame | ShutdownRequestFrame;

/** Streamed log chunks from the running child process. */
export interface StreamFrame {
  type: "stream";
  /** Which req this chunk belongs to. */
  reqId: string;
  stream: "stdout" | "stderr";
  chunk: string;
}

/** Final response to a request. */
export interface ResponseFrame {
  type: "res";
  id: string;
  ok: boolean;
  result?: ExecuteResult;
  error?: { code?: string; message: string; meta?: Record<string, unknown> };
}

export interface ExecuteResult {
  exitCode: number | null;
  signal: string | null;
  timedOut?: boolean;
  /** Updated session id (for next --resume). */
  sessionId?: string | null;
  /** Token usage if the underlying agent reported it. */
  usage?: { inputTokens: number; outputTokens: number; cachedInputTokens?: number };
  /** Free-form structured result the agent emitted on its last line of stdout. */
  resultJson?: Record<string, unknown> | null;
}

export type AnyFrame = HelloFrame | ReadyFrame | RequestFrame | StreamFrame | ResponseFrame;

export const PROTOCOL_VERSION = 1;
