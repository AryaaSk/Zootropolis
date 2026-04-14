import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router";
import {
  readZootropolisLayer,
  type Agent,
  type ZootropolisLayer,
} from "@paperclipai/shared";
import { agentsApi } from "../../../api/agents";
import { queryKeys } from "../../../lib/queryKeys";
import { palette } from "../palette";

/** Route segment for a given container layer (keep in sync with ContainerInspector). */
function routeForLayer(layer: ZootropolisLayer): string | null {
  switch (layer) {
    case "room":
      return "room";
    case "floor":
      return "floor";
    case "building":
      return "building";
    case "campus":
      return null; // the campus root IS the canvas
    case "agent":
      return "agent";
    default:
      return null;
  }
}

interface AddToExistingButtonProps {
  companyId: string;
  self: Agent;
  /** The parent layer — agents at this layer are the candidates. */
  parentLayer: ZootropolisLayer;
}

/**
 * Phase I3 — "+ Add to existing <parent-layer>" button.
 *
 * Clicks open a small popover listing every agent in the company whose
 * metadata.zootropolis.layer matches `parentLayer`. Picking one PATCHes
 * self's reportsTo to that target. Pairs with WrapInButton (creates a
 * NEW parent); this one joins EXISTING structure.
 */
export function AddToExistingButton({
  companyId,
  self,
  parentLayer,
}: AddToExistingButtonProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
  });

  const candidates = useMemo(() => {
    const list = (agents as Agent[] | undefined) ?? [];
    return list
      .filter((a) => a.id !== self.id && readZootropolisLayer(a.metadata) === parentLayer)
      .filter((a) => a.id !== self.reportsTo) // hide current parent
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [agents, self.id, self.reportsTo, parentLayer]);

  const disabled = candidates.length === 0;

  const onPick = async (target: Agent) => {
    setSubmitting(true);
    setError(null);
    try {
      await agentsApi.update(self.id, { reportsTo: target.id }, companyId);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.agents.list(companyId),
      });
      // Navigate into the new parent so the user lands where their agent
      // now lives. For campus-layer parents, the canvas is the root.
      const route = routeForLayer(parentLayer);
      if (route) {
        navigate(`/campus/${companyId}/${route}/${target.id}`);
      } else {
        navigate(`/campus/${companyId}`);
      }
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={
          disabled
            ? `No ${parentLayer} exists yet — wrap in a new one first.`
            : undefined
        }
        className="w-full rounded-md border px-2 py-1.5 text-left text-xs font-medium disabled:opacity-40"
        style={{
          borderColor: palette.ink,
          backgroundColor: palette.bone,
          color: palette.ink,
        }}
      >
        + Add to existing {parentLayer}
      </button>
    );
  }

  return (
    <div
      className="flex flex-col gap-1.5 rounded-md border p-2"
      style={{ borderColor: palette.ink, backgroundColor: palette.cream }}
    >
      <div
        className="text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: palette.deepBlue }}
      >
        Add to which {parentLayer}?
      </div>
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {candidates.length === 0 ? (
          <div className="text-[11px] italic" style={{ color: `${palette.ink}88` }}>
            No existing {parentLayer}s to add to.
          </div>
        ) : (
          candidates.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c)}
              disabled={submitting}
              className="w-full rounded border px-2 py-1 text-left text-xs disabled:opacity-50"
              style={{
                borderColor: `${palette.ink}55`,
                backgroundColor: palette.bone,
                color: palette.ink,
              }}
            >
              {c.name}
            </button>
          ))
        )}
      </div>
      {error && (
        <div className="text-[10px]" style={{ color: palette.clay }}>
          {error}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={submitting}
          className="rounded border px-2 py-1 text-xs"
          style={{
            borderColor: `${palette.ink}55`,
            backgroundColor: palette.bone,
            color: palette.ink,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
