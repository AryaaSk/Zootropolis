import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveEvent } from "@paperclipai/shared";
import { useLiveEventSubscription } from "../../../context/LiveUpdatesProvider";

/**
 * Per-agent live status derived from Paperclip's heartbeat.run.status events.
 *
 * Event mapping (the underlying event type is always `heartbeat.run.status`
 * with a payload.status; Zootropolis names map as follows):
 *   - payload.status === "running"    → heartbeat.run.started    → "running"
 *   - payload.status === "succeeded"  → heartbeat.run.completed  → "completed" (flash ~1s → "idle")
 *   - payload.status === "failed"
 *       or "timed_out" or "cancelled" → heartbeat.run.failed     → "failed"    (sustain ~3s → "idle")
 *
 * A `pulseKey` counter increments on each "started" event so components can
 * trigger a one-shot scale tween via useFrame without depending on React state.
 */
export type AgentLiveStatus = "idle" | "running" | "completed" | "failed";

export interface AgentLiveStatusHandle {
  status: AgentLiveStatus;
  /** Increments on each heartbeat.run.started for this agent. */
  pulseKey: number;
}

const COMPLETED_HOLD_MS = 1000;
const FAILED_HOLD_MS = 3000;

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function useAgentLiveStatus(agentId: string | null | undefined): AgentLiveStatusHandle {
  const [status, setStatus] = useState<AgentLiveStatus>("idle");
  const [pulseKey, setPulseKey] = useState(0);
  const holdTimerRef = useRef<number | null>(null);

  const clearHold = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearHold();
  }, [clearHold]);

  const onEvent = useCallback(
    (event: LiveEvent) => {
      if (!agentId) return;
      if (event.type !== "heartbeat.run.status") return;
      const payload = event.payload ?? {};
      const eventAgentId = readString(payload.agentId);
      if (eventAgentId !== agentId) return;
      const runStatus = readString(payload.status);
      if (!runStatus) return;

      if (runStatus === "running") {
        clearHold();
        setStatus("running");
        setPulseKey((k) => k + 1);
        return;
      }
      if (runStatus === "succeeded") {
        clearHold();
        setStatus("completed");
        holdTimerRef.current = window.setTimeout(() => {
          holdTimerRef.current = null;
          setStatus("idle");
        }, COMPLETED_HOLD_MS);
        return;
      }
      if (runStatus === "failed" || runStatus === "timed_out" || runStatus === "cancelled") {
        clearHold();
        setStatus("failed");
        holdTimerRef.current = window.setTimeout(() => {
          holdTimerRef.current = null;
          setStatus("idle");
        }, FAILED_HOLD_MS);
      }
    },
    [agentId, clearHold],
  );

  useLiveEventSubscription(onEvent);

  return { status, pulseKey };
}
