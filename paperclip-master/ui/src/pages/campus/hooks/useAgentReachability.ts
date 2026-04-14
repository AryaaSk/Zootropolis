import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api/client";

/**
 * Zootropolis J2 — per-agent reachability hook.
 *
 * Polls `GET /api/companies/:companyId/agents/:id/runtime-probe` every 10s
 * (see `server/src/services/agent-runtime-probe.ts` + the route in
 * `server/src/routes/agents.ts`). Drives the floating red indicator over
 * animals (`StatusLight.tsx`) and the AgentView banner soft-fail UX.
 *
 * Contract:
 *   - `reachable === null` means unknown / pending / not applicable (no
 *     agent id, query disabled, or still loading the first response).
 *   - `reachable === true` → daemon answered hello→ready within the server
 *     probe timeout; `rtMs` is populated.
 *   - `reachable === false` → probe failed; `error.code` explains why
 *     (`no_endpoint`, `timeout`, `socket_error`, ...).
 */

export interface ProbeResult {
  reachable: boolean;
  rtMs?: number;
  error?: { code: string; message: string };
  probedAt: string;
}

export interface AgentReachabilityHandle {
  reachable: boolean | null;
  error?: { code: string; message: string };
  rtMs?: number;
  probedAt?: string;
  refetch: () => void;
}

const REFETCH_MS = 10_000;
const STALE_MS = 5_000;

export function useAgentReachability(
  companyId: string,
  agentId: string | null,
): AgentReachabilityHandle {
  const qc = useQueryClient();
  const queryKey = ["zootropolis", "reachability", companyId, agentId] as const;

  const query = useQuery<ProbeResult>({
    queryKey,
    enabled: !!companyId && !!agentId,
    staleTime: STALE_MS,
    refetchInterval: REFETCH_MS,
    refetchIntervalInBackground: false,
    queryFn: () =>
      api.get<ProbeResult>(
        `/companies/${encodeURIComponent(companyId)}/agents/${encodeURIComponent(
          agentId ?? "",
        )}/runtime-probe`,
      ),
  });

  const refetch = useCallback(() => {
    void qc.invalidateQueries({ queryKey });
  }, [qc, queryKey]);

  if (!agentId) {
    return { reachable: null, refetch };
  }

  const data = query.data;
  return {
    reachable: data ? data.reachable : null,
    error: data?.error,
    rtMs: data?.rtMs,
    probedAt: data?.probedAt,
    refetch,
  };
}
