import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

interface OrbitLikeControls {
  target: { x: number; y: number; z: number };
}

interface CameraDebugLoggerProps {
  /** Tag prefix in console — e.g. "campus", "building". */
  label: string;
  /** Min seconds between log lines. Throttled so the console isn't flooded. */
  throttleSeconds?: number;
  /** Skip log if both position and target differ from last by less than this (world units). */
  changeThreshold?: number;
}

/**
 * Dev helper — prints `camera.position` and (when OrbitControls is the
 * default) `controls.target` to the console whenever they change, throttled.
 * Mount inside a Canvas. The OrbitControls instance must be installed as
 * the default (CampusOrbitControls passes `makeDefault`) so we can read
 * its target.
 *
 * Output format:
 *   [campus camera] pos=[7.50, 12.00, 9.50]  target=[0.00, 0.00, 0.00]
 *
 * To pin a new default: orbit/pan to the desired angle, copy the line
 * from devtools, paste the numbers into the view's CAMPUS_CAMERA /
 * CAMPUS_LOOKAT constants.
 */
export function CameraDebugLogger({
  label,
  throttleSeconds = 0.4,
  changeThreshold = 0.01,
}: CameraDebugLoggerProps) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as OrbitLikeControls | null;
  const lastTimeRef = useRef(0);
  const lastPosRef = useRef<[number, number, number]>([NaN, NaN, NaN]);
  const lastTargetRef = useRef<[number, number, number]>([NaN, NaN, NaN]);

  // Log the initial camera position once on mount so the user sees a
  // line right away (no need to interact first). Wrapped in setTimeout
  // so the OrbitControls have a frame to register as `controls`.
  useEffect(() => {
    const id = setTimeout(() => {
      const px = camera.position.x;
      const py = camera.position.y;
      const pz = camera.position.z;
      const tx = controls?.target.x ?? 0;
      const ty = controls?.target.y ?? 0;
      const tz = controls?.target.z ?? 0;
      // eslint-disable-next-line no-console
      console.log(
        `📷 [${label} camera INIT] pos=[${px.toFixed(2)}, ${py.toFixed(2)}, ${pz.toFixed(2)}]  ` +
          `target=[${tx.toFixed(2)}, ${ty.toFixed(2)}, ${tz.toFixed(2)}]`,
      );
    }, 100);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (t - lastTimeRef.current < throttleSeconds) return;
    const px = camera.position.x;
    const py = camera.position.y;
    const pz = camera.position.z;
    const tx = controls?.target.x ?? 0;
    const ty = controls?.target.y ?? 0;
    const tz = controls?.target.z ?? 0;
    const firstRun = Number.isNaN(lastPosRef.current[0]);
    const posChanged =
      firstRun ||
      Math.abs(px - lastPosRef.current[0]) > changeThreshold ||
      Math.abs(py - lastPosRef.current[1]) > changeThreshold ||
      Math.abs(pz - lastPosRef.current[2]) > changeThreshold;
    const targetChanged =
      firstRun ||
      Math.abs(tx - lastTargetRef.current[0]) > changeThreshold ||
      Math.abs(ty - lastTargetRef.current[1]) > changeThreshold ||
      Math.abs(tz - lastTargetRef.current[2]) > changeThreshold;
    if (!posChanged && !targetChanged) return;
    lastPosRef.current = [px, py, pz];
    lastTargetRef.current = [tx, ty, tz];
    lastTimeRef.current = t;
    // eslint-disable-next-line no-console
    console.log(
      `📷 [${label} camera] pos=[${px.toFixed(2)}, ${py.toFixed(2)}, ${pz.toFixed(2)}]  ` +
        `target=[${tx.toFixed(2)}, ${ty.toFixed(2)}, ${tz.toFixed(2)}]`,
    );
  });

  return null;
}
