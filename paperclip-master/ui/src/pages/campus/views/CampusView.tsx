import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text, useCursor } from "@react-three/drei";
import { Navigate, useNavigate, useParams } from "@/lib/router";
import type { Agent } from "@paperclipai/shared";
import { Vector3 } from "three";
import { RootArchetype, routeForLayer } from "../components/RootArchetype";
import { readZootropolisLayer } from "@paperclipai/shared";
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

// Phase N1: BuildingPlaceholder replaced by RootArchetype dispatcher in
// ../components/RootArchetype.tsx. The dispatcher picks the right 3D
// archetype per child based on metadata.zootropolis.layer so a lone leaf
// no longer renders as a ghost tower.

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
          // Phase N1: dispatch per child on its metadata.zootropolis.layer
          // so a lone leaf renders as an animal, a standalone room as a room
          // shell, etc. — rather than always as a building.
          children.map((agent, i) => {
            const pos = buildingPosition(i, children.length);
            const childLayer = readZootropolisLayer(agent.metadata);
            const route = routeForLayer(childLayer);
            return (
              <RootArchetype
                key={agent.id}
                agent={agent}
                position={pos}
                companyId={companyId}
                onClick={() =>
                  transitionTo(
                    new Vector3(pos[0], pos[1] + 1.6, pos[2]),
                    () => {
                      if (route) {
                        navigate(`/campus/${companyId}/${route}/${agent.id}`);
                      }
                    },
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
 * CampusView — a ground plane with one tile per top-level agent. Dispatches
 * each child to the right 3D archetype (building / room / animal / …) via
 * <RootArchetype> so a lone leaf doesn't render as a ghost tower.
 *
 * Phase N2: when there is exactly ONE root, redirect to its own view
 * (`/agent/:id`, `/room/:id`, etc.) — "only display the highest level of
 * hierarchy which is actually present". Empty state stays on CampusView;
 * multi-root stays on CampusView (the archetype dispatcher handles
 * heterogeneous layers).
 */
export function CampusView() {
  const { companyId } = useParams<{ companyId: string }>();
  const { children, loading } = useContainerChildren(companyId ?? "", null);
  const isEmpty = !loading && children.length === 0;

  // N2 redirect. Run only after the query finishes so we don't redirect
  // mid-loading with stale data.
  if (!loading && children.length === 1 && companyId) {
    const only = children[0];
    const onlyLayer = readZootropolisLayer(only.metadata);
    const route = routeForLayer(onlyLayer);
    if (route) {
      return <Navigate to={`/campus/${companyId}/${route}/${only.id}`} replace />;
    }
    // Campus-layer single-root: the root IS the canvas; fall through and
    // render CampusView normally.
  }

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
