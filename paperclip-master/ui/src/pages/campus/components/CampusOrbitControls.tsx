import { OrbitControls } from "@react-three/drei";
import { MOUSE } from "three";
import { useAltKey } from "../lib/useAltKey";

interface CampusOrbitControlsProps {
  enabled: boolean;
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  target: [number, number, number];
}

/**
 * Thin wrapper around drei <OrbitControls> that standardizes Zootropolis
 * camera behaviour across all campus layers:
 *   - Right-click drag → pan (default Three.js behaviour).
 *   - Hold Alt and left-drag → pan. When Alt isn't held, left-drag
 *     rotates as usual.
 *   - Middle-click / wheel → dolly.
 *   - Screen-space panning so vertical drags shift the camera along
 *     the look-at plane, not along the world up axis — feels correct
 *     at any orbit angle.
 */
export function CampusOrbitControls({
  enabled,
  minDistance,
  maxDistance,
  minPolarAngle,
  maxPolarAngle,
  target,
}: CampusOrbitControlsProps) {
  const altPressed = useAltKey();
  return (
    <OrbitControls
      makeDefault
      enabled={enabled}
      enablePan
      screenSpacePanning
      panSpeed={0.8}
      mouseButtons={{
        LEFT: altPressed ? MOUSE.PAN : MOUSE.ROTATE,
        MIDDLE: MOUSE.DOLLY,
        RIGHT: MOUSE.PAN,
      }}
      minDistance={minDistance}
      maxDistance={maxDistance}
      minPolarAngle={minPolarAngle}
      maxPolarAngle={maxPolarAngle}
      target={target}
    />
  );
}
