import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh, MeshStandardMaterial } from "three";
import { palette } from "../palette";

interface HoverRingProps {
  active: boolean;
  /** Outer radius of the ring. Defaults to ~1.2 which reads on a hex tile. */
  radius?: number;
  /** Ring thickness (outer − inner). */
  thickness?: number;
  /** Y offset (world-space). Sits just above the ground by default. */
  y?: number;
  /** Color of the ring. Defaults to accent for high readability. */
  color?: string;
}

/**
 * Phase S polish — a flat emissive ring rendered as a sibling of hover-
 * targeted elements. Replaces the lift-on-hover pattern (which caused
 * re-entry flicker because lifting the mesh moved it relative to the
 * cursor hit-test). The ring doesn't change the hit-target's bounds so
 * hover state is stable.
 *
 * Layer-set to not receive raycasts, so it never intercepts the pointer
 * events intended for the parent mesh.
 */
export function HoverRing({
  active,
  radius = 1.3,
  thickness = 0.25,
  y = 0.03,
  color = palette.accent,
}: HoverRingProps) {
  const meshRef = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = clock.getElapsedTime();
    const pulse = 0.6 + 0.4 * Math.sin(t * 4);
    const targetOpacity = active ? 0.7 * pulse : 0;
    const mat = mesh.material as MeshStandardMaterial;
    // Damp toward target for a smooth fade-in/out.
    mat.opacity = mat.opacity + (targetOpacity - mat.opacity) * 0.25;
    mat.emissiveIntensity = active ? 1.8 * pulse : 0;
    const targetScale = active ? 1 : 0.9;
    mesh.scale.x += (targetScale - mesh.scale.x) * 0.25;
    mesh.scale.z += (targetScale - mesh.scale.z) * 0.25;
    mesh.visible = mat.opacity > 0.01;
  });

  const outer = radius;
  const inner = Math.max(0, radius - thickness);

  return (
    <mesh
      ref={meshRef}
      position={[0, y, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      raycast={() => null}
    >
      <ringGeometry args={[inner, outer, 48]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0}
        transparent
        opacity={0}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
