import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  readZootropolisLayer,
  type Agent,
  type ZootropolisLayer,
} from "@paperclipai/shared";
import { agentsApi } from "../../../api/agents";
import { queryKeys } from "../../../lib/queryKeys";
import { palette } from "../palette";

/**
 * Top-down ordering used in the minimap (widest container at top, leaf at
 * bottom — matches the visual metaphor of zooming in).
 */
const LAYER_STACK: readonly ZootropolisLayer[] = [
  "campus",
  "building",
  "floor",
  "room",
  "agent",
] as const;

function inferLayerFromPath(pathname: string): ZootropolisLayer | null {
  if (pathname.includes("/agent/")) return "agent";
  if (pathname.includes("/room/")) return "room";
  if (pathname.includes("/floor/")) return "floor";
  if (pathname.includes("/building/")) return "building";
  return "campus";
}

/**
 * Minimap — 5-layer stack in a corner. A highlighted row marks the current
 * zoom level; clicking any layer above the current one jumps straight to
 * that ancestor (skipping intermediate hops). Clicking a layer below the
 * current depth is a no-op because we don't know which child to enter.
 */
export function Minimap() {
  const navigate = useNavigate();
  const location = useLocation();
  const { companyId, id } = useParams<{ companyId: string; id: string }>();

  const { data } = useQuery({
    queryKey: queryKeys.agents.list(companyId ?? ""),
    queryFn: () => agentsApi.list(companyId ?? ""),
    enabled: !!companyId,
  });

  const currentLayer = inferLayerFromPath(location.pathname) ?? "campus";

  // Map each ancestor layer → the href to jump to it. Built by walking up
  // reportsTo from the current agent.
  const ancestorHrefs = useMemo<Partial<Record<ZootropolisLayer, string>>>(() => {
    const out: Partial<Record<ZootropolisLayer, string>> = {};
    if (!companyId) return out;
    out.campus = `/campus/${companyId}`;
    if (!id) return out;

    const agents: Agent[] = data ?? [];
    const byId = new Map<string, Agent>();
    for (const a of agents) byId.set(a.id, a);

    let cursor: Agent | undefined = byId.get(id);
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      const layer = readZootropolisLayer(cursor.metadata);
      if (layer && layer !== "campus") {
        out[layer] = `/campus/${companyId}/${layer}/${cursor.id}`;
      }
      cursor = cursor.reportsTo ? byId.get(cursor.reportsTo) : undefined;
    }
    return out;
  }, [data, companyId, id]);

  return (
    <aside
      aria-label="Campus zoom minimap"
      className="pointer-events-auto absolute right-4 top-4 z-10 flex w-[96px] flex-col gap-1 rounded-md border p-2 shadow-sm backdrop-blur-md"
      style={{
        backgroundColor: `${palette.bone}d9`,
        borderColor: palette.ink,
      }}
    >
      <div
        className="px-1 text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: palette.deepBlue }}
      >
        Zoom
      </div>
      {LAYER_STACK.map((layer) => {
        const isCurrent = layer === currentLayer;
        const href = ancestorHrefs[layer];
        const canJump = !!href && !isCurrent;
        return (
          <button
            key={layer}
            type="button"
            disabled={!canJump}
            onClick={() => {
              if (canJump && href) navigate(href);
            }}
            className="flex items-center justify-between rounded px-2 py-1 text-[11px] capitalize transition-colors disabled:cursor-default"
            style={{
              backgroundColor: isCurrent ? palette.accent : "transparent",
              color: isCurrent
                ? palette.ink
                : canJump
                  ? palette.deepBlue
                  : palette.dustBlue,
              cursor: canJump ? "pointer" : "default",
              opacity: !canJump && !isCurrent ? 0.5 : 1,
            }}
            title={
              isCurrent
                ? `Current: ${layer}`
                : canJump
                  ? `Jump to ${layer}`
                  : `${layer} (not in current path)`
            }
          >
            <span>{layer}</span>
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor: isCurrent ? palette.ink : palette.dustBlue,
                opacity: isCurrent ? 1 : canJump ? 0.6 : 0.25,
              }}
            />
          </button>
        );
      })}
    </aside>
  );
}
