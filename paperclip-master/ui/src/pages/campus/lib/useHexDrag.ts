import { useCallback, useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { Plane, Raycaster, Vector2, Vector3 } from "three";
import type { Agent } from "@paperclipai/shared";
import { readZootropolisPos } from "@paperclipai/shared";
import { useQueryClient } from "@tanstack/react-query";
import { agentsApi } from "@/api/agents";
import { queryKeys } from "@/lib/queryKeys";
import { worldToAxial, axialToWorld, HEX_SIZE } from "../layout/hexGrid";

/**
 * Phase T2 — drag-to-move at the campus root.
 *
 * Raycasts the cursor onto a virtual y=0 plane (independent of any
 * scene geometry), snaps the intersection to the nearest hex, and
 * commits the dragged agent's new pos on pointer up. If a sibling
 * already sits on that hex, the two agents swap positions.
 *
 * Uses an 8px-movement threshold to distinguish drag from click so
 * navigation clicks keep working on the same tile pointer-down.
 */

const PLANE = new Plane(new Vector3(0, 1, 0), 0);
const RAY = new Raycaster();
const NDC = new Vector2();
const TARGET = new Vector3();
const DRAG_THRESHOLD_PX = 8;

export interface HexAxial {
  q: number;
  r: number;
}

export interface HexDragState {
  agent: Agent;
  originAxial: HexAxial;
  /** Nearest hex the pointer currently resolves to. */
  currentAxial: HexAxial;
  /** Exact world (x, z) of the pointer on the drag plane — used for the
   *  lifted "ghost" mesh that tracks the cursor smoothly. */
  worldX: number;
  worldZ: number;
}

interface UseHexDragOptions {
  companyId: string | undefined;
  /**
   * Pool of currently-visible siblings so we can look up a target-hex
   * occupant for swaps. Each entry is an agent + its CURRENT axial (so
   * the caller owns the "fallback to spiral order" resolution).
   */
  siblings: Array<{ agent: Agent; axial: HexAxial }>;
}

export interface UseHexDragHandle {
  /** Active drag, or null. */
  drag: HexDragState | null;
  /**
   * Called by a tile's onPointerDown. Stashes the pointer-start clientX/Y
   * so we can threshold on pointer-move.
   */
  beginGesture: (
    agent: Agent,
    axial: HexAxial,
    event: { clientX: number; clientY: number },
  ) => void;
  /** True if the given agent is the active drag target — for visuals. */
  isDragging: (agentId: string) => boolean;
  /** Is the pointer currently over a VALID target (on the island)? */
  targetIsValid: boolean;
  /**
   * True for ~250ms after a drag completes — tiles check this in their
   * onClick to suppress the navigation that would otherwise fire from
   * the browser's click-on-release behaviour.
   */
  wasJustDragged: () => boolean;
}

export function useHexDrag(options: UseHexDragOptions): UseHexDragHandle {
  const { camera, gl } = useThree();
  const queryClient = useQueryClient();
  const [drag, setDrag] = useState<HexDragState | null>(null);
  const lastDragEndRef = useRef<number>(0);
  // Pointer-down pending state (we haven't crossed the drag threshold yet).
  const pendingRef = useRef<{
    agent: Agent;
    axial: HexAxial;
    startX: number;
    startY: number;
  } | null>(null);
  const siblingsRef = useRef(options.siblings);
  siblingsRef.current = options.siblings;
  const companyIdRef = useRef(options.companyId);
  companyIdRef.current = options.companyId;

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

  // Commit a completed drag: PATCH dragger's metadata with new pos, and
  // if the target hex already has an occupant, swap them.
  const commit = useCallback(
    async (state: HexDragState) => {
      const companyId = companyIdRef.current;
      if (!companyId) return;
      const { agent, currentAxial, originAxial } = state;
      // No-op: dropped on own origin.
      if (currentAxial.q === originAxial.q && currentAxial.r === originAxial.r) return;
      const occupant = siblingsRef.current.find(
        (s) =>
          s.agent.id !== agent.id &&
          s.axial.q === currentAxial.q &&
          s.axial.r === currentAxial.r,
      );
      const writePos = (
        a: Agent,
        target: HexAxial,
      ): Record<string, unknown> => {
        const existing = (a.metadata as { zootropolis?: Record<string, unknown> } | null)?.zootropolis ?? {};
        return {
          metadata: {
            ...(a.metadata as Record<string, unknown> | null ?? {}),
            zootropolis: {
              ...existing,
              pos: { kind: "hex", q: target.q, r: target.r },
            },
          },
        };
      };
      try {
        await agentsApi.update(agent.id, writePos(agent, currentAxial), companyId);
        if (occupant) {
          await agentsApi.update(occupant.agent.id, writePos(occupant.agent, originAxial), companyId);
        }
      } finally {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.agents.list(companyId),
        });
      }
    },
    [queryClient],
  );

  // Window-level pointer tracking once a drag has started.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      // Promote a pending gesture to a drag once movement crosses the threshold.
      if (pendingRef.current && !drag) {
        const dx = e.clientX - pendingRef.current.startX;
        const dy = e.clientY - pendingRef.current.startY;
        if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
          const { agent, axial } = pendingRef.current;
          pendingRef.current = null;
          const world = resolveWorld(e.clientX, e.clientY);
          const [ox, oz] = axialToWorld(axial.q, axial.r, HEX_SIZE);
          setDrag({
            agent,
            originAxial: axial,
            currentAxial: axial,
            worldX: world?.x ?? ox,
            worldZ: world?.z ?? oz,
          });
          return;
        }
      }
      if (!drag) return;
      const world = resolveWorld(e.clientX, e.clientY);
      if (!world) return;
      const axial = worldToAxial(world.x, world.z, HEX_SIZE);
      setDrag((d) =>
        d
          ? {
              ...d,
              currentAxial: axial,
              worldX: world.x,
              worldZ: world.z,
            }
          : null,
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
  }, [drag, resolveWorld, commit]);

  const beginGesture = useCallback(
    (
      agent: Agent,
      axial: HexAxial,
      event: { clientX: number; clientY: number },
    ) => {
      pendingRef.current = {
        agent,
        axial,
        startX: event.clientX,
        startY: event.clientY,
      };
    },
    [],
  );

  const isDragging = useCallback((agentId: string) => drag?.agent.id === agentId, [drag]);
  const wasJustDragged = useCallback(
    () => performance.now() - lastDragEndRef.current < 250,
    [],
  );

  return { drag, beginGesture, isDragging, targetIsValid: drag != null, wasJustDragged };
}

/**
 * Small utility — read the axial for an agent, falling back to the
 * provided default axial (typically its spiral-order default).
 */
export function agentAxialOrFallback(
  agent: Agent,
  fallback: HexAxial,
): HexAxial {
  const pos = readZootropolisPos(agent.metadata);
  if (pos?.kind === "hex") return { q: pos.q, r: pos.r };
  return fallback;
}
