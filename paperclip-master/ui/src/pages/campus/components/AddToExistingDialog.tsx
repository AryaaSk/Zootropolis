import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useNavigate } from "@/lib/router";
import {
  readZootropolisLayer,
  type Agent,
  type ZootropolisLayer,
} from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { agentsApi } from "../../../api/agents";
import { queryKeys } from "../../../lib/queryKeys";

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
      return null;
    case "agent":
      return "agent";
    default:
      return null;
  }
}

interface AddToExistingButtonProps {
  companyId: string;
  self: Agent;
  parentLayer: ZootropolisLayer;
}

/**
 * Phase I3 — "+ Add to existing <parent-layer>" button. Pairs with the
 * WrapInButton (creates a NEW parent); this one joins EXISTING structure.
 *
 * Phase U: shadcn Buttons + semantic tokens.
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
      .filter((a) => a.id !== self.reportsTo)
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
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="w-full justify-start"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={
          disabled
            ? `No ${parentLayer} exists yet — wrap in a new one first.`
            : undefined
        }
      >
        <Plus size={12} />
        Add to existing {parentLayer}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-popover p-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Add to which {parentLayer}?
      </div>
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {candidates.length === 0 ? (
          <div className="text-[11px] italic text-muted-foreground">
            No existing {parentLayer}s to add to.
          </div>
        ) : (
          candidates.map((c) => (
            <Button
              key={c.id}
              type="button"
              variant="ghost"
              size="xs"
              className="w-full justify-start"
              onClick={() => onPick(c)}
              disabled={submitting}
            >
              {c.name}
            </Button>
          ))
        )}
      </div>
      {error && <div className="text-[10px] text-destructive">{error}</div>}
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => setOpen(false)}
          disabled={submitting}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
