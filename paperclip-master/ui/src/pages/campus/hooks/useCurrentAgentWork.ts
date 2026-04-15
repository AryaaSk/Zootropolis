import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Issue } from "@paperclipai/shared";
import { heartbeatsApi } from "../../../api/heartbeats";
import { issuesApi } from "../../../api/issues";
import { queryKeys } from "../../../lib/queryKeys";
import { useContainerIssues } from "./useContainerIssues";
import { useContainerLiveStatus } from "./useContainerLiveStatus";

export type AgentWorkStatus = "running" | "idle" | "sleeping";

export interface AgentWork {
  /**
   * - "running": a heartbeat is currently executing a task for this agent
   * - "idle": the agent has a pending / in-progress assignment but nothing
   *   is actively running right now (between heartbeats, or paused)
   * - "sleeping": no live run AND no open issues assigned — nothing to do
   */
  status: AgentWorkStatus;
  /**
   * The issue this agent is actively working on. In priority order:
   *   (1) the issue whose id matches the currently-live heartbeat run for
   *       this agent
   *   (2) the most-recently-updated in_progress issue assigned to this agent
   *   (3) the most-recently-updated todo issue assigned to this agent
   *   (4) null — nothing to work on ("sleeping")
   */
  activeIssue: Issue | null;
}

/**
 * Phase W — "what is this agent doing right now?"
 *
 * Composes three existing data sources — no new backend endpoint:
 *   - `heartbeatsApi.liveRunsForCompany` → find the live run whose
 *     `agentId === <this agent>`; if it exists, its `issueId` is the
 *     authoritative active issue.
 *   - `useContainerIssues(companyId, agentId).receivedFromAbove` → fallback
 *     when no live run; pick the first in_progress / todo issue.
 *   - `useContainerLiveStatus(companyId, agentId)` → already returns
 *     "idle" | "running" and subscribes to `heartbeat.run.status` live
 *     events, so the derived `status` updates without polling.
 *
 * Returns { status: "sleeping", activeIssue: null } when agentId is null
 * (campus root has no single owner).
 */
export function useCurrentAgentWork(
  companyId: string,
  agentId: string | null,
): AgentWork {
  const liveStatus = useContainerLiveStatus(companyId, agentId);
  const { receivedFromAbove } = useContainerIssues(companyId, agentId);

  // All live runs for the company. Cached with the same key the rest of the
  // app uses so we share the cache (no extra network request when
  // LiveUpdatesProvider already populated it).
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(companyId),
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId),
    enabled: !!companyId && agentId !== null,
    refetchInterval: 5000,
  });

  // If this agent has a live run, fetch the issue it's locked against.
  const activeRunIssueId = useMemo<string | null>(() => {
    if (!liveRuns || agentId === null) return null;
    const run = liveRuns.find(
      (r) => r.agentId === agentId && r.status === "running" && r.issueId,
    );
    return run?.issueId ?? null;
  }, [liveRuns, agentId]);

  const { data: activeRunIssue } = useQuery({
    queryKey: activeRunIssueId
      ? queryKeys.issues.detail(activeRunIssueId)
      : ["_no_active_run"],
    queryFn: () => issuesApi.get(activeRunIssueId!),
    enabled: !!activeRunIssueId,
  });

  return useMemo<AgentWork>(() => {
    if (agentId === null) {
      return { status: "sleeping", activeIssue: null };
    }

    // Priority 1: the live-run's target issue.
    if (activeRunIssue) {
      return { status: "running", activeIssue: activeRunIssue };
    }

    // Priority 2: most-recent in_progress issue assigned to this agent.
    const inProgress = receivedFromAbove.find((i) => i.status === "in_progress");
    if (inProgress) {
      // Live-status said running-adjacent but no run carries the issueId
      // yet; treat as running for the UX but with the fallback issue.
      const status: AgentWorkStatus = liveStatus === "running" ? "running" : "idle";
      return { status, activeIssue: inProgress };
    }

    // Priority 3: a queued todo that this agent should pick up next.
    const todo = receivedFromAbove.find((i) => i.status === "todo");
    if (todo) {
      return { status: "idle", activeIssue: todo };
    }

    // Priority 4: nothing on the plate.
    return { status: "sleeping", activeIssue: null };
  }, [agentId, activeRunIssue, receivedFromAbove, liveStatus]);
}
