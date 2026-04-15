import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Billboard, Bounds, Edges, Text, useCursor } from "@react-three/drei";
import { AutoFit } from "../components/AutoFit";
import { CampusOrbitControls } from "../components/CampusOrbitControls";
import { useNavigate, useParams } from "@/lib/router";
import type { Agent } from "@paperclipai/shared";
import { Vector3, NeutralToneMapping } from "three";
import { CampusDecorations } from "../components/CampusDecorations";
import { CampusEnvironment } from "../components/CampusEnvironment";
import { DelegationTravellerLayer } from "../components/DelegationTravellerLayer";
import { useHoverEmissive } from "../lib/useHoverEmissive";
import { useLabelColor } from "../lib/label-color";
import type { Group } from "three";
import { useRef } from "react";
import { CampusOverlay } from "../components/CampusOverlay";
import { CampusPostFx } from "../components/CampusPostFx";
import { ContainerInspector } from "../components/ContainerInspector";
import { AgentScreen } from "../components/AgentScreen";
import { FocalContainerPanel } from "../components/FocalContainerPanel";
import { ContainerView } from "../components/ContainerView";
import {
  EmptyLayerOverlay,
  LoadingOverlay,
  NotFoundOverlay,
} from "../components/SceneOverlays";
import { useContainerChildren } from "../hooks/useContainerChildren";
import { useContainerLiveStatus } from "../hooks/useContainerLiveStatus";
import { resolveFloorRank } from "../layout/positionStore";
import { useRankDrag } from "../lib/useRankDrag";
import { useSmoothPosition } from "../lib/useSmoothPosition";
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
  companyId,
  onClick,
  isBottomFloor,
  onPointerDownTile,
  dragging,
}: {
  agent: Agent;
  y: number;
  companyId: string | undefined;
  onClick: () => void;
  isBottomFloor: boolean;
  onPointerDownTile?: (event: { clientX: number; clientY: number }) => void;
  dragging?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const ref = useRef<Group>(null);
  useHoverEmissive(ref, hovered);
  useSmoothPosition(ref, [0, y, 0], dragging === true);
  const labelColor = useLabelColor();

  // Plate geometry constants — keep together so proportions are easy
  // to tweak as a unit.
  const PLATE = 5.0;          // main platter side
  const PLATE_HALF = PLATE / 2;
  const PLATE_THICK = 0.28;
  const COLUMN_H = 2.3;
  const COLUMN_W = 0.22;
  const CORNICE_H = 0.22;
  const FOUNDATION_OVERHANG = 0.4;

  // 8 columns — 4 corners + 4 mid-edges — position calculated once.
  const COLUMN_POSITIONS: Array<[number, number]> = [
    [-PLATE_HALF + 0.2, -PLATE_HALF + 0.2],
    [PLATE_HALF - 0.2, -PLATE_HALF + 0.2],
    [-PLATE_HALF + 0.2, PLATE_HALF - 0.2],
    [PLATE_HALF - 0.2, PLATE_HALF - 0.2],
    [0, -PLATE_HALF + 0.2],
    [0, PLATE_HALF - 0.2],
    [-PLATE_HALF + 0.2, 0],
    [PLATE_HALF - 0.2, 0],
  ];

  // 2×2 checkered floor tiles for that Townscaper painted-ground feel.
  const TILE_POSITIONS: Array<[number, number, boolean]> = [
    [-1.15, -1.15, true],
    [1.15, -1.15, false],
    [-1.15, 1.15, false],
    [1.15, 1.15, true],
  ];

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
        onPointerDownTile?.({
          clientX: (e.nativeEvent as PointerEvent).clientX,
          clientY: (e.nativeEvent as PointerEvent).clientY,
        });
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {/* Terracotta foundation plinth — only on the ground floor, with
          slight overhang so it reads as a step. */}
      {isBottomFloor && (
        <mesh position={[0, -0.6, 0]} castShadow receiveShadow>
          <boxGeometry args={[PLATE + FOUNDATION_OVERHANG, 0.55, PLATE + FOUNDATION_OVERHANG]} />
          <meshStandardMaterial color={palette.terracotta} roughness={1.0} />
          <Edges color={palette.ink} threshold={15} />
        </mesh>
      )}

      {/* Sand-tone floor platter — warmer than the old bone-grey. */}
      <mesh position={[0, -0.14, 0]} castShadow receiveShadow>
        <boxGeometry args={[PLATE, PLATE_THICK, PLATE]} />
        <meshStandardMaterial color={palette.sand} roughness={0.95} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>

      {/* Clay rim capping the platter edge. Thin, crisp, warm. */}
      <mesh position={[0, 0.02, 0]} castShadow receiveShadow>
        <boxGeometry args={[PLATE + 0.12, 0.08, PLATE + 0.12]} />
        <meshStandardMaterial color={palette.clay} roughness={1.0} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>

      {/* Checkered floor-tile inset — just visible on the top surface,
          reads as a painted interior pattern. */}
      {TILE_POSITIONS.map(([tx, tz, light], i) => (
        <mesh key={`tile-${i}`} position={[tx, 0.03, tz]} receiveShadow>
          <boxGeometry args={[2.1, 0.02, 2.1]} />
          <meshStandardMaterial
            color={light ? palette.bone : palette.cream}
            roughness={1.0}
          />
        </mesh>
      ))}

      {/* Columns with a capital + base for architectural feel. */}
      {COLUMN_POSITIONS.map(([cx, cz], i) => (
        <group key={`col-${i}`} position={[cx, 0, cz]}>
          {/* Base */}
          <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
            <boxGeometry args={[COLUMN_W + 0.1, 0.14, COLUMN_W + 0.1]} />
            <meshStandardMaterial color={palette.bone} roughness={0.95} />
            <Edges color={palette.ink} threshold={15} />
          </mesh>
          {/* Shaft */}
          <mesh position={[0, 0.15 + COLUMN_H / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[COLUMN_W, COLUMN_H, COLUMN_W]} />
            <meshStandardMaterial color={palette.bone} roughness={0.95} />
            <Edges color={palette.ink} threshold={15} />
          </mesh>
          {/* Capital */}
          <mesh position={[0, COLUMN_H + 0.22, 0]} castShadow receiveShadow>
            <boxGeometry args={[COLUMN_W + 0.12, 0.12, COLUMN_W + 0.12]} />
            <meshStandardMaterial color={palette.bone} roughness={0.95} />
            <Edges color={palette.ink} threshold={15} />
          </mesh>
        </group>
      ))}

      {/* Terracotta cornice beam connecting the column tops. Reads as
          the floor's ceiling / the building's storey divider. */}
      <mesh
        position={[0, COLUMN_H + 0.3 + CORNICE_H / 2, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[PLATE + 0.1, CORNICE_H, PLATE + 0.1]} />
        <meshStandardMaterial color={palette.terracotta} roughness={1.0} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>

      {/* Decorative railing pickets at the front edge so the floor
          reads like a terrace, not a slab. */}
      {[-1.8, -0.9, 0, 0.9, 1.8].map((px, i) => (
        <mesh key={`rail-${i}`} position={[px, 0.18, PLATE_HALF - 0.06]}>
          <boxGeometry args={[0.06, 0.3, 0.06]} />
          <meshStandardMaterial color={palette.bone} roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, 0.35, PLATE_HALF - 0.06]}>
        <boxGeometry args={[PLATE - 0.4, 0.06, 0.06]} />
        <meshStandardMaterial color={palette.clay} roughness={1.0} />
      </mesh>

      {/* Camera-facing floor label, positioned OUTSIDE the plate's
          footprint so upper floors never occlude lower labels. */}
      <Billboard position={[0, 0.7, PLATE_HALF + 0.7]} follow>
        <Text
          fontSize={0.55}
          color={labelColor}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.04}
          outlineColor="#1a1410"
          outlineOpacity={0.7}
          renderOrder={999}
        >
          {agent.name}
        </Text>
      </Billboard>

      {/* Phase W9 — floating status screen to the RIGHT of each floor.
          Pushed further from the slab edge so the wider card has room
          to clear the columns and railing. */}
      {companyId && (
        <group position={[PLATE_HALF + 3.5, 1.4, 0]} rotation={[0, -Math.PI / 6, 0]} userData={{ boundsIgnore: true }}>
          <AgentScreen companyId={companyId} agentId={agent.id} />
        </group>
      )}
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

  // Phase T4a — resolve each floor's rank (stored or fallback = index)
  // and wire up a vertical rank-drag.
  const resolvedFloors = children.map((agent, i) => {
    const { rank, y } = resolveFloorRank(agent, i);
    return { agent, rank, y };
  });
  // Sort by rank so render-order matches physical order even when
  // stored ranks don't match the original reportsTo order.
  resolvedFloors.sort((a, b) => a.rank - b.rank);
  const floorDrag = useRankDrag({
    companyId,
    kind: "floorRank",
    axis: "vertical",
    pixelsPerSlot: 80,
    slotCount: Math.max(children.length, 1),
    siblings: resolvedFloors.map(({ agent, rank }) => ({ agent, slot: rank })),
  });

  return (
    <>
      <CampusEnvironment />

      <Bounds fit clip margin={1.45}>
        <AutoFit refitKey={children.length} />
      <ContainerView layer="building" name={buildingName} status={liveStatus}>
        {/* Phase S polish: the BuildingModel is NOT rendered here — it
            was overlapping the floor slabs and making the interior view
            confusing (pink tower floating on blue slabs). The building's
            exterior is visible from the campus view; here we show its
            inside as a stack of floor plates with supporting columns. */}
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
          resolvedFloors.map(({ agent, rank, y }, i) => {
            const isDragging = floorDrag.isDragging(agent.id);
            const liveRank = isDragging && floorDrag.drag
              ? floorDrag.drag.currentSlot
              : rank;
            const liveY = 0.8 + liveRank * 3.2;
            return (
              <FloorSlabPlaceholder
                key={agent.id}
                agent={agent}
                y={liveY}
                companyId={companyId}
                isBottomFloor={i === 0}
                dragging={isDragging}
                onPointerDownTile={(e) => floorDrag.beginGesture(agent, rank, e)}
                onClick={() => {
                  if (floorDrag.wasJustDragged()) return;
                  transitionTo(new Vector3(0, liveY, 0), () =>
                    navigate(`/campus/${companyId}/floor/${agent.id}`),
                  );
                }}
              />
            );
          })
        )}
      </ContainerView>
      </Bounds>

      <CampusDecorations layer="building" companyId={companyId} parentId={id} />

      {/* Phase S6: travellers for building → floor delegations. */}
      {self && (
        <DelegationTravellerLayer
          agents={[
            { id: self.id, position: [0, 0, 0] },
            ...resolvedFloors.map(({ agent, y }) => ({
              id: agent.id,
              position: [0, y, 0] as [number, number, number],
            })),
          ]}
        />
      )}

      <CampusOrbitControls
        enabled={!isTransitioning && floorDrag.drag === null}
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
    <div className="flex h-[calc(100vh-0px)] w-full flex-row">
      <div className="relative flex-1 overflow-hidden">
        <Canvas
          camera={{ position: BUILDING_CAMERA, fov: 45 }}
          shadows="soft"
          dpr={[1, 1.5]}
          gl={{
            antialias: false,
            powerPreference: "high-performance",
            toneMapping: NeutralToneMapping,
            toneMappingExposure: 1.15,
          }}
        >
          <Suspense fallback={null}>
            <ZoomTransitionProvider>
              <BuildingScene companyId={companyId} id={id} />
            </ZoomTransitionProvider>
          </Suspense>
        </Canvas>
        <CampusOverlay />
        {companyId && id && (
          <FocalContainerPanel companyId={companyId} agentId={id} label="Building" />
        )}
      </div>
      {companyId && id && <ContainerInspector companyId={companyId} agentId={id} />}
    </div>
  );
}
