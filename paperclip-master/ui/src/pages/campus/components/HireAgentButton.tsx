import { useState } from "react";
import { Plus } from "lucide-react";
import { useNavigate, useParams } from "@/lib/router";
import { HireForm } from "./ContainerInspector";
import { useCampusRootAgent } from "../hooks/useCampusRootAgent";

/**
 * Phase N3 — always-visible "+ Hire agent" affordance in the top-right of
 * the campus canvas. Sits below the Minimap.
 *
 * Phase U: dark glass pill matching the rest of the campus chrome.
 */
export function HireAgentButton() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // When the company has an implicit campus agent, new hires are
  // children of IT (not siblings at reportsTo=null). Preserves the
  // "one tree rooted at campus" invariant.
  const { parentId: campusParentId } = useCampusRootAgent(companyId);

  if (!companyId) return null;

  return (
    <div
      className="pointer-events-none absolute right-4 top-52 z-10"
      style={{ width: open ? 280 : "auto" }}
    >
      {open ? (
        <div className="pointer-events-auto rounded-md border border-border bg-card/95 p-1 shadow-sm backdrop-blur-md">
          <HireForm
            companyId={companyId}
            parentAgentId={campusParentId}
            layer="agent"
            onCancel={() => setOpen(false)}
            onCreated={() => {
              setOpen(false);
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
          className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-1.5 text-sm font-medium text-foreground shadow-sm backdrop-blur-md transition-colors hover:bg-accent hover:text-accent-foreground"
          title="Hire a new leaf agent. You'll supply its runtime endpoint."
        >
          <Plus className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Hire agent</span>
        </button>
      )}
    </div>
  );
}
