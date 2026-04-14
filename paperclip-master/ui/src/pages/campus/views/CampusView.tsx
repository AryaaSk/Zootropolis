import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text, useCursor } from "@react-three/drei";
import { useNavigate, useParams } from "@/lib/router";
import type { Agent } from "@paperclipai/shared";
import { Vector3 } from "three";
import { BuildingWindows } from "../components/BuildingWindows";
import { BuildingModel } from "../components/models/BuildingModel";
import { CampusDecorations } from "../components/CampusDecorations";
import { CampusEnvironment } from "../components/CampusEnvironment";
import { CampusOverlay } from "../components/CampusOverlay";
import { CampusPostFx } from "../components/CampusPostFx";
import { ContainerInspector, HireForm } from "../components/ContainerInspector";
import { ContainerView } from "../components/ContainerView";
import { LoadingOverlay } from "../components/SceneOverlays";
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
  // G4: intensity scales window lit-count + emissive brightness. We don't
  // yet have a per-descendant running count on this hook; mapping the
  // coarse running/idle flag to 1.0 / 0.15 gives a clear brightness swing
  // that still reads as "busier = brighter".
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
      {/* K3: GLB-backed body (replaces procedural box+roof). Variant is
          hashed from agent id so each building has a stable silhouette.
          Falls back to the pre-K3 procedural shell on Suspense or lq=1. */}
      <BuildingModel agentId={agent.id} />
      {/* Emissive window grid on the +z front face. Bloom (via CampusPostFx)
          turns these into a soft glow when the building has running work. */}
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
      <CampusEnvironment />
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 8, 3]} intensity={0.6} />

      <ContainerView layer="campus" name={campusName} status={liveStatus}>
        {loading ? (
          <LoadingOverlay />
        ) : children.length === 0 ? (
          // F1: empty-state is handled by the HTML overlay in CampusView;
          // the 3D scene stays as an empty grass plane (ContainerView shell).
          null
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

      <CampusDecorations layer="campus" companyId={companyId} parentId={null} />

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
 * F1 empty-state: when there are no campus-root agents yet, render a
 * centered HTML overlay with a "+ Hire your first agent" call-to-action.
 * Clicking it expands an inline hire form (leaf agent, reportsTo=null).
 */
function CampusEmptyState({ companyId }: { companyId: string }) {
  const [openForm, setOpenForm] = useState(false);
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div
        className="pointer-events-auto flex w-[300px] flex-col items-center gap-3 rounded-lg border px-5 py-6 shadow-lg backdrop-blur-md"
        style={{
          backgroundColor: `${palette.bone}f0`,
          borderColor: palette.ink,
          color: palette.ink,
        }}
      >
        <div className="text-center text-sm" style={{ color: `${palette.ink}cc` }}>
          An empty campus. Plant your first agent on the grass.
        </div>
        {openForm ? (
          <div className="w-full">
            <HireForm
              companyId={companyId}
              parentAgentId={null}
              layer="agent"
              onCancel={() => setOpenForm(false)}
              onCreated={() => setOpenForm(false)}
              submitLabel="Hire"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpenForm(true)}
            className="rounded-md border px-3 py-1.5 text-sm font-medium"
            style={{
              borderColor: palette.ink,
              backgroundColor: palette.accent,
              color: palette.ink,
            }}
          >
            + Hire your first agent
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * CampusView — a ground plane with one building per campus-layer root agent.
 * Click → dolly the camera toward the building, then route into BuildingView.
 */
export function CampusView() {
  const { companyId } = useParams<{ companyId: string }>();
  const { children, loading } = useContainerChildren(companyId ?? "", null);
  const isEmpty = !loading && children.length === 0;

  return (
    <div className="relative h-[calc(100vh-0px)] w-full">
      <Canvas camera={{ position: CAMPUS_CAMERA, fov: 45 }} shadows={false} dpr={[1, 2]}>
        <ZoomTransitionProvider>
          <CampusScene companyId={companyId} />
        </ZoomTransitionProvider>
      </Canvas>
      <CampusOverlay />
      {companyId && isEmpty && <CampusEmptyState companyId={companyId} />}
      {companyId && <ContainerInspector companyId={companyId} agentId={null} />}
    </div>
  );
}
