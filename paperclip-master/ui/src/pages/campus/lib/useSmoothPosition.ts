import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { damp } from "maath/easing";
import type { Group } from "three";

/**
 * Phase T5 — smoothly tween a `<group>`'s position toward a target
 * each frame. Used so swap-on-drop and ring-expand reads as animation
 * rather than a pop.
 *
 * When `snap === true` (e.g. while the user is actively dragging this
 * tile — we want it pinned to the cursor), the position is hard-set
 * each frame. Otherwise we `damp` toward the target with a short
 * smoothTime so re-layouts feel like physics, not teleports.
 *
 * We DO NOT pass a `position` prop on the `<group>`; React would
 * snap it each render and defeat the smoothing. Initial position is
 * set on first frame inside the hook.
 */
export function useSmoothPosition(
  ref: RefObject<Group | null>,
  target: [number, number, number],
  snap = false,
  smoothTime = 0.18,
) {
  const firstRef = useRef(true);
  const targetRef = useRef(target);
  targetRef.current = target;
  const snapRef = useRef(snap);
  snapRef.current = snap;

  // If the component is remounted with a new ref, re-seed position.
  useEffect(() => {
    firstRef.current = true;
  }, [ref]);

  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const [tx, ty, tz] = targetRef.current;
    if (firstRef.current || snapRef.current) {
      g.position.set(tx, ty, tz);
      firstRef.current = false;
      return;
    }
    damp(g.position, "x", tx, smoothTime, delta);
    damp(g.position, "y", ty, smoothTime, delta);
    damp(g.position, "z", tz, smoothTime, delta);
  });
}
