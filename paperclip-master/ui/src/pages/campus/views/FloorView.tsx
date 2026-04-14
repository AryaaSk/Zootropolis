import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Edges, OrbitControls, Text, useCursor } from "@react-three/drei";
import { useNavigate, useParams } from "@/lib/router";
import type { Agent } from "@paperclipai/shared";
import { Vector3 } from "three";
import { CampusOverlay } from "../components/CampusOverlay";
import { CampusPostFx } from "../components/CampusPostFx";
import { ContainerView } from "../components/ContainerView";
import {
  EmptyLayerOverlay,
  LoadingOverlay,
  NotFoundOverlay,
} from "../components/SceneOverlays";
import { useContainerChildren } from "../hooks/useContainerChildren";
import { useContainerLiveStatus } from "../hooks/useContainerLiveStatus";
import { palette } from "../palette";
import {
  ZoomTransitionProvider,
  useIsTransitioning,
  useZoomInEntrance,
  useZoomInTransition,
} from "../lib/zoom-transition";

const FLOOR_CAMERA: [number, number, number] = [9, 8, 11];
const FLOOR_LOOKAT: [number, number, number] = [0, 0, 0];

/** Lay out N rooms on a single-row grid centered on the slab. */
function roomPosition(index: number, total: number): [number, number, number] {
  const spacing = 3.5;
  const x = (index - (total - 1) / 2) * spacing;
  return [x, 0, 0];
}

function RoomPlaceholder({
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
      {/* Small room-shaped box shell */}
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[2.6, 1.0, 2.6]} />
        <meshLambertMaterial color={palette.bone} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      {/* Roof accent */}
      <mesh position={[0, 0.85, 0]}>
        <boxGeometry args={[2.8, 0.2, 2.8]} />
        <meshLambertMaterial color={palette.terracotta} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      <Text
        position={[0, 1.15, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.25}
        color={palette.ink}
        anchorX="center"
        anchorY="middle"
      >
        {agent.name}
      </Text>
    </group>
  );
}

function FloorScene({
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
  const floorName = self?.name ?? id ?? "Floor";
  const liveStatus = useContainerLiveStatus(companyId ?? "", id ?? null);
  const transitionTo = useZoomInTransition();
  const isTransitioning = useIsTransitioning();
  useZoomInEntrance(FLOOR_CAMERA, FLOOR_LOOKAT);

  const showNotFound = !loading && !!id && self === null;
  const backHref = parent
    ? `/campus/${companyId}/building/${parent.id}`
    : `/campus/${companyId}`;
  const backLabel = parent ? "building" : "campus";

  return (
    <>
      <color attach="background" args={[palette.sky]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 8, 3]} intensity={0.6} />

      <ContainerView layer="floor" name={floorName} status={liveStatus}>
        {loading ? (
          <LoadingOverlay />
        ) : showNotFound ? (
          <NotFoundOverlay layer="floor" backHref={backHref} backLabel={backLabel} />
        ) : children.length === 0 ? (
          <EmptyLayerOverlay layer="floor" />
        ) : (
          children.map((agent, i) => {
            const pos = roomPosition(i, children.length);
            return (
              <RoomPlaceholder
                key={agent.id}
                agent={agent}
                position={pos}
                onClick={() =>
                  transitionTo(
                    // Aim at the roof-line so the handoff frames the room shell.
                    new Vector3(pos[0], pos[1] + 0.5, pos[2]),
                    () => navigate(`/campus/${companyId}/room/${agent.id}`),
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
        minDistance={6}
        maxDistance={24}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.2}
        target={FLOOR_LOOKAT}
      />

      <CampusPostFx />
    </>
  );
}

/**
 * FloorView — a floor slab with one room per child agent.
 * Click → dolly the camera toward the room, then route into RoomView.
 */
export function FloorView() {
  const { companyId, id } = useParams<{ companyId: string; id: string }>();

  return (
    <div className="relative h-[calc(100vh-0px)] w-full">
      <Canvas camera={{ position: FLOOR_CAMERA, fov: 45 }} shadows={false} dpr={[1, 2]}>
        <ZoomTransitionProvider>
          <FloorScene companyId={companyId} id={id} />
        </ZoomTransitionProvider>
      </Canvas>
      <CampusOverlay />
    </div>
  );
}
