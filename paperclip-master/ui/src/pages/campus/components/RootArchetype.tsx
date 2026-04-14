import { useState } from "react";
import { Edges, Text, useCursor } from "@react-three/drei";
import type { Agent } from "@paperclipai/shared";
import { readZootropolisLayer } from "@paperclipai/shared";
import { BuildingWindows } from "./BuildingWindows";
import { BuildingModel } from "./models/BuildingModel";
import { Animal } from "./Animal";
import { useContainerLiveStatus } from "../hooks/useContainerLiveStatus";
import { pickAnimalPaletteKey } from "../hooks/useContainerChildren";
import { palette } from "../palette";

type Pos = [number, number, number];

interface RootArchetypeProps {
  agent: Agent;
  position: Pos;
  companyId: string | undefined;
  onClick: () => void;
}

/**
 * Phase N1 — per-layer child dispatcher for the campus root.
 *
 * When there are multiple agents at the campus root (i.e., agents with
 * reportsTo=null), they may sit at any layer: a lone leaf, a standalone
 * room, a single floor, etc. Prior to N1 the CampusView rendered EVERY
 * root as a building, which made a single leaf appear as a ghost tower.
 *
 * This component reads each child's `metadata.zootropolis.layer` and
 * renders it with the matching archetype:
 *   - agent   → Animal (little low-poly creature)
 *   - room    → miniature walled-room shell icon
 *   - floor   → miniature slab icon
 *   - building → full BuildingModel + BuildingWindows (current behaviour)
 *   - campus  → stack of 2 small building silhouettes (rare case)
 *
 * Click routes into the appropriate layer view; the parent CampusScene
 * wraps this with its camera transition so navigation is animated.
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
      return <CampusTile {...props} />;
    case "building":
    default:
      return <BuildingTile {...props} />;
  }
}

/** Agent at the campus root = an orphan leaf. Render as a walking animal
 *  on the grass, with a small label underneath. No building, no room. */
function AgentTile({ agent, position, onClick }: RootArchetypeProps) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const color = palette[pickAnimalPaletteKey(agent.id)];
  const [x, y, z] = position;
  return (
    <group
      position={[x, y, z]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Animal
        color={color}
        agentId={agent.id}
        role={agent.role ?? undefined}
      />
      <Text
        position={[0, -0.9, 1.2]}
        rotation={[-Math.PI / 6, 0, 0]}
        fontSize={0.28}
        color={palette.ink}
        anchorX="center"
        anchorY="middle"
      >
        {agent.name}
      </Text>
    </group>
  );
}

/** Room at the campus root = an orphan room with its own leaves. Render
 *  as a miniature room shell (4 walls + floor) small enough to fit the
 *  grid buildingPosition() uses. */
function RoomTile({ agent, position, onClick }: RootArchetypeProps) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const [x, y, z] = position;
  const lift = hovered ? 0.15 : 0;
  // Small room footprint: 2.4 wide, 0.4 tall walls.
  const W = 2.4;
  const WALL_H = 0.4;
  const FLOOR_THICKNESS = 0.08;
  return (
    <group
      position={[x, y + lift, z]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {/* Floor slab */}
      <mesh position={[0, FLOOR_THICKNESS / 2, 0]}>
        <boxGeometry args={[W, FLOOR_THICKNESS, W]} />
        <meshLambertMaterial color={palette.ground} />
        <Edges color={palette.ink} />
      </mesh>
      {/* Four low walls */}
      {[
        [0, WALL_H / 2 + FLOOR_THICKNESS, W / 2, W, WALL_H, 0.1],
        [0, WALL_H / 2 + FLOOR_THICKNESS, -W / 2, W, WALL_H, 0.1],
        [W / 2, WALL_H / 2 + FLOOR_THICKNESS, 0, 0.1, WALL_H, W],
        [-W / 2, WALL_H / 2 + FLOOR_THICKNESS, 0, 0.1, WALL_H, W],
      ].map(([px, py, pz, sx, sy, sz], i) => (
        <mesh key={i} position={[px, py, pz]}>
          <boxGeometry args={[sx, sy, sz]} />
          <meshLambertMaterial color={palette.bone} />
          <Edges color={palette.ink} />
        </mesh>
      ))}
      <Text
        position={[0, FLOOR_THICKNESS + WALL_H + 0.25, 0]}
        rotation={[-Math.PI / 6, 0, 0]}
        fontSize={0.26}
        color={palette.ink}
        anchorX="center"
        anchorY="middle"
      >
        {agent.name}
      </Text>
    </group>
  );
}

/** Floor at the campus root = a standalone slab with its own rooms. */
function FloorTile({ agent, position, onClick }: RootArchetypeProps) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const [x, y, z] = position;
  const lift = hovered ? 0.15 : 0;
  const W = 3.2;
  const H = 0.35;
  return (
    <group
      position={[x, y + lift, z]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <mesh position={[0, H / 2, 0]}>
        <boxGeometry args={[W, H, W]} />
        <meshLambertMaterial color={palette.dustBlue} />
        <Edges color={palette.ink} />
      </mesh>
      <Text
        position={[0, H + 0.25, 0]}
        rotation={[-Math.PI / 6, 0, 0]}
        fontSize={0.26}
        color={palette.ink}
        anchorX="center"
        anchorY="middle"
      >
        {agent.name}
      </Text>
    </group>
  );
}

/** Building tile — the common case. Matches the previous BuildingPlaceholder
 *  but refactored to take generic RootArchetype props. */
function BuildingTile({ agent, position, companyId, onClick }: RootArchetypeProps) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const [x, y, z] = position;
  const lift = hovered ? 0.2 : 0;
  const buildingStatus = useContainerLiveStatus(companyId ?? "", agent.id);
  const windowsActive = buildingStatus === "running";
  const windowsIntensity = windowsActive ? 1.0 : 0.15;
  return (
    <group
      position={[x, y + lift, z]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <BuildingModel agentId={agent.id} />
      <BuildingWindows
        width={3}
        height={3.2}
        y={1.6}
        z={1.5}
        active={windowsActive}
        intensity={windowsIntensity}
        seed={agent.id}
      />
      <Text
        position={[0, 0.05, 1.8]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.32}
        color={palette.ink}
        anchorX="center"
        anchorY="middle"
      >
        {agent.name}
      </Text>
    </group>
  );
}

/** Campus-layer root: a small cluster of 2 tiny buildings to indicate
 *  "this is a nested campus." Rare — most trees don't nest campuses. */
function CampusTile(props: RootArchetypeProps) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const { agent, position, onClick } = props;
  const [x, y, z] = position;
  const lift = hovered ? 0.15 : 0;
  return (
    <group
      position={[x, y + lift, z]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {/* Two miniature towers side by side */}
      <mesh position={[-0.6, 0.75, 0]}>
        <boxGeometry args={[0.8, 1.5, 0.8]} />
        <meshLambertMaterial color={palette.bone} />
        <Edges color={palette.ink} />
      </mesh>
      <mesh position={[0.6, 1.1, 0]}>
        <boxGeometry args={[0.8, 2.2, 0.8]} />
        <meshLambertMaterial color={palette.cream} />
        <Edges color={palette.ink} />
      </mesh>
      <Text
        position={[0, 2.6, 0]}
        rotation={[-Math.PI / 6, 0, 0]}
        fontSize={0.28}
        color={palette.ink}
        anchorX="center"
        anchorY="middle"
      >
        {agent.name}
      </Text>
    </group>
  );
}

/** Pick the right child-route segment for a given layer, so the caller
 *  can build a navigation target in one line. */
export function routeForLayer(
  layer: string | undefined,
): "agent" | "room" | "floor" | "building" | null {
  if (layer === "agent") return "agent";
  if (layer === "room") return "room";
  if (layer === "floor") return "floor";
  if (layer === "building") return "building";
  return null; // campus: the root IS the canvas, nothing to route to
}
