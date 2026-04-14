import type { ReactNode } from "react";
import { Edges, Text } from "@react-three/drei";
import { palette } from "../palette";

export type ContainerLayer = "room" | "floor" | "building" | "campus";

interface ContainerViewProps {
  layer: ContainerLayer;
  name: string;
  children: ReactNode;
  // Future: container-level click routing for child picking. Unused in B2/B3
  // because each child view wires its own onClick via navigate(). Kept in the
  // public API so B4+ can switch to container-driven picking without churn.
  onChildClick?: (id: string) => void;
}

// Room shell: 4 low walls + floor plane. Inside dims ~6x6 so ~4 animals fit
// comfortably on a grid along x.
function RoomShell({ name }: { name: string }) {
  const inner = 6; // inner floor side
  const wallH = 0.4;
  const wallT = 0.15;
  const half = inner / 2;

  return (
    <group>
      {/* Floor */}
      <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[inner, inner]} />
        <meshLambertMaterial color={palette.ground} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      {/* Back wall (-z) */}
      <mesh position={[0, -0.5 + wallH / 2, -half]}>
        <boxGeometry args={[inner, wallH, wallT]} />
        <meshLambertMaterial color={palette.bone} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      {/* Front wall (+z) */}
      <mesh position={[0, -0.5 + wallH / 2, half]}>
        <boxGeometry args={[inner, wallH, wallT]} />
        <meshLambertMaterial color={palette.bone} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      {/* Left wall (-x) */}
      <mesh position={[-half, -0.5 + wallH / 2, 0]}>
        <boxGeometry args={[wallT, wallH, inner]} />
        <meshLambertMaterial color={palette.cream} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      {/* Right wall (+x) */}
      <mesh position={[half, -0.5 + wallH / 2, 0]}>
        <boxGeometry args={[wallT, wallH, inner]} />
        <meshLambertMaterial color={palette.cream} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>

      <Text
        position={[0, -0.45, half + 0.3]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.3}
        color={palette.ink}
        anchorX="center"
        anchorY="middle"
      >
        {name}
      </Text>
    </group>
  );
}

// Floor shell: single horizontal slab, larger than a room.
function FloorShell({ name }: { name: string }) {
  return (
    <group>
      <mesh position={[0, -0.5, 0]}>
        <boxGeometry args={[12, 0.4, 12]} />
        <meshLambertMaterial color={palette.dustBlue} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      <Text
        position={[0, -0.29, 6.4]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.4}
        color={palette.ink}
        anchorX="center"
        anchorY="middle"
      >
        {name}
      </Text>
    </group>
  );
}

// Building shell: a tall thin block placeholder. B3 stacks floors inside/around it.
function BuildingShell({ name }: { name: string }) {
  return (
    <group>
      {/* Ground pad */}
      <mesh position={[0, -0.7, 0]}>
        <boxGeometry args={[10, 0.2, 10]} />
        <meshLambertMaterial color={palette.ground} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      {/* Tower shell (semi-transparent so stacked floors read through) */}
      <mesh position={[0, 3, 0]}>
        <boxGeometry args={[5, 7, 5]} />
        <meshLambertMaterial color={palette.bone} transparent opacity={0.25} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      <Text
        position={[0, -0.59, 5.6]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.45}
        color={palette.ink}
        anchorX="center"
        anchorY="middle"
      >
        {name}
      </Text>
    </group>
  );
}

// Campus shell: large flat ground plane.
function CampusShell({ name }: { name: string }) {
  return (
    <group>
      <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshLambertMaterial color={palette.ground} />
      </mesh>
      <Text
        position={[0, -0.49, 18]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.9}
        color={palette.ink}
        anchorX="center"
        anchorY="middle"
      >
        {name}
      </Text>
    </group>
  );
}

/**
 * ContainerView — single reusable "shell" primitive for any non-leaf layer.
 * Renders different geometry per layer, in palette-only flat Lambert with
 * outlines. No textures, no shadows, no PBR.
 */
export function ContainerView({ layer, name, children }: ContainerViewProps) {
  return (
    <group>
      {layer === "room" && <RoomShell name={name} />}
      {layer === "floor" && <FloorShell name={name} />}
      {layer === "building" && <BuildingShell name={name} />}
      {layer === "campus" && <CampusShell name={name} />}
      {children}
    </group>
  );
}
