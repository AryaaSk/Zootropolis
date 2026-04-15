import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh, MeshStandardMaterial } from "three";
import { palette } from "../palette";
import type { AgentLiveStatus } from "../hooks/useAgentLiveStatus";

interface AgentStatusHaloProps {
  status: AgentLiveStatus | undefined;
  unreachable?: boolean;
  /** Anchor Y; defaults to ground so the halo reads as the animal's "shadow aura". */
  y?: number;
}

interface HaloStyle {
  color: string;
  emissive: string;
  emissiveIntensity: number;
  baseOpacity: number;
  pulseAmp: number;
  pulseHz: number;
  scale: number;
}

function styleFor(status: AgentLiveStatus | undefined, unreachable: boolean): HaloStyle {
  if (unreachable) {
    return {
      color: palette.terracotta,
      emissive: palette.terracotta,
      emissiveIntensity: 0.8,
      baseOpacity: 0.55,
      pulseAmp: 0.25,
      pulseHz: 0.5,
      scale: 1.0,
    };
  }
  switch (status) {
    case "running":
      return {
        color: palette.sage,
        emissive: "#9ab78a",
        emissiveIntensity: 1.6,
        baseOpacity: 0.8,
        pulseAmp: 0.45,
        pulseHz: 1.2, // fast pulse — "actively working"
        scale: 1.1,
      };
    case "completed":
      return {
        color: palette.windowGlow,
        emissive: palette.windowGlow,
        emissiveIntensity: 1.3,
        baseOpacity: 0.6,
        pulseAmp: 0.35,
        pulseHz: 0.5,
        scale: 1.05,
      };
    case "failed":
      return {
        color: palette.terracotta,
        emissive: palette.terracotta,
        emissiveIntensity: 0.9,
        baseOpacity: 0.5,
        pulseAmp: 0.2,
        pulseHz: 0.4,
        scale: 0.95,
      };
    default: // idle
      return {
        color: palette.bone,
        emissive: palette.bone,
        emissiveIntensity: 0.1,
        baseOpacity: 0.22,
        pulseAmp: 0.05,
        pulseHz: 0.25,
        scale: 0.9,
      };
  }
}

/**
 * Phase S4 — a soft emissive disc under each agent. Colour-codes the
 * live run status (idle / running / queued / blocked / unreachable) so
 * a campus at a glance shows who's working. Bloom picks up the
 * emissive to make the halo glow gently under the animal.
 */
export function AgentStatusHalo({
  status,
  unreachable = false,
  y = -0.05,
}: AgentStatusHaloProps) {
  const meshRef = useRef<Mesh>(null);
  const style = styleFor(status, unreachable);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = clock.getElapsedTime();
    const phase = Math.sin(t * Math.PI * 2 * style.pulseHz);
    const mat = mesh.material as MeshStandardMaterial;
    mat.opacity = style.baseOpacity + style.pulseAmp * 0.5 * (phase + 1) * 0.5;
    mat.emissiveIntensity = style.emissiveIntensity * (0.6 + 0.4 * (phase + 1) * 0.5);
    const s = style.scale * (1 + 0.04 * phase);
    mesh.scale.set(s, 1, s);
  });

  return (
    <mesh ref={meshRef} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.55, 1.1, 32]} />
      <meshStandardMaterial
        color={style.color}
        emissive={style.emissive}
        emissiveIntensity={style.emissiveIntensity}
        transparent
        opacity={style.baseOpacity}
        depthWrite={false}
      />
    </mesh>
  );
}
