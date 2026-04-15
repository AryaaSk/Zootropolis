import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  readZootropolisLayer,
  type Agent,
  type ZootropolisLayer,
} from "@paperclipai/shared";
import { cn } from "@/lib/utils";
import { agentsApi } from "../../../api/agents";
import { queryKeys } from "../../../lib/queryKeys";

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
 * Minimap — 5-layer zoom stack in the top-right corner. The current depth
 * is highlighted; ancestor layers are clickable jump targets.
 *
 * Phase U: dark glass treatment, semantic tokens, primary-tinted "current"
 * pill instead of palette.accent.
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
      className="pointer-events-auto absolute right-4 top-4 z-10 flex w-[112px] flex-col gap-0.5 rounded-md border border-border bg-card/95 p-2 text-foreground shadow-sm backdrop-blur-md"
    >
      <div className="px-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
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
            className={cn(
              "flex items-center justify-between rounded-md px-2 py-1 text-[11px] capitalize transition-colors disabled:cursor-default",
              isCurrent
                ? "bg-primary text-primary-foreground"
                : canJump
                  ? "text-foreground hover:bg-accent hover:text-accent-foreground"
                  : "text-muted-foreground/50",
            )}
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
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                isCurrent
                  ? "bg-primary-foreground"
                  : canJump
                    ? "bg-muted-foreground/60"
                    : "bg-muted-foreground/20",
              )}
            />
          </button>
        );
      })}
    </aside>
  );
}
