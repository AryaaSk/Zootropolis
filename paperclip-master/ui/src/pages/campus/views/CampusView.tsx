import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Edges, OrbitControls, Text, useCursor } from "@react-three/drei";
import { useNavigate, useParams } from "@/lib/router";
import type { Agent } from "@paperclipai/shared";
import { Vector3 } from "three";
import { BuildingWindows } from "../components/BuildingWindows";
import { CampusOverlay } from "../components/CampusOverlay";
import { CampusPostFx } from "../components/CampusPostFx";
import { ContainerView } from "../components/ContainerView";
import { EmptyLayerOverlay, LoadingOverlay } from "../components/SceneOverlays";
import { useContainerChildren } from "../hooks/useContainerChildren";
import { useContainerLiveStatus } from "../hooks/useContainerLiveStatus";
import { palette } from "../palette";
import {
  ZoomTransitionProvider,
  useIsTransitioning,
  useZoomInEntrance,
  useZoomInTransition,
} from "../lib/zoom-transition";

const CAMPUS_CAMERA: [number, number, number] = [14, 12, 18];
const CAMPUS_LOOKAT: [number, number, number] = [0, 0, 0];

/** Lay out N buildings on a loose grid centered at the origin. */
function buildingPosition(index: number, total: number): [number, number, number] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
  const spacing = 7;
  const col = index % cols;
  const row = Math.floor(index / cols);
  const rows = Math.max(1, Math.ceil(total / cols));
  const x = (col - (cols - 1) / 2) * spacing;
  const z = (row - (rows - 1) / 2) * spacing;
  return [x, 0, z];
}

function BuildingPlaceholder({
  agent,
  position,
  companyId,
  onClick,
}: {
  agent: Agent;
  position: [number, number, number];
  companyId: string | undefined;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const [x, y, z] = position;
  const lift = hovered ? 0.2 : 0;
  // B5 live status for this building — drives emissive window glow.
  const buildingStatus = useContainerLiveStatus(companyId ?? "", agent.id);
  const windowsActive = buildingStatus === "running";

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
      {/* Body */}
      <mesh position={[0, 1.6, 0]}>
        <boxGeometry args={[3, 3.2, 3]} />
        <meshLambertMaterial color={palette.bone} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      {/* Roof */}
      <mesh position={[0, 3.35, 0]}>
        <boxGeometry args={[3.3, 0.3, 3.3]} />
        <meshLambertMaterial color={palette.clay} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      {/* Emissive window grid on the +z front face. Bloom (via CampusPostFx)
          turns these into a soft glow when the building has running work. */}
      <BuildingWindows width={3} height={3.2} y={1.6} z={1.5} active={windowsActive} />
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

function CampusScene({ companyId }: { companyId: string | undefined }) {
  const navigate = useNavigate();
  const { children, loading } = useContainerChildren(companyId ?? "", null);
  const campusName = companyId ?? "Zootropolis";
  const liveStatus = useContainerLiveStatus(companyId ?? "", null);
  const transitionTo = useZoomInTransition();
  const isTransitioning = useIsTransitioning();
  useZoomInEntrance(CAMPUS_CAMERA, CAMPUS_LOOKAT);

  return (
    <>
      <color attach="background" args={[palette.sky]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 8, 3]} intensity={0.6} />

      <ContainerView layer="campus" name={campusName} status={liveStatus}>
        {loading ? (
          <LoadingOverlay />
        ) : children.length === 0 ? (
          <EmptyLayerOverlay layer="campus" />
        ) : (
          children.map((agent, i) => {
            const pos = buildingPosition(i, children.length);
            return (
              <BuildingPlaceholder
                key={agent.id}
                agent={agent}
                position={pos}
                companyId={companyId}
                onClick={() =>
                  transitionTo(
                    // Aim at building-body centroid, not the ground pad.
                    new Vector3(pos[0], pos[1] + 1.6, pos[2]),
                    () => navigate(`/campus/${companyId}/building/${agent.id}`),
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
        minDistance={10}
        maxDistance={40}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.2}
        target={[0, 0, 0]}
      />

      <CampusPostFx />
    </>
  );
}

/**
 * CampusView — a ground plane with one building per campus-layer root agent.
 * Click → dolly the camera toward the building, then route into BuildingView.
 */
export function CampusView() {
  const { companyId } = useParams<{ companyId: string }>();

  return (
    <div className="relative h-[calc(100vh-0px)] w-full">
      <Canvas camera={{ position: CAMPUS_CAMERA, fov: 45 }} shadows={false} dpr={[1, 2]}>
        <ZoomTransitionProvider>
          <CampusScene companyId={companyId} />
        </ZoomTransitionProvider>
      </Canvas>
      <CampusOverlay />
    </div>
  );
}
