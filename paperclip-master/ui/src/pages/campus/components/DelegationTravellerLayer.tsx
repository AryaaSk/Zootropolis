import { useCallback, useMemo } from "react";
import { DelegationTraveller } from "./DelegationTraveller";
import { useDelegationFeed } from "../hooks/useDelegationFeed";

interface KnownAgent {
  id: string;
  position: [number, number, number];
}

interface DelegationTravellerLayerProps {
  /**
   * Map of agents currently rendered in this view, keyed by agent id with
   * their world-space position. The layer only animates delegations whose
   * fromAgentId AND toAgentId are both in this list.
   */
  agents: KnownAgent[];
  /** Y offset added to traveller start/end positions so the sparkle lifts above each mesh. */
  liftY?: number;
}

/**
 * Mount this inside a Canvas scene to visualise delegations in real
 * time: whenever an agent in this view delegates (issue.created with a
 * parent) to another agent in this view, a glowing sparkle arcs between
 * them over ~1.6s.
 */
export function DelegationTravellerLayer({ agents, liftY = 1.6 }: DelegationTravellerLayerProps) {
  const byId = useMemo(() => {
    const m = new Map<string, [number, number, number]>();
    for (const a of agents) m.set(a.id, a.position);
    return m;
  }, [agents]);

  const accept = useCallback(
    (fromAgentId: string, toAgentId: string) => byId.has(fromAgentId) && byId.has(toAgentId),
    [byId],
  );

  const { events, consume } = useDelegationFeed({ accept });

  return (
    <group>
      {events.map((evt) => {
        const from = byId.get(evt.fromAgentId);
        const to = byId.get(evt.toAgentId);
        if (!from || !to) return null;
        return (
          <DelegationTraveller
            key={evt.id}
            from={[from[0], from[1] + liftY, from[2]]}
            to={[to[0], to[1] + liftY, to[2]]}
            onComplete={() => consume(evt.id)}
          />
        );
      })}
    </group>
  );
}
