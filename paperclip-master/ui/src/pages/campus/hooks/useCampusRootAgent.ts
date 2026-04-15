import type { Agent } from "@paperclipai/shared";
import { readZootropolisLayer } from "@paperclipai/shared";
import { useContainerChildren } from "./useContainerChildren";

export interface CampusRootHandle {
  /** True while the first (roots) query is resolving. */
  loading: boolean;
  /** The implicit campus agent, if one exists for this company. */
  agent: Agent | null;
  /** Convenience — `agent?.id ?? null`, used as the parent id for top-level hires. */
  parentId: string | null;
}

/**
 * Resolve the "implicit campus" agent for a company — the singleton
 * agent with `reportsTo=null` and `metadata.zootropolis.layer === "campus"`.
 * When present, other views treat IT as the top-level parent for hire
 * flows and child listings (see CampusScene for the same unfolding).
 *
 * For companies that don't yet have a campus agent, returns `null`;
 * callers fall back to `parentId = null` which creates a sibling root.
 * (Auto-provisioning a campus on company creation is a server-side
 * follow-up that lives alongside this change.)
 */
export function useCampusRootAgent(companyId: string | null | undefined): CampusRootHandle {
  const { children, loading } = useContainerChildren(companyId ?? "", null);
  if (loading) return { loading: true, agent: null, parentId: null };
  if (children.length !== 1) return { loading: false, agent: null, parentId: null };
  const only = children[0];
  if (readZootropolisLayer(only.metadata) !== "campus") {
    return { loading: false, agent: null, parentId: null };
  }
  return { loading: false, agent: only, parentId: only.id };
}
