import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Trail } from "@react-three/drei";
import { Vector3, type Mesh } from "three";
import { palette } from "../palette";

interface DelegationTravellerProps {
  /** Source world position (delegator). */
  from: [number, number, number];
  /** Destination world position (delegatee). */
  to: [number, number, number];
  /** Tween duration in seconds. */
  duration?: number;
  /** Arc height above the linear midpoint. */
  arcHeight?: number;
  /** Called once the tween finishes so the parent can unmount. */
  onComplete?: () => void;
  /** Glow color — picked up by Bloom for the sparkle tail. */
  color?: string;
}

const up = new Vector3(0, 1, 0);

/**
 * A tiny emissive point that arcs from `from` to `to` over `duration`
 * seconds, leaving a soft emissive trail behind it. Designed to play on
 * every delegation (issue with parentId created) so users watch work
 * literally travel through the org chart in real time.
 *
 * Auto-unmounts via `onComplete` once it reaches the destination.
 */
export function DelegationTraveller({
  from,
  to,
  duration = 1.6,
  arcHeight = 2.4,
  onComplete,
  color = palette.windowGlow,
}: DelegationTravellerProps) {
  const meshRef = useRef<Mesh>(null);
  const start = useMemo(() => new Vector3(...from), [from]);
  const end = useMemo(() => new Vector3(...to), [to]);
  const control = useMemo(() => {
    const mid = start.clone().add(end).multiplyScalar(0.5);
    mid.add(up.clone().multiplyScalar(arcHeight));
    return mid;
  }, [start, end, arcHeight]);
  const startedAtRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  useFrame(({ clock }) => {
    if (doneRef.current) return;
    const now = clock.getElapsedTime();
    if (startedAtRef.current === null) startedAtRef.current = now;
    const t = Math.min(1, (now - startedAtRef.current) / duration);
    // Quadratic Bezier for an arc.
    const oneMinusT = 1 - t;
    const px = oneMinusT * oneMinusT * start.x + 2 * oneMinusT * t * control.x + t * t * end.x;
    const py = oneMinusT * oneMinusT * start.y + 2 * oneMinusT * t * control.y + t * t * end.y;
    const pz = oneMinusT * oneMinusT * start.z + 2 * oneMinusT * t * control.z + t * t * end.z;
    const mesh = meshRef.current;
    if (mesh) mesh.position.set(px, py, pz);
    if (t >= 1) {
      doneRef.current = true;
      onComplete?.();
    }
  });

  return (
    <Trail
      width={1.4}
      length={4}
      color={color}
      attenuation={(tt) => tt * tt}
    >
      <mesh ref={meshRef} position={from}>
        <sphereGeometry args={[0.22, 10, 10]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={3.2}
          toneMapped={false}
        />
      </mesh>
    </Trail>
  );
}
