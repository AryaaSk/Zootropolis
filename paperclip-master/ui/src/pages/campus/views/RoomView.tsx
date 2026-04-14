import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text, useCursor } from "@react-three/drei";
import { useNavigate, useParams } from "@/lib/router";
import type { Agent } from "@paperclipai/shared";
import { Animal } from "../components/Animal";
import { ContainerView } from "../components/ContainerView";
import {
  EmptyLayerOverlay,
  LoadingOverlay,
  NotFoundOverlay,
} from "../components/SceneOverlays";
import {
  pickAnimalPaletteKey,
  useContainerChildren,
} from "../hooks/useContainerChildren";
import { palette } from "../palette";

/** Lay out N animals in a single row across the room floor. */
function animalPosition(index: number, total: number): [number, number, number] {
  const spacing = 1.8;
  const x = (index - (total - 1) / 2) * spacing;
  return [x, 0, 0];
}

function ClickableAnimal({
  agent,
  position,
  onClick,
}: {
  agent: Agent;
  position: [number, number, number];
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const [x, y, z] = position;
  const lift = hovered ? 0.2 : 0;
  const color = palette[pickAnimalPaletteKey(agent.id)];

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
      <Animal color={color} />
      <Text
        position={[0, -0.45, 1.2]}
        rotation={[-Math.PI / 6, 0, 0]}
        fontSize={0.18}
        color={palette.ink}
        anchorX="center"
        anchorY="middle"
      >
        {agent.name}
      </Text>
    </group>
  );
}

/**
 * RoomView — a room shell with one animal per leaf-agent child.
 * Click an animal → AgentView for that agent id.
 */
export function RoomView() {
  const navigate = useNavigate();
  const { companyId, id } = useParams<{ companyId: string; id: string }>();
  const { self, parent, children, loading } = useContainerChildren(
    companyId ?? "",
    id ?? null,
  );
  const roomName = self?.name ?? id ?? "Room";

  const showNotFound = !loading && !!id && self === null;
  const backHref = parent
    ? `/campus/${companyId}/floor/${parent.id}`
    : `/campus/${companyId}`;
  const backLabel = parent ? "floor" : "campus";

  return (
    <div className="h-[calc(100vh-0px)] w-full">
      <Canvas camera={{ position: [6, 5, 7], fov: 45 }} shadows={false} dpr={[1, 2]}>
        <color attach="background" args={[palette.sky]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 8, 3]} intensity={0.6} />

        <ContainerView layer="room" name={roomName}>
          {loading ? (
            <LoadingOverlay />
          ) : showNotFound ? (
            <NotFoundOverlay layer="room" backHref={backHref} backLabel={backLabel} />
          ) : children.length === 0 ? (
            <EmptyLayerOverlay layer="room" />
          ) : (
            children.map((agent, i) => (
              <ClickableAnimal
                key={agent.id}
                agent={agent}
                position={animalPosition(i, children.length)}
                onClick={() => navigate(`/campus/${companyId}/agent/${agent.id}`)}
              />
            ))
          )}
        </ContainerView>

        <OrbitControls
          enablePan={false}
          minDistance={5}
          maxDistance={16}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.2}
          target={[0, 0.4, 0]}
        />
      </Canvas>
    </div>
  );
}
