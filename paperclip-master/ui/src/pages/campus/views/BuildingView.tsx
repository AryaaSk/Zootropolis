import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Edges, OrbitControls, Text, useCursor } from "@react-three/drei";
import { useNavigate, useParams } from "@/lib/router";
import type { Agent } from "@paperclipai/shared";
import { Vector3 } from "three";
import { CampusDecorations } from "../components/CampusDecorations";
import { CampusEnvironment } from "../components/CampusEnvironment";
import { CampusOverlay } from "../components/CampusOverlay";
import { CampusPostFx } from "../components/CampusPostFx";
import { ContainerInspector } from "../components/ContainerInspector";
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

const BUILDING_CAMERA: [number, number, number] = [10, 6, 12];
const BUILDING_LOOKAT: [number, number, number] = [0, 2.5, 0];

function FloorSlabPlaceholder({
  agent,
  y,
  onClick,
}: {
  agent: Agent;
  y: number;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const lift = hovered ? 0.12 : 0;

  return (
    <group
      position={[0, y + lift, 0]}
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
      <mesh>
        <boxGeometry args={[4.4, 1.2, 4.4]} />
        <meshLambertMaterial color={palette.dustBlue} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      <Text
        position={[0, 0, 2.3]}
        fontSize={0.3}
        color={palette.ink}
        anchorX="center"
        anchorY="middle"
      >
        {agent.name}
      </Text>
    </group>
  );
}

function BuildingScene({
  companyId,
  id,
}: {
  companyId: string | undefined;
  id: string | undefined;
}) {
  const navigate = useNavigate();
  const { self, children, loading } = useContainerChildren(companyId ?? "", id ?? null);
  const buildingName = self?.name ?? id ?? "Building";
  const liveStatus = useContainerLiveStatus(companyId ?? "", id ?? null);
  const transitionTo = useZoomInTransition();
  const isTransitioning = useIsTransitioning();
  useZoomInEntrance(BUILDING_CAMERA, BUILDING_LOOKAT);

  const showNotFound = !loading && !!id && self === null;

  return (
    <>
      <CampusEnvironment />
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 8, 3]} intensity={0.6} />

      <ContainerView layer="building" name={buildingName} status={liveStatus}>
        {loading ? (
          <LoadingOverlay />
        ) : showNotFound ? (
          <NotFoundOverlay
            layer="building"
            backHref={`/campus/${companyId}`}
            backLabel="campus"
          />
        ) : children.length === 0 ? (
          <EmptyLayerOverlay layer="building" />
        ) : (
          children.map((agent, i) => {
            const y = 0.5 + i * 2;
            return (
              <FloorSlabPlaceholder
                key={agent.id}
                agent={agent}
                y={y}
                onClick={() =>
                  transitionTo(new Vector3(0, y, 0), () =>
                    navigate(`/campus/${companyId}/floor/${agent.id}`),
                  )
                }
              />
            );
          })
        )}
      </ContainerView>

      <CampusDecorations layer="building" companyId={companyId} parentId={id} />

      <OrbitControls
        enabled={!isTransitioning}
        enablePan={false}
        minDistance={6}
        maxDistance={22}
        minPolarAngle={Math.PI / 8}
        maxPolarAngle={Math.PI / 2.2}
        target={BUILDING_LOOKAT}
      />

      <CampusPostFx />
    </>
  );
}

/**
 * BuildingView — a building shell with one slab per child floor agent.
 * Click → dolly the camera toward the floor, then route into FloorView.
 */
export function BuildingView() {
  const { companyId, id } = useParams<{ companyId: string; id: string }>();

  return (
    <div className="relative h-[calc(100vh-0px)] w-full">
      <Canvas camera={{ position: BUILDING_CAMERA, fov: 45 }} shadows={false} dpr={[1, 2]}>
        <ZoomTransitionProvider>
          <BuildingScene companyId={companyId} id={id} />
        </ZoomTransitionProvider>
      </Canvas>
      <CampusOverlay />
      {companyId && id && <ContainerInspector companyId={companyId} agentId={id} />}
    </div>
  );
}
