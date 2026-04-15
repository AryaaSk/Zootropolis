import { Sparkles } from "@react-three/drei";

interface ChimneySmokeProps {
  /** Anchor position relative to parent group (typically the chimney top). */
  position?: [number, number, number];
  /** Smoke tint. Warm gray-peach reads as wood-fire smoke in sunset light. */
  color?: string;
  /** Particle count. 16 is enough to read as a trailing plume without clutter. */
  count?: number;
  /** Plume height. Tall + narrow reads as smoke. */
  height?: number;
  /** Rising speed. Lower = lazier. */
  speed?: number;
  /** If false, render nothing (e.g. when the owning agent is idle). */
  active?: boolean;
}

/**
 * Phase S5 chimney smoke — a narrow vertical plume of <Sparkles> tinted
 * gray-peach. The current shape uses `noise` + a tall scale so specks
 * drift upward with lateral wobble.
 *
 * Mount as a child of the chimney stub (BuildingModel already places
 * `ChimneyStub` in a consistent local spot) or directly in a building
 * group at the chimney's world position.
 */
export function ChimneySmoke({
  position = [1.0, 4.2, 0.6],
  color = "#b5a89a",
  count = 16,
  height = 3.0,
  speed = 0.25,
  active = true,
}: ChimneySmokeProps) {
  if (!active) return null;
  return (
    <group position={position}>
      <Sparkles
        count={count}
        scale={[0.7, height, 0.7]}
        size={8}
        speed={speed}
        color={color}
        noise={1.8}
      />
    </group>
  );
}
