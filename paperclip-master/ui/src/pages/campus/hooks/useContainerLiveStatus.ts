import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Agent, LiveEvent } from "@paperclipai/shared";
import { agentsApi } from "../../../api/agents";
import { queryKeys } from "../../../lib/queryKeys";
import { useLiveEventSubscription } from "../../../context/LiveUpdatesProvider";

/**
 * useContainerLiveStatus — a container (room/floor/building/campus) is
 * "running" if any descendant leaf is currently running.
 *
 * Mirrors `useContainerChildren`'s data source (the company-wide agents list
 * already cached by React Query) so there's no extra fetch. Tracks which
 * descendant agent ids are currently running by listening to the same
 * heartbeat.run.status stream as `useAgentLiveStatus`.
 *
 * Pass `agentId === null` to aggregate across the whole campus.
 */
export type ContainerLiveStatus = "idle" | "running";

const COMPLETED_HOLD_MS = 1000;
const FAILED_HOLD_MS = 3000;

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function collectDescendantIds(
  agents: Agent[],
  rootId: string | null,
): Set<string> {
  const childrenOf = new Map<string | null, Agent[]>();
  for (const a of agents) {
    const key = a.reportsTo ?? null;
    const bucket = childrenOf.get(key);
    if (bucket) bucket.push(a);
    else childrenOf.set(key, [a]);
  }

  const out = new Set<string>();
  const queue: (string | null)[] = [rootId];
  // For the campus aggregate (rootId === null) we treat every agent as a
  // descendant so activity anywhere lights the campus ground plane.
  if (rootId === null) {
    for (const a of agents) out.add(a.id);
    return out;
  }
  while (queue.length > 0) {
    const parent = queue.shift() ?? null;
    const kids = childrenOf.get(parent) ?? [];
    for (const k of kids) {
      if (!out.has(k.id)) {
        out.add(k.id);
        queue.push(k.id);
      }
    }
  }
  return out;
}

export function useContainerLiveStatus(
  companyId: string,
  agentId: string | null,
): ContainerLiveStatus {
  const { data } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const descendantIds = useMemo(
    () => collectDescendantIds(data ?? [], agentId),
    [data, agentId],
  );

  // Use a ref set of running ids so subscriber callbacks mutate without
  // re-subscribing. React state (`runningCount`) is updated coarsely — only
  // when the count transitions between 0 and >0 does the container re-render.
  const runningIdsRef = useRef<Set<string>>(new Set());
  const holdTimersRef = useRef<Map<string, number>>(new Map());
  const [runningCount, setRunningCount] = useState(0);

  // When the descendant set changes, drop any tracked runners that are no
  // longer in the tree.
  useEffect(() => {
    const runners = runningIdsRef.current;
    let changed = false;
    for (const id of runners) {
      if (!descendantIds.has(id)) {
        runners.delete(id);
        changed = true;
      }
    }
    if (changed) setRunningCount(runners.size);
  }, [descendantIds]);

  useEffect(() => {
    const timers = holdTimersRef.current;
    return () => {
      for (const t of timers.values()) window.clearTimeout(t);
      timers.clear();
    };
  }, []);

  const onEvent = useCallback(
    (event: LiveEvent) => {
      if (event.type !== "heartbeat.run.status") return;
      const payload = event.payload ?? {};
      const eventAgentId = readString(payload.agentId);
      if (!eventAgentId || !descendantIds.has(eventAgentId)) return;
      const runStatus = readString(payload.status);
      if (!runStatus) return;

      const runners = runningIdsRef.current;
      const timers = holdTimersRef.current;

      const clearHold = (id: string) => {
        const t = timers.get(id);
        if (t !== undefined) {
          window.clearTimeout(t);
          timers.delete(id);
        }
      };

      if (runStatus === "running") {
        clearHold(eventAgentId);
        if (!runners.has(eventAgentId)) {
          runners.add(eventAgentId);
          setRunningCount(runners.size);
        }
        return;
      }

      if (
        runStatus === "succeeded" ||
        runStatus === "failed" ||
        runStatus === "timed_out" ||
        runStatus === "cancelled"
      ) {
        // Keep the agent "active" briefly so the container's outline glow
        // matches the per-agent completed/failed flash window.
        if (!runners.has(eventAgentId)) return;
        clearHold(eventAgentId);
        const hold = runStatus === "succeeded" ? COMPLETED_HOLD_MS : FAILED_HOLD_MS;
        const timer = window.setTimeout(() => {
          timers.delete(eventAgentId);
          if (runners.delete(eventAgentId)) {
            setRunningCount(runners.size);
          }
        }, hold);
        timers.set(eventAgentId, timer);
      }
    },
    [descendantIds],
  );

  useLiveEventSubscription(onEvent);

  return runningCount > 0 ? "running" : "idle";
}
