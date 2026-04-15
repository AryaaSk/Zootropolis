import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Edges, Text, useCursor } from "@react-three/drei";
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
import { resolveRoomSlot } from "../layout/positionStore";
import { useRankDrag } from "../lib/useRankDrag";
import { useSmoothPosition } from "../lib/useSmoothPosition";
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
  companyId,
  onClick,
  onPointerDownTile,
  dragging,
}: {
  agent: Agent;
  position: [number, number, number];
  companyId: string | undefined;
  onClick: () => void;
  onPointerDownTile?: (event: { clientX: number; clientY: number }) => void;
  dragging?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const ref = useRef<Group>(null);
  useHoverEmissive(ref, hovered);
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
      {/* Small room-shaped box shell */}
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[2.6, 1.0, 2.6]} />
        <meshStandardMaterial color={palette.bone} roughness={0.95} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      {/* Roof accent */}
      <mesh position={[0, 0.85, 0]}>
        <boxGeometry args={[2.8, 0.2, 2.8]} />
        <meshStandardMaterial color={palette.terracotta} roughness={0.95} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      <Text
        position={[0, 1.15, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.25}
        color={labelColor}
        anchorX="center"
        anchorY="middle"
      >
        {agent.name}
      </Text>
      {/* Phase W9 — floating status screen above each room. */}
      {companyId && (
        <group position={[0, 3.6, 0]} userData={{ boundsIgnore: true }}>
          <AgentScreen companyId={companyId} agentId={agent.id} />
        </group>
      )}
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

  // Phase T4b — resolve each room's slot (stored or index fallback)
  // and wire up a horizontal slot-drag.
  const total = children.length;
  const resolvedRooms = children.map((agent, i) => {
    const { slot, x } = resolveRoomSlot(agent, i, total);
    return { agent, slot, x };
  });
  resolvedRooms.sort((a, b) => a.slot - b.slot);
  const roomDrag = useRankDrag({
    companyId,
    kind: "rowSlot",
    axis: "horizontal",
    pixelsPerSlot: 90,
    slotCount: Math.max(total, 1),
    siblings: resolvedRooms.map(({ agent, slot }) => ({ agent, slot })),
  });

  return (
    <>
      <CampusEnvironment />

      <Bounds fit clip margin={1.45}>
        <AutoFit refitKey={children.length} />
      <ContainerView layer="floor" name={floorName} status={liveStatus}>
        {loading ? (
          <LoadingOverlay />
        ) : showNotFound ? (
          <NotFoundOverlay layer="floor" backHref={backHref} backLabel={backLabel} />
        ) : children.length === 0 ? (
          <EmptyLayerOverlay layer="floor" />
        ) : (
          resolvedRooms.map(({ agent, slot, x }) => {
            const isDragging = roomDrag.isDragging(agent.id);
            const liveSlot = isDragging && roomDrag.drag
              ? roomDrag.drag.currentSlot
              : slot;
            const liveX = (liveSlot - (Math.max(total, 1) - 1) / 2) * 3.5;
            const pos: [number, number, number] = [liveX, 0, 0];
            return (
              <RoomPlaceholder
                key={agent.id}
                agent={agent}
                position={pos}
                companyId={companyId}
                dragging={isDragging}
                onPointerDownTile={(e) => roomDrag.beginGesture(agent, slot, e)}
                onClick={() => {
                  if (roomDrag.wasJustDragged()) return;
                  transitionTo(
                    new Vector3(pos[0], pos[1] + 0.5, pos[2]),
                    () => navigate(`/campus/${companyId}/room/${agent.id}`),
                  );
                }}
              />
            );
          })
        )}
      </ContainerView>
      </Bounds>

      <CampusDecorations layer="floor" companyId={companyId} parentId={id} />

      {/* Phase S6: travellers for floor → room delegations. */}
      {self && (
        <DelegationTravellerLayer
          agents={[
            { id: self.id, position: [0, 0, 0] },
            ...resolvedRooms.map(({ agent, x }) => ({
              id: agent.id,
              position: [x, 0, 0] as [number, number, number],
            })),
          ]}
        />
      )}

      <CampusOrbitControls
        enabled={!isTransitioning && roomDrag.drag === null}
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
    <div className="flex h-[calc(100vh-0px)] w-full flex-row">
      <div className="relative flex-1 overflow-hidden">
        <Canvas
          camera={{ position: FLOOR_CAMERA, fov: 45 }}
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
              <FloorScene companyId={companyId} id={id} />
            </ZoomTransitionProvider>
          </Suspense>
        </Canvas>
        <CampusOverlay />
        {companyId && id && (
          <FocalContainerPanel companyId={companyId} agentId={id} label="Floor" />
        )}
      </div>
      {companyId && id && <ContainerInspector companyId={companyId} agentId={id} />}
    </div>
  );
}
