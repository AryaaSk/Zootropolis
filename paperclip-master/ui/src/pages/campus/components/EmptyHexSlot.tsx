import { useRef, useState } from "react";
import { Text, useCursor } from "@react-three/drei";
import { Html } from "@react-three/drei";
import type { Group } from "three";
import { palette } from "../palette";
import { useHoverEmissive } from "../lib/useHoverEmissive";

interface EmptyHexSlotProps {
  /** World position of the hex's center. */
  position: [number, number, number];
  /** Axial coords — passed back to the click handler for prefilling. */
  axial: { q: number; r: number };
  onClick: (axial: { q: number; r: number }) => void;
}

/**
 * Phase T3 — an unoccupied hex slot on the island. Shows a subtle
 * "+" glyph that brightens on hover; clicking fires the parent's
 * hire-prefill flow so the new agent is POSTed with pos: {kind:"hex", q, r}.
 *
 * Geometry is deliberately minimal — a thin accent disc + a plus — so
 * the slot reads as "available" rather than as a first-class object.
 */
export function EmptyHexSlot({ position, axial, onClick }: EmptyHexSlotProps) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const ref = useRef<Group>(null);
  useHoverEmissive(ref, hovered, { color: palette.accent, intensity: 0.75 });
  return (
    <group
      ref={ref}
      position={position}
      onPointerEnter={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onClick(axial);
      }}
    >
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.3, 6]} />
        <meshStandardMaterial
          color={palette.accent}
          emissive={palette.accent}
          emissiveIntensity={hovered ? 0.4 : 0.08}
          transparent
          opacity={hovered ? 0.35 : 0.12}
          depthWrite={false}
        />
      </mesh>
      <Text
        position={[0, 0.12, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={1.0}
        color={palette.ink}
        anchorX="center"
        anchorY="middle"
        fillOpacity={hovered ? 0.9 : 0.5}
        outlineWidth={0.05}
        outlineColor={palette.bone}
        outlineOpacity={0.8}
      >
        +
      </Text>
      {hovered && (
        <Html position={[0, 1.4, 0]} center distanceFactor={10}>
          <div
            className="pointer-events-none rounded-full border px-3 py-1 text-xs font-medium shadow"
            style={{
              backgroundColor: `${palette.bone}ee`,
              borderColor: `${palette.ink}33`,
              color: palette.ink,
              whiteSpace: "nowrap",
            }}
          >
            Hire agent here
          </div>
        </Html>
      )}
    </group>
  );
}
