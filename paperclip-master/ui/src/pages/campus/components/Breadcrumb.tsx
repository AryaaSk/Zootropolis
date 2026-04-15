import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import {
  readZootropolisLayer,
  type Agent,
  type ZootropolisLayer,
} from "@paperclipai/shared";
import { agentsApi } from "../../../api/agents";
import { queryKeys } from "../../../lib/queryKeys";

interface Crumb {
  label: string;
  layer: ZootropolisLayer | "campus-root";
  href: string;
}

function inferLayerFromPath(pathname: string): ZootropolisLayer | null {
  if (pathname.includes("/agent/")) return "agent";
  if (pathname.includes("/room/")) return "room";
  if (pathname.includes("/floor/")) return "floor";
  if (pathname.includes("/building/")) return "building";
  return null;
}

/**
 * Breadcrumb — HTML overlay above the 3D <Canvas>. Walks reportsTo to render
 * Campus › Building › Floor › Room › Agent.
 *
 * Phase U: restyled to use the same dark glass treatment as the rest of the
 * campus chrome (bg-card/95 + border-border + Lucide chevron separators).
 */
export function Breadcrumb() {
  const navigate = useNavigate();
  const location = useLocation();
  const { companyId, id } = useParams<{ companyId: string; id: string }>();

  const { data } = useQuery({
    queryKey: queryKeys.agents.list(companyId ?? ""),
    queryFn: () => agentsApi.list(companyId ?? ""),
    enabled: !!companyId,
  });

  const crumbs = useMemo<Crumb[]>(() => {
    const agents: Agent[] = data ?? [];
    const byId = new Map<string, Agent>();
    for (const a of agents) byId.set(a.id, a);

    const campusHref = companyId ? `/campus/${companyId}` : "/";
    const roots: Crumb[] = [
      { label: "Campus", layer: "campus-root", href: campusHref },
    ];
    if (!id) return roots;

    const chain: Agent[] = [];
    let cursor: Agent | undefined = byId.get(id);
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      chain.unshift(cursor);
      cursor = cursor.reportsTo ? byId.get(cursor.reportsTo) : undefined;
    }

    if (chain.length === 0) {
      const layerFromPath = inferLayerFromPath(location.pathname);
      if (layerFromPath && companyId) {
        roots.push({
          label: id,
          layer: layerFromPath,
          href: `/campus/${companyId}/${layerFromPath}/${id}`,
        });
      }
      return roots;
    }

    for (const agent of chain) {
      const layer = readZootropolisLayer(agent.metadata);
      if (layer === "campus") continue;
      const routeLayer: ZootropolisLayer = layer ?? "agent";
      roots.push({
        label: agent.name,
        layer: routeLayer,
        href: companyId ? `/campus/${companyId}/${routeLayer}/${agent.id}` : "#",
      });
    }

    return roots;
  }, [data, companyId, id, location.pathname]);

  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label="Campus breadcrumb"
      className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2"
    >
      <ol className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-border bg-card/95 px-3 py-1.5 text-sm font-medium text-foreground shadow-sm backdrop-blur-md">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li
              key={`${crumb.layer}-${crumb.href}-${i}`}
              className="flex items-center gap-0.5"
            >
              {i > 0 && (
                <ChevronRight
                  size={12}
                  aria-hidden
                  className="text-muted-foreground/60"
                />
              )}
              {isLast ? (
                <span
                  aria-current="page"
                  className="cursor-default px-1.5 text-foreground"
                >
                  {crumb.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate(crumb.href)}
                  className="cursor-pointer rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {crumb.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
