import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text, useCursor } from "@react-three/drei";
import { useNavigate, useParams } from "@/lib/router";
import type { Agent } from "@paperclipai/shared";
import { Vector3 } from "three";
import { Animal } from "../components/Animal";
import { CampusOverlay } from "../components/CampusOverlay";
import { CampusPostFx } from "../components/CampusPostFx";
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
import { useContainerLiveStatus } from "../hooks/useContainerLiveStatus";
import { palette } from "../palette";
import {
  ZoomTransitionProvider,
  useIsTransitioning,
  useZoomInEntrance,
  useZoomInTransition,
} from "../lib/zoom-transition";

const ROOM_CAMERA: [number, number, number] = [6, 5, 7];
const ROOM_LOOKAT: [number, number, number] = [0, 0.4, 0];

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
      <Animal color={color} agentId={agent.id} />
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

function RoomScene({
  companyId,
  id,
}: {
  companyId: string | undefined;
  id: string | undefined;
}) {
  const navigate = useNavigate();
  const { self, parent, children, loading } = useContainerChildren(
    companyId ?? "",
    id ?? null,
  );
  const roomName = self?.name ?? id ?? "Room";
  const liveStatus = useContainerLiveStatus(companyId ?? "", id ?? null);
  const transitionTo = useZoomInTransition();
  const isTransitioning = useIsTransitioning();
  useZoomInEntrance(ROOM_CAMERA, ROOM_LOOKAT);

  const showNotFound = !loading && !!id && self === null;
  const backHref = parent
    ? `/campus/${companyId}/floor/${parent.id}`
    : `/campus/${companyId}`;
  const backLabel = parent ? "floor" : "campus";

  return (
    <>
      <color attach="background" args={[palette.sky]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 8, 3]} intensity={0.6} />

      <ContainerView layer="room" name={roomName} status={liveStatus}>
        {loading ? (
          <LoadingOverlay />
        ) : showNotFound ? (
          <NotFoundOverlay layer="room" backHref={backHref} backLabel={backLabel} />
        ) : children.length === 0 ? (
          <EmptyLayerOverlay layer="room" />
        ) : (
          children.map((agent, i) => {
            const pos = animalPosition(i, children.length);
            return (
              <ClickableAnimal
                key={agent.id}
                agent={agent}
                position={pos}
                onClick={() =>
                  transitionTo(
                    new Vector3(pos[0], pos[1] + 0.4, pos[2]),
                    () => navigate(`/campus/${companyId}/agent/${agent.id}`),
                  )
                }
              />
            );
          })
        )}
      </ContainerView>

      <OrbitControls
        enabled={!isTransitioning}
        enablePan={false}
        minDistance={5}
        maxDistance={16}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.2}
        target={ROOM_LOOKAT}
      />

      <CampusPostFx />
    </>
  );
}

/**
 * RoomView — a room shell with one animal per leaf-agent child.
 * Click an animal → dolly the camera toward it, then route into AgentView.
 */
export function RoomView() {
  const { companyId, id } = useParams<{ companyId: string; id: string }>();

  return (
    <div className="relative h-[calc(100vh-0px)] w-full">
      <Canvas camera={{ position: ROOM_CAMERA, fov: 45 }} shadows={false} dpr={[1, 2]}>
        <ZoomTransitionProvider>
          <RoomScene companyId={companyId} id={id} />
        </ZoomTransitionProvider>
      </Canvas>
      <CampusOverlay />
    </div>
  );
}
