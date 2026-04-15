import { useCallback, useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { Plane, Raycaster, Vector2, Vector3 } from "three";
import type { Agent, ZootropolisPos } from "@paperclipai/shared";
import { useQueryClient } from "@tanstack/react-query";
import { agentsApi } from "@/api/agents";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Phase T4c — free 2D grid drag for agents inside a room. Raycasts
 * pointer onto a y=0 plane, snaps to a 0.6-unit grid, swaps with any
 * sibling already at the destination cell. PATCHes pos as
 * { kind: "grid2d", x, z }.
 */

const PLANE = new Plane(new Vector3(0, 1, 0), 0);
const RAY = new Raycaster();
const NDC = new Vector2();
const TARGET = new Vector3();
const DRAG_THRESHOLD_PX = 8;
const GRID = 0.6;

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

export interface GridDragState {
  agent: Agent;
  originX: number;
  originZ: number;
  currentX: number;
  currentZ: number;
}

interface UseGridDragOptions {
  companyId: string | undefined;
  siblings: Array<{ agent: Agent; x: number; z: number }>;
  /** Clamp to half-extent (rooms are ~6 square, so 2.6 leaves a margin). */
  halfExtent?: number;
}

export interface UseGridDragHandle {
  drag: GridDragState | null;
  isDragging: (agentId: string) => boolean;
  beginGesture: (
    agent: Agent,
    origin: { x: number; z: number },
    event: { clientX: number; clientY: number },
  ) => void;
  /** True for ~250ms after a drop — suppresses the next navigation click. */
  wasJustDragged: () => boolean;
}

export function useGridDrag(options: UseGridDragOptions): UseGridDragHandle {
  const { camera, gl } = useThree();
  const queryClient = useQueryClient();
  const [drag, setDrag] = useState<GridDragState | null>(null);
  const lastDragEndRef = useRef<number>(0);
  const pendingRef = useRef<{
    agent: Agent;
    origin: { x: number; z: number };
    startX: number;
    startY: number;
  } | null>(null);
  const siblingsRef = useRef(options.siblings);
  siblingsRef.current = options.siblings;
  const companyIdRef = useRef(options.companyId);
  companyIdRef.current = options.companyId;
  const halfExtent = options.halfExtent ?? 2.6;

  const resolveWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = gl.domElement.getBoundingClientRect();
      NDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      NDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      RAY.setFromCamera(NDC, camera);
      const hit = RAY.ray.intersectPlane(PLANE, TARGET);
      if (!hit) return null;
      return { x: TARGET.x, z: TARGET.z };
    },
    [camera, gl],
  );

  const commit = useCallback(
    async (state: GridDragState) => {
      const companyId = companyIdRef.current;
      if (!companyId) return;
      if (state.currentX === state.originX && state.currentZ === state.originZ) return;
      const occupant = siblingsRef.current.find(
        (s) =>
          s.agent.id !== state.agent.id &&
          Math.abs(s.x - state.currentX) < GRID / 2 &&
          Math.abs(s.z - state.currentZ) < GRID / 2,
      );
      const writePos = (
        a: Agent,
        x: number,
        z: number,
      ): Record<string, unknown> => {
        const existing =
          (a.metadata as { zootropolis?: Record<string, unknown> } | null)
            ?.zootropolis ?? {};
        const pos: ZootropolisPos = { kind: "grid2d", x, z };
        return {
          metadata: {
            ...((a.metadata as Record<string, unknown> | null) ?? {}),
            zootropolis: { ...existing, pos },
          },
        };
      };
      try {
        await agentsApi.update(
          state.agent.id,
          writePos(state.agent, state.currentX, state.currentZ),
          companyId,
        );
        if (occupant) {
          await agentsApi.update(
            occupant.agent.id,
            writePos(occupant.agent, state.originX, state.originZ),
            companyId,
          );
        }
      } finally {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.agents.list(companyId),
        });
      }
    },
    [queryClient],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (pendingRef.current && !drag) {
        const dx = e.clientX - pendingRef.current.startX;
        const dy = e.clientY - pendingRef.current.startY;
        if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
          const { agent, origin } = pendingRef.current;
          pendingRef.current = null;
          setDrag({
            agent,
            originX: origin.x,
            originZ: origin.z,
            currentX: origin.x,
            currentZ: origin.z,
          });
          return;
        }
      }
      if (!drag) return;
      const world = resolveWorld(e.clientX, e.clientY);
      if (!world) return;
      const snapped = {
        x: Math.max(-halfExtent, Math.min(halfExtent, snap(world.x))),
        z: Math.max(-halfExtent, Math.min(halfExtent, snap(world.z))),
      };
      setDrag((d) =>
        d ? { ...d, currentX: snapped.x, currentZ: snapped.z } : null,
      );
    };

    const onUp = () => {
      pendingRef.current = null;
      if (drag) {
        const snapshot = drag;
        setDrag(null);
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
  }, [drag, resolveWorld, commit, halfExtent]);

  const beginGesture = useCallback(
    (
      agent: Agent,
      origin: { x: number; z: number },
      event: { clientX: number; clientY: number },
    ) => {
      pendingRef.current = {
        agent,
        origin,
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
