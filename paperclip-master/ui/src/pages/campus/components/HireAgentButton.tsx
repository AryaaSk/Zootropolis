import { useState } from "react";
import { Plus } from "lucide-react";
import { useNavigate, useParams } from "@/lib/router";
import { HireForm } from "./ContainerInspector";
import { palette } from "../palette";

/**
 * Phase N3 — always-visible "+ Hire agent" affordance in the top-right of
 * the campus canvas. Clicks expand to the existing HireForm inline (same
 * component the empty-state and drawer Hire section use), asking for a
 * name + runtime endpoint. On success, navigates into the new leaf's
 * AgentView so the user can immediately decide whether to wrap it in a
 * room / add it to an existing one.
 *
 * Mounted by CampusOverlay as a sibling of ExitCampusButton, Breadcrumb,
 * and Minimap. Visible at every zoom layer.
 */
export function HireAgentButton() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (!companyId) return null;

  return (
    // Positioned below the Minimap (which lives at top-4 right-4 and is
    // ~180px tall). top-52 (208px) keeps us clear with a little gap.
    // If the Minimap ever grows/shrinks, adjust in tandem or consider
    // wrapping both in a flex column in CampusOverlay.
    <div
      className="pointer-events-none absolute right-4 top-52 z-10"
      style={{ width: open ? 280 : "auto" }}
    >
      {open ? (
        <div className="pointer-events-auto">
          <HireForm
            companyId={companyId}
            parentAgentId={null}
            layer="agent"
            onCancel={() => setOpen(false)}
            onCreated={() => {
              setOpen(false);
              // Redirect into the freshly hired agent. The agents-list
              // query has already been invalidated by HireForm; a short
              // tick gives the cache time to refill before the new
              // AgentView tries to read it, but CampusView will redirect
              // again via N2 if this is the only root.
              navigate(`/campus/${companyId}`);
            }}
            submitLabel="Hire"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Hire a new agent"
          className="pointer-events-auto flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium shadow-sm backdrop-blur-md transition-colors"
          style={{
            backgroundColor: `${palette.bone}d9`,
            borderColor: palette.ink,
            color: palette.ink,
          }}
          title="Hire a new leaf agent. You'll supply its runtime endpoint."
        >
          <Plus className="h-3.5 w-3.5" style={{ color: palette.deepBlue }} />
          <span>Hire agent</span>
        </button>
      )}
    </div>
  );
}
