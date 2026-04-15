import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveEvent } from "@paperclipai/shared";
import { issuesApi } from "@/api/issues";
import { useLiveEventSubscription } from "../../../context/LiveUpdatesProvider";

export interface DelegationEvent {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  /** Monotonic id so multiple simultaneous events can coexist. */
  seq: number;
}

interface UseDelegationFeedOptions {
  /**
   * Resolver: given (fromAgentId, toAgentId), return `true` iff BOTH agents
   * are visible in the current view. The caller owns the child-positions
   * map, so only delegations between agents we can render get emitted.
   */
  accept: (fromAgentId: string, toAgentId: string) => boolean;
}

/**
 * Phase S6 — "delegation feed" subscription.
 *
 * Listens for `activity.logged` events with action === "issue.created",
 * fetches the full issue to learn its `parentId` (the parent issue's
 * assignee = delegator) and `assigneeAgentId` (the new delegatee), and
 * emits a `DelegationEvent` iff the caller's `accept` filter matches.
 *
 * Parent look-up is cached per issue id so a flurry of events doesn't
 * hammer the API.
 */
export function useDelegationFeed({ accept }: UseDelegationFeedOptions) {
  const [events, setEvents] = useState<DelegationEvent[]>([]);
  const seqRef = useRef(0);
  const acceptRef = useRef(accept);
  acceptRef.current = accept;

  const consume = useCallback((id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const handleIssueCreated = useCallback(async (issueId: string) => {
    try {
      const issue = await issuesApi.get(issueId);
      const assigneeAgentId = issue.assigneeAgentId ?? null;
      const parentId = issue.parentId ?? null;
      if (!assigneeAgentId || !parentId) return;
      const parent = await issuesApi.get(parentId);
      const delegatorAgentId = parent.assigneeAgentId ?? null;
      if (!delegatorAgentId) return;
      if (!acceptRef.current(delegatorAgentId, assigneeAgentId)) return;
      seqRef.current += 1;
      const evt: DelegationEvent = {
        id: `${issueId}-${seqRef.current}`,
        fromAgentId: delegatorAgentId,
        toAgentId: assigneeAgentId,
        seq: seqRef.current,
      };
      setEvents((prev) => [...prev, evt]);
    } catch {
      // Swallow — feed is decorative; a transient fetch failure just
      // means we skip this delegation's animation.
    }
  }, []);

  const onEvent = useCallback(
    (event: LiveEvent) => {
      if (event.type !== "activity.logged") return;
      const payload = event.payload ?? {};
      const action = typeof payload.action === "string" ? payload.action : null;
      if (action !== "issue.created") return;
      const issueId = typeof payload.entityId === "string" ? payload.entityId : null;
      if (!issueId) return;
      void handleIssueCreated(issueId);
    },
    [handleIssueCreated],
  );

  useLiveEventSubscription(onEvent);

  // Safety net: if a traveller never calls onComplete (e.g. mount/unmount race),
  // auto-expire events after 5s.
  useEffect(() => {
    if (events.length === 0) return;
    const t = window.setTimeout(() => {
      setEvents((prev) => prev.slice(1));
    }, 5000);
    return () => window.clearTimeout(t);
  }, [events.length]);

  return { events, consume };
}
