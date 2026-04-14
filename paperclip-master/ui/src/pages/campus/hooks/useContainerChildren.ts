import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { agentsApi } from "../../../api/agents";
import { queryKeys } from "../../../lib/queryKeys";
import {
  readZootropolisLayer,
  type Agent,
  type ZootropolisLayer,
  ZOOTROPOLIS_LAYERS,
} from "@paperclipai/shared";

export interface ContainerChildren {
  self: Agent | null;
  parent: Agent | null;
  children: Agent[];
  loading: boolean;
}

/**
 * Layer order (leaf → root): agent, room, floor, building, campus.
 * Returns the layer one step *down* from the given layer (i.e. the layer of
 * its children). Returns undefined if there's no layer below (already a leaf).
 */
function nextLayerDown(layer: ZootropolisLayer | undefined): ZootropolisLayer | undefined {
  if (!layer) return undefined;
  const idx = ZOOTROPOLIS_LAYERS.indexOf(layer);
  if (idx <= 0) return undefined;
  return ZOOTROPOLIS_LAYERS[idx - 1];
}

/**
 * useContainerChildren — fetch the org via the existing agents-list endpoint
 * and return a slice of the tree centered on `agentId`.
 *
 * - `agentId === null`: returns the campus-level roots (agents whose
 *   `reportsTo === null` and whose layer is `campus`, with a fallback to all
 *   roots if no campus-tagged roots exist).
 * - `agentId === <id>`: returns `self`, `parent` (its `reportsTo` agent if
 *   any), and `children` (agents with `reportsTo === agentId`). When `self`
 *   has a layer tag, children are filtered to the next layer down — but if
 *   no children carry the expected layer tag, all reports are returned
 *   defensively (so demos with partial metadata don't render empty).
 */
export function useContainerChildren(
  companyId: string,
  agentId: string | null,
): ContainerChildren {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  return useMemo<ContainerChildren>(() => {
    const agents = data ?? [];
    const byId = new Map<string, Agent>();
    const childrenOf = new Map<string | null, Agent[]>();
    for (const a of agents) {
      byId.set(a.id, a);
      const key = a.reportsTo ?? null;
      const bucket = childrenOf.get(key);
      if (bucket) bucket.push(a);
      else childrenOf.set(key, [a]);
    }

    if (agentId === null) {
      const allRoots = childrenOf.get(null) ?? [];
      const campusRoots = allRoots.filter(
        (a) => readZootropolisLayer(a.metadata) === "campus",
      );
      const roots = campusRoots.length > 0 ? campusRoots : allRoots;
      return {
        self: null,
        parent: null,
        children: roots,
        loading: isLoading,
      };
    }

    const self = byId.get(agentId) ?? null;
    const parent = self?.reportsTo ? byId.get(self.reportsTo) ?? null : null;
    const reports = childrenOf.get(agentId) ?? [];

    const selfLayer = readZootropolisLayer(self?.metadata);
    const wantedChildLayer = nextLayerDown(selfLayer);
    let children = reports;
    if (wantedChildLayer) {
      const filtered = reports.filter(
        (a) => readZootropolisLayer(a.metadata) === wantedChildLayer,
      );
      // Defensive fallback: if metadata is missing on the children, just
      // include all reports rather than render an empty container.
      if (filtered.length > 0) children = filtered;
    }

    return { self, parent, children, loading: isLoading };
  }, [data, isLoading, agentId]);
}

const ANIMAL_PALETTE_KEYS = [
  "terracotta",
  "dustBlue",
  "clay",
  "accent",
  "cream",
  "bone",
] as const;

export type AnimalPaletteKey = (typeof ANIMAL_PALETTE_KEYS)[number];

/**
 * Deterministic color pick for an agent — same id always gets the same color.
 * Cycles through the agent-friendly subset of the palette (skipping
 * ground/sky/ink which are reserved for environment).
 */
export function pickAnimalPaletteKey(agentId: string): AnimalPaletteKey {
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = (hash * 31 + agentId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % ANIMAL_PALETTE_KEYS.length;
  return ANIMAL_PALETTE_KEYS[idx]!;
}
