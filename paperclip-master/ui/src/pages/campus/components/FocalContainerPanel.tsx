import { useNavigate } from "@/lib/router";
import { AgentScreenBody, AgentIssuesLineupBody } from "./AgentScreen";

interface FocalContainerPanelProps {
  companyId: string;
  /** null = the implicit campus root with no single owning agent. */
  agentId: string | null;
  /** Optional label ("Campus" / container layer) shown as a muted overline. */
  label?: string;
}

/**
 * Phase W3 — 2D bottom-left panel showing the current container's state.
 *
 * Earlier iterations tried to float the focal screen as a 3D plane inside
 * the scene, but drei's <Html transform distanceFactor> shrank the HTML
 * to unreadable sizes at distant cameras and a big 3D plane occluded
 * other scene elements. The 2D panel side-steps both: always the same
 * size, always readable, stays out of the camera's way.
 *
 * Phase W5 — now mounts both sections vertically (same as the AgentView
 * dual-screen arrangement, but stacked):
 *
 *   ┌────────────────────────────┐
 *   │ State + active issue       │ ← AgentScreenBody
 *   ├────────────────────────────┤
 *   │ Pending issues (scrollable)│ ← AgentIssuesLineupBody
 *   └────────────────────────────┘
 *
 * For the campus root (agentId = null), the lineup section is hidden —
 * it only makes sense for an agent that owns issues.
 */
export function FocalContainerPanel({
  companyId,
  agentId,
  label,
}: FocalContainerPanelProps) {
  // Bodies don't call any router hooks themselves so that they can also
  // be rendered inside drei's <Html> portal (which uses a fresh React
  // root). Pass the prefix-aware navigate as a callback.
  const navigate = useNavigate();
  return (
    <div
      aria-label="Current container summary"
      // Phase X4 — bumped 1.4× in both axes (440→616 wide, 72vh→90vh
      // tall) so the focal panel really dominates over the in-scene
      // child screens.
      className="pointer-events-auto absolute bottom-4 left-4 z-10 flex max-h-[90vh] w-[616px] flex-col overflow-hidden rounded-lg border border-border bg-card/95 text-foreground text-sm shadow-lg backdrop-blur-md"
    >
      {label && (
        <div className="border-b border-border/60 px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
      )}
      {/* State + active issue (always shown) */}
      <div className="flex-shrink-0">
        <AgentScreenBody
          companyId={companyId}
          agentId={agentId}
          variant="focal"
          navigate={navigate}
        />
      </div>
      {/* Pending-issues lineup. Hidden for the implicit campus root since
          it has no single agent that owns a queue. */}
      {agentId && (
        <div className="flex min-h-0 flex-1 flex-col border-t border-border/60">
          <AgentIssuesLineupBody
            companyId={companyId}
            agentId={agentId}
            navigate={navigate}
          />
        </div>
      )}
    </div>
  );
}
