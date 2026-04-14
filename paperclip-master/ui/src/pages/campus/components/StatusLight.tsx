import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh, MeshLambertMaterial } from "three";
import { Color } from "three";
import { palette } from "../palette";
import type { AgentLiveStatus } from "../hooks/useAgentLiveStatus";

/** Legacy mode string kept for any callers that were passing it pre-B5. */
export type StatusMode = "idle" | "active" | "error";

interface StatusLightProps {
  /** Preferred API (B5+): drive directly from useAgentLiveStatus. */
  status?: AgentLiveStatus;
  /** Legacy API (pre-B5): kept for backwards compatibility. */
  mode?: StatusMode;
  position?: [number, number, number];
}

// Color targets per status. Running uses cyan (accent), completed uses green,
// failed uses terracotta red. Idle == soft cyan default.
const GREEN = "#6fd896";
const CYAN = palette.accent;
const RED = palette.clay;

function colorFor(status: AgentLiveStatus): string {
  switch (status) {
    case "running":
      return CYAN;
    case "completed":
      return GREEN;
    case "failed":
      return RED;
    case "idle":
    default:
      return CYAN;
  }
}

// Convert a legacy `mode` prop to an AgentLiveStatus.
function statusFromMode(mode: StatusMode | undefined): AgentLiveStatus | null {
  if (!mode) return null;
  if (mode === "active") return "running";
  if (mode === "error") return "failed";
  return "idle";
}

/**
 * Small emissive sphere floating above an agent.
 *
 * B5 behavior:
 *   - idle       → soft cyan, gentle idle bob, steady emissive ~0.8.
 *   - running    → cyan with sine-wave emissive intensity ~0.8→1.4 @ ~1.5 Hz.
 *   - completed  → green solid (emissive ~1.2) — parent hook holds this for ~1s.
 *   - failed     → red solid (emissive ~1.2) — parent hook holds this for ~3s.
 *
 * All per-frame animation lives inside useFrame. The component only
 * re-renders when its `status` prop changes (low-frequency).
 */
export function StatusLight({
  status,
  mode,
  position = [0, 2.6, 0],
}: StatusLightProps) {
  const effective: AgentLiveStatus = status ?? statusFromMode(mode) ?? "idle";
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<MeshLambertMaterial>(null);
  const targetColorRef = useRef(new Color(colorFor(effective)));

  // Update color target when status changes — we don't recreate materials
  // each frame; we just lerp the existing material's color/emissive in useFrame.
  targetColorRef.current.set(colorFor(effective));

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    const material = materialRef.current;
    if (!mesh || !material) return;
    const t = clock.getElapsedTime();

    // Idle bob — same as pre-B5 behavior.
    mesh.position.y = position[1] + Math.sin(t * 1.2) * 0.05;

    // Ease the material color toward the status target (fast so transitions
    // feel snappy but not instantaneous).
    material.color.lerp(targetColorRef.current, 0.15);
    material.emissive.lerp(targetColorRef.current, 0.15);

    // Emissive intensity:
    //   running  → sine-wave 0.8..1.4 at ~1.5 Hz
    //   completed → solid 1.2
    //   failed    → solid 1.2
    //   idle      → steady 0.8
    let target = 0.8;
    if (effective === "running") {
      target = 1.1 + Math.sin(t * Math.PI * 2 * 1.5) * 0.3;
    } else if (effective === "completed" || effective === "failed") {
      target = 1.2;
    }
    material.emissiveIntensity += (target - material.emissiveIntensity) * 0.2;
  });

  const initialColor = colorFor(effective);
  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[0.18, 16, 16]} />
      <meshLambertMaterial
        ref={materialRef}
        color={initialColor}
        emissive={initialColor}
        emissiveIntensity={0.8}
      />
    </mesh>
  );
}
