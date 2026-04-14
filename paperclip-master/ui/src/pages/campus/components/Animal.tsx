import { Edges } from "@react-three/drei";
import { palette } from "../palette";

interface AnimalProps {
  color?: string;
  position?: [number, number, number];
}

/**
 * Cube-animal primitive.
 * Simple body cube + small head cube + 2 eye dots. Flat Lambert + outlines.
 */
export function Animal({ color = palette.terracotta, position = [0, 0, 0] }: AnimalProps) {
  return (
    <group position={position}>
      {/* Body */}
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[1.2, 1.2, 1.6]} />
        <meshLambertMaterial color={color} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 1.55, 0.7]}>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshLambertMaterial color={color} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>

      {/* Eyes */}
      <mesh position={[-0.22, 1.65, 1.11]}>
        <boxGeometry args={[0.12, 0.12, 0.04]} />
        <meshLambertMaterial color={palette.ink} />
      </mesh>
      <mesh position={[0.22, 1.65, 1.11]}>
        <boxGeometry args={[0.12, 0.12, 0.04]} />
        <meshLambertMaterial color={palette.ink} />
      </mesh>

      {/* Legs */}
      <mesh position={[-0.4, -0.1, -0.5]}>
        <boxGeometry args={[0.3, 0.6, 0.3]} />
        <meshLambertMaterial color={color} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      <mesh position={[0.4, -0.1, -0.5]}>
        <boxGeometry args={[0.3, 0.6, 0.3]} />
        <meshLambertMaterial color={color} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      <mesh position={[-0.4, -0.1, 0.5]}>
        <boxGeometry args={[0.3, 0.6, 0.3]} />
        <meshLambertMaterial color={color} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      <mesh position={[0.4, -0.1, 0.5]}>
        <boxGeometry args={[0.3, 0.6, 0.3]} />
        <meshLambertMaterial color={color} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
    </group>
  );
}
