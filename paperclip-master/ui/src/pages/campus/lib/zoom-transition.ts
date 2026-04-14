import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { cubic } from "maath/easing";

/**
 * Phase B6 — camera-animated transitions between zoom levels.
 *
 * The illusion: when the user clicks a child in a container view, we dolly
 * the camera toward that child for ~400ms, THEN navigate. The next view
 * plays a matching "entrance" tween on mount that starts slightly outside
 * the default framing and settles in. If the handoff geometry matches, the
 * route swap reads as a single continuous motion.
 *
 * Implementation notes:
 * - Manual lerp via `useFrame` (maath's `damp3` is critical-damped and would
 *   require target-tracking across frames; we want a fixed ~400ms tween with
 *   a known completion time so we can call `then()` exactly once). We still
 *   borrow maath's `cubic.inOut` easing for the timing curve.
 * - The controller lives INSIDE the <Canvas> so it can useFrame and touch
 *   the r3f camera. Views wrap their scene in <ZoomTransitionProvider>.
 * - `isTransitioning` is exposed as reactive state so OrbitControls can be
 *   disabled mid-animation without fighting the tween.
 */

export const ZOOM_TRANSITION_MS = 400;

// Consistent camera offset relative to the target's centroid. "Slightly above
// and behind"—used both for zoom-in endpoints (where we want to end up "just
// outside" the clicked child) and for zoom-in entrances (where we mount the
// camera at a similar offset from origin and tween inward). Keeping the same
// shape across layers is what sells the handoff as continuous.
const HANDOFF_OFFSET = new Vector3(1.4, 1.1, 1.8);

type Tween = {
  fromPos: Vector3;
  toPos: Vector3;
  fromLook: Vector3;
  toLook: Vector3;
  startMs: number;
  durationMs: number;
  ease: (t: number) => number;
  onDone?: () => void;
};

type ZoomTransitionApi = {
  /** Ref-backed so a caller updating it doesn't cascade re-renders. */
  tweenRef: { current: Tween | null };
  /** Current lookAt target; we tween this alongside position. */
  lookAtRef: { current: Vector3 };
  setIsTransitioning: (v: boolean) => void;
  isTransitioning: boolean;
};

const ZoomTransitionContext = createContext<ZoomTransitionApi | null>(null);

function useZoomTransitionApi(): ZoomTransitionApi {
  const ctx = useContext(ZoomTransitionContext);
  if (!ctx) {
    throw new Error(
      "useZoomTransition hooks must be used inside <ZoomTransitionProvider>",
    );
  }
  return ctx;
}

/**
 * easeCamera — imperative one-shot camera tween.
 * Tweens `camera.position` toward `target`'s offset and aims `lookAt` at
 * `target` over `duration` ms using the supplied ease. Calls `onDone` once
 * at the end. Drives on each frame via the provided `tweenRef` which is
 * consumed by <ZoomTransitionController>.
 */
export function easeCamera(opts: {
  api: ZoomTransitionApi;
  fromPos: Vector3;
  toPos: Vector3;
  fromLook: Vector3;
  toLook: Vector3;
  duration?: number;
  ease?: (t: number) => number;
  onDone?: () => void;
}) {
  const {
    api,
    fromPos,
    toPos,
    fromLook,
    toLook,
    duration = ZOOM_TRANSITION_MS,
    ease = cubic.inOut,
    onDone,
  } = opts;
  api.tweenRef.current = {
    fromPos: fromPos.clone(),
    toPos: toPos.clone(),
    fromLook: fromLook.clone(),
    toLook: toLook.clone(),
    startMs: performance.now(),
    durationMs: duration,
    ease,
    onDone,
  };
  api.setIsTransitioning(true);
}

/**
 * Controller — pumps the active tween each frame. Must be rendered inside
 * the <Canvas> tree. Updates camera.position, lookAt, and fires onDone.
 */
function ZoomTransitionController() {
  const api = useZoomTransitionApi();
  const camera = useThree((s) => s.camera);

  useFrame(() => {
    const tween = api.tweenRef.current;
    if (!tween) return;
    const now = performance.now();
    const raw = (now - tween.startMs) / tween.durationMs;
    const clamped = Math.min(1, Math.max(0, raw));
    const t = tween.ease(clamped);

    camera.position.lerpVectors(tween.fromPos, tween.toPos, t);
    api.lookAtRef.current.lerpVectors(tween.fromLook, tween.toLook, t);
    camera.lookAt(api.lookAtRef.current);

    if (clamped >= 1) {
      const done = tween.onDone;
      api.tweenRef.current = null;
      api.setIsTransitioning(false);
      if (done) done();
    }
  });

  return null;
}

/**
 * ZoomTransitionProvider — wrap the <Canvas> subtree with this so child
 * click handlers and entrance hooks can drive the camera. Includes the
 * controller. Place inside <Canvas>.
 */
export function ZoomTransitionProvider({ children }: { children: ReactNode }) {
  const tweenRef = useRef<Tween | null>(null);
  const lookAtRef = useRef<Vector3>(new Vector3(0, 0, 0));
  const [isTransitioning, setIsTransitioning] = useState(false);

  const api: ZoomTransitionApi = {
    tweenRef,
    lookAtRef,
    setIsTransitioning,
    isTransitioning,
  };

  return createElement(
    ZoomTransitionContext.Provider,
    { value: api },
    createElement(ZoomTransitionController, null),
    children,
  );
}

/** True while a camera tween is in flight. OrbitControls read this. */
export function useIsTransitioning(): boolean {
  return useZoomTransitionApi().isTransitioning;
}

/**
 * useZoomInTransition — returns a `transitionTo(targetWorldPos, then)` that
 * dollies the camera from its current pose toward just-outside the target,
 * then invokes `then()` (typically `navigate(...)`). Safe to call from any
 * click handler rendered inside the Provider.
 */
export function useZoomInTransition() {
  const api = useZoomTransitionApi();
  const camera = useThree((s) => s.camera);

  return useCallback(
    (target: Vector3 | [number, number, number], then?: () => void) => {
      // Ignore re-entrant calls while a tween is active.
      if (api.tweenRef.current) return;
      const tgt =
        target instanceof Vector3
          ? target.clone()
          : new Vector3(target[0], target[1], target[2]);
      const fromPos = camera.position.clone();
      const toPos = tgt.clone().add(HANDOFF_OFFSET);
      const fromLook = api.lookAtRef.current.clone();
      const toLook = tgt.clone();

      easeCamera({
        api,
        fromPos,
        toPos,
        fromLook,
        toLook,
        onDone: then,
      });
    },
    [api, camera],
  );
}

/**
 * useZoomInEntrance — on mount, snaps the camera to "just outside" the
 * scene framing (same offset shape used for zoom-in endpoints) and tweens
 * it to the view's default framing. Completes the continuous-motion
 * illusion when the route swap happens mid-dolly.
 *
 * @param defaultPos The view's resting camera position.
 * @param lookAt     The view's resting camera lookAt / OrbitControls target.
 */
export function useZoomInEntrance(
  defaultPos: [number, number, number],
  lookAt: [number, number, number] = [0, 0, 0],
) {
  const api = useZoomTransitionApi();
  const camera = useThree((s) => s.camera);

  // Stable key; only replay on actual change.
  const dx = defaultPos[0];
  const dy = defaultPos[1];
  const dz = defaultPos[2];
  const lx = lookAt[0];
  const ly = lookAt[1];
  const lz = lookAt[2];

  useEffect(() => {
    const toPos = new Vector3(dx, dy, dz);
    const toLook = new Vector3(lx, ly, lz);
    // Start from "just outside" — pulled further along the camera's own
    // vector away from the lookAt, so the inward dolly matches the outgoing
    // view's final direction of travel.
    const dir = toPos.clone().sub(toLook).normalize();
    const fromPos = toPos.clone().addScaledVector(dir, 2.2);
    const fromLook = toLook.clone();

    camera.position.copy(fromPos);
    api.lookAtRef.current.copy(fromLook);
    camera.lookAt(fromLook);

    easeCamera({
      api,
      fromPos,
      toPos,
      fromLook,
      toLook,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dx, dy, dz, lx, ly, lz]);
}
