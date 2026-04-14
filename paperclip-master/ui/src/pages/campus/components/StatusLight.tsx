import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import { palette } from "../palette";

export type StatusMode = "idle" | "active" | "error";

interface StatusLightProps {
  mode?: StatusMode;
  position?: [number, number, number];
}

const MODE_COLOR: Record<StatusMode, string> = {
  idle: palette.accent,
  active: palette.accent,
  error: palette.clay,
};

/**
 * Small emissive sphere floating above an agent.
 * B1 default: "idle" — steady soft cyan. Pulsing wires up in B5.
 */
export function StatusLight({ mode = "idle", position = [0, 2.6, 0] }: StatusLightProps) {
  const ref = useRef<Mesh>(null);
  const color = MODE_COLOR[mode];

  useFrame(({ clock }) => {
    if (!ref.current) return;
    // B1: subtle idle bob only. Pulse comes in B5.
    const t = clock.getElapsedTime();
    ref.current.position.y = position[1] + Math.sin(t * 1.2) * 0.05;
  });

  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.18, 16, 16]} />
      <meshLambertMaterial color={color} emissive={color} emissiveIntensity={0.8} />
    </mesh>
  );
}
