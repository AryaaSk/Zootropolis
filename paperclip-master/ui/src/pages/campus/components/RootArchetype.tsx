import { useRef, useState } from "react";
import { Edges, Text, useCursor } from "@react-three/drei";
import type { Group } from "three";
import type { Agent } from "@paperclipai/shared";
import { readZootropolisLayer } from "@paperclipai/shared";
import { BuildingModel } from "./models/BuildingModel";
import { Animal } from "./Animal";
import { AgentScreen } from "./AgentScreen";
import { pickAnimalPaletteKey, useContainerChildren } from "../hooks/useContainerChildren";
import { useContainerLiveStatus } from "../hooks/useContainerLiveStatus";
import { useHoverEmissive } from "../lib/useHoverEmissive";
import { useLabelColor } from "../lib/label-color";
import { useSmoothPosition } from "../lib/useSmoothPosition";
import { palette } from "../palette";

type Pos = [number, number, number];

interface RootArchetypeProps {
  agent: Agent;
  position: Pos;
  companyId: string | undefined;
  onClick: () => void;
  /**
   * Phase T2 — called when the pointer is pressed on this tile. The
   * parent uses this to begin a drag gesture; tiles don't own the drag
   * state. `clientX/Y` is the browser pointer position so the gesture
   * hook can threshold movement.
   */
  onPointerDownTile?: (event: { clientX: number; clientY: number }) => void;
  /**
   * Phase T5a — when true, the tile snaps hard to `position` each
   * frame (pinned to cursor during active drag). When false, the tile
   * smoothly damps toward it so swap-on-drop reads as animation.
   */
  dragging?: boolean;
}

/**
 * Phase N1 — per-layer child dispatcher for the campus root.
 *
 * Hover feedback (Phase S polish v3) is an emissive-color boost on the
 * whole object's materials, applied via useHoverEmissive(). No geometry
 * moves, and the entire mesh visibly glows the hover color (default:
 * warm white) so clickability is unambiguous.
 */
export function RootArchetype(props: RootArchetypeProps) {
  const layer = readZootropolisLayer(props.agent.metadata) ?? "agent";
  switch (layer) {
    case "agent":
      return <AgentTile {...props} />;
    case "room":
      return <RoomTile {...props} />;
    case "floor":
      return <FloorTile {...props} />;
    case "campus":
    case "building":
    default:
      // Campus-tagged agents are never child tiles: the campus agent is
      // the IMPLICIT root (CampusScene unfolds it and renders its
      // children). If one somehow appears here it's legacy data —
      // render as a building so the user isn't stuck.
      return <BuildingTile {...props} />;
  }
}

function AgentTile({ agent, position, companyId, onClick, onPointerDownTile, dragging }: RootArchetypeProps) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const ref = useRef<Group>(null);
  useHoverEmissive(ref, hovered, { color: "#ffffff", intensity: 0.8 });
  const color = palette[pickAnimalPaletteKey(agent.id)];
  const [x, y, z] = position;
  useSmoothPosition(ref, [x, y, z], dragging === true);
  const labelColor = useLabelColor();
  return (
    <group
      ref={ref}

      onPointerEnter={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onPointerDown={(e) => {
        e.stopPropagation();
        onPointerDownTile?.({ clientX: (e.nativeEvent as PointerEvent).clientX, clientY: (e.nativeEvent as PointerEvent).clientY });
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Animal color={color} agentId={agent.id} role={agent.role ?? undefined} />
      <Text
        position={[0, -0.9, 1.2]}
        rotation={[-Math.PI / 6, 0, 0]}
        fontSize={0.28}
        color={labelColor}
        anchorX="center"
        anchorY="middle"
      >
        {agent.name}
      </Text>
      {/* Phase W9 — floating status screen above the animal head.
          Animal head ≈ 1.95 world units; screen at y=4 floats well
          clear so camera angles rarely overlap it with the body. */}
      {companyId && (
        <group position={[0, 4, 0]} userData={{ boundsIgnore: true }}>
          <AgentScreen companyId={companyId} agentId={agent.id} />
        </group>
      )}
    </group>
  );
}

function RoomTile({ agent, position, companyId, onClick, onPointerDownTile, dragging }: RootArchetypeProps) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const ref = useRef<Group>(null);
  useHoverEmissive(ref, hovered);
  const [x, y, z] = position;
  useSmoothPosition(ref, [x, y, z], dragging === true);
  const labelColor = useLabelColor();
  const W = 2.4;
  const WALL_H = 0.4;
  const FLOOR_THICKNESS = 0.08;
  return (
    <group
      ref={ref}

      onPointerEnter={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onPointerDown={(e) => {
        e.stopPropagation();
        onPointerDownTile?.({ clientX: (e.nativeEvent as PointerEvent).clientX, clientY: (e.nativeEvent as PointerEvent).clientY });
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <mesh position={[0, FLOOR_THICKNESS / 2, 0]}>
        <boxGeometry args={[W, FLOOR_THICKNESS, W]} />
        <meshStandardMaterial color={palette.ground} />
        <Edges color={palette.ink} />
      </mesh>
      {[
        [0, WALL_H / 2 + FLOOR_THICKNESS, W / 2, W, WALL_H, 0.1],
        [0, WALL_H / 2 + FLOOR_THICKNESS, -W / 2, W, WALL_H, 0.1],
        [W / 2, WALL_H / 2 + FLOOR_THICKNESS, 0, 0.1, WALL_H, W],
        [-W / 2, WALL_H / 2 + FLOOR_THICKNESS, 0, 0.1, WALL_H, W],
      ].map(([px, py, pz, sx, sy, sz], i) => (
        <mesh key={i} position={[px, py, pz]}>
          <boxGeometry args={[sx, sy, sz]} />
          <meshStandardMaterial color={palette.bone} />
          <Edges color={palette.ink} />
        </mesh>
      ))}
      <Text
        position={[0, FLOOR_THICKNESS + WALL_H + 0.25, 0]}
        rotation={[-Math.PI / 6, 0, 0]}
        fontSize={0.26}
        color={labelColor}
        anchorX="center"
        anchorY="middle"
      >
        {agent.name}
      </Text>
      {/* Phase W9 — floating status screen above the room. */}
      {companyId && (
        <group position={[0, FLOOR_THICKNESS + WALL_H + 2.6, 0]} userData={{ boundsIgnore: true }}>
          <AgentScreen companyId={companyId} agentId={agent.id} />
        </group>
      )}
    </group>
  );
}

function FloorTile({ agent, position, companyId, onClick, onPointerDownTile, dragging }: RootArchetypeProps) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const ref = useRef<Group>(null);
  useHoverEmissive(ref, hovered);
  const [x, y, z] = position;
  useSmoothPosition(ref, [x, y, z], dragging === true);
  const labelColor = useLabelColor();
  const W = 3.2;
  const H = 0.35;
  return (
    <group
      ref={ref}

      onPointerEnter={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onPointerDown={(e) => {
        e.stopPropagation();
        onPointerDownTile?.({ clientX: (e.nativeEvent as PointerEvent).clientX, clientY: (e.nativeEvent as PointerEvent).clientY });
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <mesh position={[0, H / 2, 0]}>
        <boxGeometry args={[W, H, W]} />
        <meshStandardMaterial color={palette.dustBlue} />
        <Edges color={palette.ink} />
      </mesh>
      <Text
        position={[0, H + 0.25, 0]}
        rotation={[-Math.PI / 6, 0, 0]}
        fontSize={0.26}
        color={labelColor}
        anchorX="center"
        anchorY="middle"
      >
        {agent.name}
      </Text>
      {/* Phase W9 — floating status screen above the floor slab. */}
      {companyId && (
        <group position={[0, H + 2.6, 0]} userData={{ boundsIgnore: true }}>
          <AgentScreen companyId={companyId} agentId={agent.id} />
        </group>
      )}
    </group>
  );
}

function BuildingTile({ agent, position, companyId, onClick, onPointerDownTile, dragging }: RootArchetypeProps) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const ref = useRef<Group>(null);
  useHoverEmissive(ref, hovered);
  const [x, y, z] = position;
  useSmoothPosition(ref, [x, y, z], dragging === true);
  const labelColor = useLabelColor();
  const buildingStatus = useContainerLiveStatus(companyId ?? "", agent.id);
  const windowsActive = buildingStatus === "running";
  const windowsIntensity = windowsActive ? 1.0 : 0.15;
  const { children: descendants } = useContainerChildren(companyId ?? "", agent.id);
  const hasWork = descendants.length > 0;
  return (
    <group
      ref={ref}

      onPointerEnter={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onPointerDown={(e) => {
        e.stopPropagation();
        onPointerDownTile?.({ clientX: (e.nativeEvent as PointerEvent).clientX, clientY: (e.nativeEvent as PointerEvent).clientY });
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <BuildingModel
        agentId={agent.id}
        showWindows={hasWork}
        windowsActive={windowsActive}
        windowsIntensity={windowsIntensity}
      />
      <Text
        // Phase X7 — keep the label INSIDE the hex tile (HEX_SIZE = 2.2
        // so a tile vertex sits at z=2.2). Moved from z=2.3 → z=1.4 so
        // the label hugs the building's footprint instead of spilling
        // onto the next tile.
        position={[0, 0.05, 1.4]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.32}
        color={labelColor}
        anchorX="center"
        anchorY="middle"
      >
        {agent.name}
      </Text>
      {/* Phase X5 — building screen at y=6 sits comfortably above the
          taller GLBs while keeping the screen visually attached to the
          building rather than floating in empty sky. */}
      {companyId && (
        <group position={[0, 6, 0]} userData={{ boundsIgnore: true }}>
          <AgentScreen companyId={companyId} agentId={agent.id} />
        </group>
      )}
    </group>
  );
}

function CampusTile(props: RootArchetypeProps) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const ref = useRef<Group>(null);
  useHoverEmissive(ref, hovered);
  const { agent, position, onClick, onPointerDownTile, dragging } = props;
  const [x, y, z] = position;
  useSmoothPosition(ref, [x, y, z], dragging === true);
  const labelColor = useLabelColor();
  return (
    <group
      ref={ref}

      onPointerEnter={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onPointerDown={(e) => {
        e.stopPropagation();
        onPointerDownTile?.({ clientX: (e.nativeEvent as PointerEvent).clientX, clientY: (e.nativeEvent as PointerEvent).clientY });
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <mesh position={[-0.6, 0.75, 0]}>
        <boxGeometry args={[0.8, 1.5, 0.8]} />
        <meshStandardMaterial color={palette.bone} />
        <Edges color={palette.ink} />
      </mesh>
      <mesh position={[0.6, 1.1, 0]}>
        <boxGeometry args={[0.8, 2.2, 0.8]} />
        <meshStandardMaterial color={palette.cream} />
        <Edges color={palette.ink} />
      </mesh>
      <Text
        position={[0, 2.6, 0]}
        rotation={[-Math.PI / 6, 0, 0]}
        fontSize={0.28}
        color={labelColor}
        anchorX="center"
        anchorY="middle"
      >
        {agent.name}
      </Text>
    </group>
  );
}

export function routeForLayer(
  layer: string | undefined,
): "agent" | "room" | "floor" | "building" | null {
  if (layer === "agent") return "agent";
  if (layer === "room") return "room";
  if (layer === "floor") return "floor";
  if (layer === "building") return "building";
  return null;
}
