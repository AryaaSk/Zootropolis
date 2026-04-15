import { Sparkles } from "@react-three/drei";
import { palette } from "../palette";

interface FirefliesProps {
  /** Number of sparkle points. 120 reads as "cozy garden". */
  count?: number;
  /** Size of the drift cube (meters). */
  scale?: number;
  /** Vertical center of the drift cube. */
  y?: number;
  /** Point size. Stylized, larger than default drei. */
  size?: number;
  /** Drift speed. 0.25 reads as gentle. */
  speed?: number;
  /** Color of each speck. Warm bone/ember read as fireflies/pollen. */
  color?: string;
}

/**
 * Phase S5 fireflies — ambient pollen/firefly specks drifting around
 * the hex island. Uses drei <Sparkles> which is instanced points, so
 * 120 pts cost one draw call.
 */
export function Fireflies({
  count = 45,
  scale = 28,
  y = 2.2,
  size = 1.8,
  speed = 0.1,
  color = palette.windowGlow,
}: FirefliesProps) {
  return (
    <group position={[0, y, 0]}>
      <Sparkles
        count={count}
        scale={[scale, 5, scale]}
        size={size}
        speed={speed}
        color={color}
        noise={0.4}
      />
    </group>
  );
}
