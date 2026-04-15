import { useCallback, useEffect, useRef, useState } from "react";
import type { Agent, ZootropolisPos } from "@paperclipai/shared";
import { useQueryClient } from "@tanstack/react-query";
import { agentsApi } from "@/api/agents";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Phase T4 — drag-to-reorder along a single integer axis.
 *
 * Used by BuildingView (vertical floor rank) and FloorView (horizontal
 * room slot). The hook computes a new integer slot from a pixel-space
 * delta, commits via PATCH metadata.zootropolis.pos, and swaps the
 * previous occupant of the target slot.
 */

const DRAG_THRESHOLD_PX = 8;

export interface RankDragState {
  agent: Agent;
  originSlot: number;
  currentSlot: number;
}

export type PosKind = ZootropolisPos["kind"];

interface UseRankDragOptions {
  companyId: string | undefined;
  /** `floorRank` stores rank, `rowSlot` stores slot. */
  kind: Extract<PosKind, "floorRank" | "rowSlot">;
  /** Current known siblings + their slots, for swap detection. */
  siblings: Array<{ agent: Agent; slot: number }>;
  /**
   * Pixels-per-slot along the drag axis. BuildingView's vertical
   * spacing is 3.2 world units at a typical zoom; callers pick a
   * reasonable pixel approximation (we recommend 80 for vertical
   * floor drags, 90 for horizontal room slots).
   */
  pixelsPerSlot: number;
  /** "vertical" uses deltaY (screen down = higher rank), "horizontal" uses deltaX. */
  axis: "vertical" | "horizontal";
  /** Total slot count for clamping. */
  slotCount: number;
}

export interface UseRankDragHandle {
  drag: RankDragState | null;
  isDragging: (agentId: string) => boolean;
  beginGesture: (
    agent: Agent,
    slot: number,
    event: { clientX: number; clientY: number },
  ) => void;
  /** True for ~250ms after a drop — suppresses the next navigation click. */
  wasJustDragged: () => boolean;
}

export function useRankDrag(options: UseRankDragOptions): UseRankDragHandle {
  const queryClient = useQueryClient();
  const [drag, setDrag] = useState<RankDragState | null>(null);
  const lastDragEndRef = useRef<number>(0);
  const pendingRef = useRef<{
    agent: Agent;
    slot: number;
    startX: number;
    startY: number;
  } | null>(null);
  const siblingsRef = useRef(options.siblings);
  siblingsRef.current = options.siblings;
  const companyIdRef = useRef(options.companyId);
  companyIdRef.current = options.companyId;

  const commit = useCallback(
    async (state: RankDragState) => {
      const companyId = companyIdRef.current;
      if (!companyId) return;
      const { agent, currentSlot, originSlot } = state;
      if (currentSlot === originSlot) return;
      const occupant = siblingsRef.current.find(
        (s) => s.agent.id !== agent.id && s.slot === currentSlot,
      );
      const writePos = (a: Agent, slotValue: number): Record<string, unknown> => {
        const existing =
          (a.metadata as { zootropolis?: Record<string, unknown> } | null)
            ?.zootropolis ?? {};
        const pos: ZootropolisPos =
          options.kind === "floorRank"
            ? { kind: "floorRank", rank: slotValue }
            : { kind: "rowSlot", slot: slotValue };
        return {
          metadata: {
            ...((a.metadata as Record<string, unknown> | null) ?? {}),
            zootropolis: { ...existing, pos },
          },
        };
      };
      try {
        await agentsApi.update(agent.id, writePos(agent, currentSlot), companyId);
        if (occupant) {
          await agentsApi.update(
            occupant.agent.id,
            writePos(occupant.agent, originSlot),
            companyId,
          );
        }
      } finally {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.agents.list(companyId),
        });
      }
    },
    [queryClient, options.kind],
  );

  useEffect(() => {
    const computeSlot = (clientX: number, clientY: number, state: RankDragState) => {
      const pending = pendingRef.current;
      if (!pending) return state.currentSlot;
      const deltaPx =
        options.axis === "vertical"
          ? pending.startY - clientY // dragging up = higher rank
          : clientX - pending.startX; // dragging right = higher slot
      const slotDelta = Math.round(deltaPx / options.pixelsPerSlot);
      const next = Math.max(0, Math.min(options.slotCount - 1, state.originSlot + slotDelta));
      return next;
    };

    const onMove = (e: PointerEvent) => {
      if (pendingRef.current && !drag) {
        const dx = e.clientX - pendingRef.current.startX;
        const dy = e.clientY - pendingRef.current.startY;
        if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
          const { agent, slot } = pendingRef.current;
          // Keep pendingRef.current so we can compute deltas; just
          // promote to active drag state.
          setDrag({ agent, originSlot: slot, currentSlot: slot });
          return;
        }
      }
      if (!drag) return;
      const next = computeSlot(e.clientX, e.clientY, drag);
      if (next !== drag.currentSlot) {
        setDrag({ ...drag, currentSlot: next });
      }
    };

    const onUp = () => {
      const snapshot = drag;
      pendingRef.current = null;
      setDrag(null);
      if (snapshot) {
        lastDragEndRef.current = performance.now();
        void commit(snapshot);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        pendingRef.current = null;
        setDrag(null);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [drag, commit, options.axis, options.pixelsPerSlot, options.slotCount]);

  const beginGesture = useCallback(
    (agent: Agent, slot: number, event: { clientX: number; clientY: number }) => {
      pendingRef.current = {
        agent,
        slot,
        startX: event.clientX,
        startY: event.clientY,
      };
    },
    [],
  );

  const isDragging = useCallback(
    (agentId: string) => drag?.agent.id === agentId,
    [drag],
  );
  const wasJustDragged = useCallback(
    () => performance.now() - lastDragEndRef.current < 250,
    [],
  );

  return { drag, isDragging, beginGesture, wasJustDragged };
}
