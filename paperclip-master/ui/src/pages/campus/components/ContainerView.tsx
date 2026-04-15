import { useRef, type ReactNode } from "react";
import { Edges, Text } from "@react-three/drei";
import { useLabelColor } from "../lib/label-color";
import { useFrame } from "@react-three/fiber";
import { Color, type Group } from "three";
import { palette } from "../palette";
import type { ContainerLiveStatus } from "../hooks/useContainerLiveStatus";
import "../shaders/wall-stucco";
import "../shaders/roof-shingle";
import "../shaders/grass";

export type ContainerLayer = "room" | "floor" | "building" | "campus";

interface ContainerViewProps {
  layer: ContainerLayer;
  name: string;
  children: ReactNode;
  /**
   * Aggregated live status for this container (B5). When "running", the
   * shell emits a soft outline glow that pulses in sync with descendant
   * activity. When undefined/idle, the shell renders as before.
   */
  status?: ContainerLiveStatus;
  // Future: container-level click routing for child picking. Unused in B2/B3
  // because each child view wires its own onClick via navigate(). Kept in the
  // public API so B4+ can switch to container-driven picking without churn.
  onChildClick?: (id: string) => void;
}

/**
 * GlowHalo — a soft pulsing outline drawn around a container shell when the
 * container has a running descendant. Cheap: one wireframe box + useFrame.
 */
function GlowHalo({
  size,
  position,
  active,
}: {
  size: [number, number, number];
  position: [number, number, number];
  active: boolean;
}) {
  const groupRef = useRef<Group>(null);
  useFrame(({ clock }) => {
    const g = groupRef.current;
    if (!g) return;
    if (!active) {
      // Quickly fade out when inactive.
      g.scale.x += (1 - g.scale.x) * 0.1;
      g.scale.y += (1 - g.scale.y) * 0.1;
      g.scale.z += (1 - g.scale.z) * 0.1;
      const child = g.children[0];
      if (child) {
        child.visible = g.scale.x > 1.002;
      }
      return;
    }
    const t = clock.getElapsedTime();
    // Gentle breathing at ~0.8 Hz, 2-4% scale up.
    const pulse = 1.02 + Math.sin(t * Math.PI * 2 * 0.8) * 0.015;
    g.scale.setScalar(pulse);
    const child = g.children[0];
    if (child) child.visible = true;
  });
  return (
    <group ref={groupRef} position={position}>
      <mesh visible={false}>
        <boxGeometry args={size} />
        <meshBasicMaterial transparent opacity={0} />
        <Edges color={palette.accent} threshold={15} />
      </mesh>
    </group>
  );
}

// Room shell: 4 low walls + floor plane. Inside dims ~6x6 so ~4 animals fit
// comfortably on a grid along x.
function RoomShell({ name, active }: { name: string; active: boolean }) {
  const labelColor = useLabelColor();
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
        <wallStuccoMaterial color={new Color(palette.bone)} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      {/* Front wall (+z) */}
      <mesh position={[0, -0.5 + wallH / 2, half]}>
        <boxGeometry args={[inner, wallH, wallT]} />
        <wallStuccoMaterial color={new Color(palette.bone)} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      {/* Left wall (-x) */}
      <mesh position={[-half, -0.5 + wallH / 2, 0]}>
        <boxGeometry args={[wallT, wallH, inner]} />
        <wallStuccoMaterial color={new Color(palette.cream)} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      {/* Right wall (+x) */}
      <mesh position={[half, -0.5 + wallH / 2, 0]}>
        <boxGeometry args={[wallT, wallH, inner]} />
        <wallStuccoMaterial color={new Color(palette.cream)} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>

      <Text
        position={[0, -0.45, half + 0.3]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.3}
        color={labelColor}
        anchorX="center"
        anchorY="middle"
      >
        {name}
      </Text>

      <GlowHalo size={[inner + 0.5, 1.5, inner + 0.5]} position={[0, -0.1, 0]} active={active} />
    </group>
  );
}

// Floor shell: single horizontal slab, larger than a room.
function FloorShell({ name, active }: { name: string; active: boolean }) {
  const labelColor = useLabelColor();
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
        color={labelColor}
        anchorX="center"
        anchorY="middle"
      >
        {name}
      </Text>
      <GlowHalo size={[12.6, 0.6, 12.6]} position={[0, -0.5, 0]} active={active} />
    </group>
  );
}

// Building shell: K3 — ground pad + label + glow halo only. The
// translucent tower box was replaced by a GLB building body rendered by
// BuildingView as a child of ContainerView (so the campus reads as a
// real building rather than a transparent cube). The halo still breathes
// around the rough tower volume when descendants are running.
function BuildingShell({ name, active }: { name: string; active: boolean }) {
  const labelColor = useLabelColor();
  return (
    <group>
      {/* Ground pad */}
      <mesh position={[0, -0.7, 0]}>
        <boxGeometry args={[10, 0.2, 10]} />
        <meshLambertMaterial color={palette.ground} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      <Text
        position={[0, -0.59, 5.6]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.45}
        color={labelColor}
        anchorX="center"
        anchorY="middle"
      >
        {name}
      </Text>
      <GlowHalo size={[5.4, 7.4, 5.4]} position={[0, 3, 0]} active={active} />
    </group>
  );
}

// Campus shell: Phase S2 — the ground is now a <HexIsland> mounted by
// CampusView directly; this shell is a no-op. The campus name is rendered
// via the HTML breadcrumb overlay (CampusOverlay), not in 3D.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function CampusShell(_: { name: string; active: boolean }) {
  return null;
}

/**
 * ContainerView — single reusable "shell" primitive for any non-leaf layer.
 * Renders different geometry per layer, in palette-only flat Lambert with
 * outlines. No textures, no shadows, no PBR. When `status === "running"` a
 * soft outline glow breathes around the shell (Phase B5 cascade).
 */
export function ContainerView({ layer, name, children, status }: ContainerViewProps) {
  const active = status === "running";
  return (
    <group>
      {layer === "room" && <RoomShell name={name} active={active} />}
      {layer === "floor" && <FloorShell name={name} active={active} />}
      {layer === "building" && <BuildingShell name={name} active={active} />}
      {layer === "campus" && <CampusShell name={name} active={active} />}
      {children}
    </group>
  );
}
