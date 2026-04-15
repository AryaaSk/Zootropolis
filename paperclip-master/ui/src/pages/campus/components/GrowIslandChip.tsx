import { useRef, useState } from "react";
import { Text, useCursor } from "@react-three/drei";
import type { Group } from "three";
import { palette } from "../palette";
import { useHoverEmissive } from "../lib/useHoverEmissive";

interface GrowIslandChipProps {
  /** World radius of the current island — chip sits just past this. */
  islandRadius: number;
  onGrow: () => void;
}

/**
 * Phase T5b — click to grow the island by one more ring of hexes.
 * A rounded "+" chip floats just outside the current outer ring so
 * the user can expand the canvas deliberately rather than being
 * dumped with dozens of empty slots up-front.
 */
export function GrowIslandChip({ islandRadius, onGrow }: GrowIslandChipProps) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const ref = useRef<Group>(null);
  useHoverEmissive(ref, hovered, { color: palette.accent, intensity: 0.9 });
  return (
    <group
      ref={ref}
      position={[0, 0.8, islandRadius + 1.5]}
      onPointerEnter={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onGrow();
      }}
    >
      <mesh>
        <cylinderGeometry args={[0.55, 0.55, 0.24, 28]} />
        <meshStandardMaterial
          color={palette.accent}
          emissive={palette.accent}
          emissiveIntensity={hovered ? 0.6 : 0.2}
          roughness={0.7}
        />
      </mesh>
      <Text
        position={[0, 0.14, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.7}
        color={palette.ink}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.04}
        outlineColor={palette.bone}
        outlineOpacity={0.85}
      >
        +
      </Text>
    </group>
  );
}
