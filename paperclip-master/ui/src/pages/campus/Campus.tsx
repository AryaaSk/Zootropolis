import { useParams } from "@/lib/router";
import { AgentView } from "./views/AgentView";
import { palette } from "./palette";

/**
 * Placeholder for layers > agent. Implemented in later phases (B2/B3).
 */
export function ComingInLaterPhase({ layer }: { layer: string }) {
  const { companyId, id } = useParams<{ companyId: string; id: string }>();
  return (
    <div
      className="flex h-[calc(100vh-0px)] w-full items-center justify-center"
      style={{ backgroundColor: palette.sky, color: palette.ink }}
    >
      <div className="rounded-lg border px-6 py-4" style={{ borderColor: palette.ink }}>
        <div className="text-lg font-semibold">{layer} view — coming in a later phase</div>
        <div className="mt-1 text-sm opacity-70">
          company: {companyId ?? "?"} · id: {id ?? "?"}
        </div>
      </div>
    </div>
  );
}

/**
 * Campus — route root. For B1, dispatches all campus routes to AgentView or
 * a placeholder. Real per-layer rendering lands in B2..B5.
 */
export function Campus() {
  return <AgentView />;
}

export function BuildingViewPlaceholder() {
  return <ComingInLaterPhase layer="building" />;
}
export function FloorViewPlaceholder() {
  return <ComingInLaterPhase layer="floor" />;
}
export function RoomViewPlaceholder() {
  return <ComingInLaterPhase layer="room" />;
}
export function CampusRootPlaceholder() {
  return <ComingInLaterPhase layer="campus" />;
}
