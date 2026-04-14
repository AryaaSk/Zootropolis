import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Issue } from "@paperclipai/shared";
import { issuesApi } from "../../../api/issues";

export interface ContainerIssues {
  /** Issues this container CREATED (delegated to its children). */
  issuedDown: Issue[];
  /** Issues ASSIGNED to this container (its tasks from its parent). */
  receivedFromAbove: Issue[];
  loading: boolean;
}

const EMPTY_ISSUES: Issue[] = [];

/**
 * useContainerIssues — surface the two sides of a container's delegation
 * contract (see design.md §3 + §4):
 *   - `issuedDown`: work this agent has delegated to its direct reports
 *     (createdByAgentId === agentId on the server).
 *   - `receivedFromAbove`: work assigned TO this agent (assigneeAgentId ===
 *     agentId on the server) — i.e. the task from its parent that justifies
 *     its existence.
 *
 * When `agentId === null` (campus root) both lists are empty: the campus has
 * no parent and nothing delegated downward yet at the campus level.
 *
 * The server already orders by updatedAt desc; we preserve that order.
 *
 * Composes with the Zootropolis A1 `requesterAgentId` visibility scoping
 * server-side (the scoping filter is applied on top of these AND-ed).
 */
export function useContainerIssues(
  companyId: string,
  agentId: string | null,
): ContainerIssues {
  const enabled = !!companyId && agentId !== null;

  const issuedQuery = useQuery({
    queryKey: ["zootropolis", "container-issues", companyId, agentId, "issued"] as const,
    queryFn: () => issuesApi.list(companyId, { createdByAgentId: agentId ?? undefined }),
    enabled,
  });

  const receivedQuery = useQuery({
    queryKey: ["zootropolis", "container-issues", companyId, agentId, "received"] as const,
    queryFn: () => issuesApi.list(companyId, { assigneeAgentId: agentId ?? undefined }),
    enabled,
  });

  return useMemo<ContainerIssues>(() => {
    if (agentId === null) {
      return { issuedDown: EMPTY_ISSUES, receivedFromAbove: EMPTY_ISSUES, loading: false };
    }
    return {
      issuedDown: issuedQuery.data ?? EMPTY_ISSUES,
      receivedFromAbove: receivedQuery.data ?? EMPTY_ISSUES,
      loading: issuedQuery.isLoading || receivedQuery.isLoading,
    };
  }, [agentId, issuedQuery.data, issuedQuery.isLoading, receivedQuery.data, receivedQuery.isLoading]);
}
