import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Text, useCursor } from "@react-three/drei";
import { AutoFit } from "../components/AutoFit";
import { CampusOrbitControls } from "../components/CampusOrbitControls";
import { useNavigate, useParams } from "@/lib/router";
import type { Agent } from "@paperclipai/shared";
import { Vector3, NeutralToneMapping } from "three";
import { Animal } from "../components/Animal";
import { AgentScreen } from "../components/AgentScreen";
import { FocalContainerPanel } from "../components/FocalContainerPanel";
import { CampusEnvironment } from "../components/CampusEnvironment";
import { DelegationTravellerLayer } from "../components/DelegationTravellerLayer";
import { resolveRoomAgentPos } from "../layout/positionStore";
import { useGridDrag } from "../lib/useGridDrag";
import { useHoverEmissive } from "../lib/useHoverEmissive";
import { useSmoothPosition } from "../lib/useSmoothPosition";
import { useLabelColor } from "../lib/label-color";
import type { Group } from "three";
import { useRef } from "react";
import { CampusOverlay } from "../components/CampusOverlay";
import { CampusPostFx } from "../components/CampusPostFx";
import { ContainerInspector } from "../components/ContainerInspector";
import { ContainerView } from "../components/ContainerView";
import { RoomInterior } from "../components/models/RoomInterior";
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
import { useAgentReachability } from "../hooks/useAgentReachability";
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
  companyId,
  position,
  onClick,
  onPointerDownTile,
  dragging,
}: {
  agent: Agent;
  companyId: string;
  position: [number, number, number];
  onClick: () => void;
  onPointerDownTile?: (event: { clientX: number; clientY: number }) => void;
  dragging?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const ref = useRef<Group>(null);
  useHoverEmissive(ref, hovered, { color: "#ffffff", intensity: 0.8 });
  const [x, y, z] = position;
  useSmoothPosition(ref, [x, y, z], dragging === true);
  const color = palette[pickAnimalPaletteKey(agent.id)];
  const labelColor = useLabelColor();

  const isLeaf = agent.adapterType === "aliaskit_vm";
  const { reachable } = useAgentReachability(companyId, isLeaf ? agent.id : null);
  const unreachable = isLeaf && reachable === false;

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
      <Animal
        color={color}
        agentId={agent.id}
        role={agent.role ?? undefined}
        unreachable={unreachable}
      />
      <Text
        position={[0, -0.45, 1.2]}
        rotation={[-Math.PI / 6, 0, 0]}
        fontSize={0.18}
        color={labelColor}
        anchorX="center"
        anchorY="middle"
      >
        {agent.name}
      </Text>
      {/* Phase W9 — floating status screen above each animal in the room. */}
      <group position={[0, 3.6, 0]} userData={{ boundsIgnore: true }}>
        <AgentScreen companyId={companyId} agentId={agent.id} />
      </group>
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

  // Phase T4c — resolve each agent's free 2D pos (stored or line
  // fallback) + grid-drag.
  const total = children.length;
  const resolvedAgents = children.map((agent, i) => {
    const { x, z } = resolveRoomAgentPos(agent, i, total);
    return { agent, x, z };
  });
  const agentDrag = useGridDrag({
    companyId,
    siblings: resolvedAgents,
  });

  return (
    <>
      <CampusEnvironment />

      <Bounds fit clip margin={1.45}>
        <AutoFit refitKey={children.length} />
      <ContainerView layer="room" name={roomName} status={liveStatus}>
        <RoomInterior childCount={children.length} roomId={id ?? "unknown"} />
        {loading ? (
          <LoadingOverlay />
        ) : showNotFound ? (
          <NotFoundOverlay layer="room" backHref={backHref} backLabel={backLabel} />
        ) : children.length === 0 ? (
          <EmptyLayerOverlay layer="room" />
        ) : (
          resolvedAgents.map(({ agent, x, z }) => {
            const isDragging = agentDrag.isDragging(agent.id);
            const livePos: [number, number, number] =
              isDragging && agentDrag.drag
                ? [agentDrag.drag.currentX, 0, agentDrag.drag.currentZ]
                : [x, 0, z];
            return (
              <ClickableAnimal
                key={agent.id}
                agent={agent}
                companyId={companyId ?? ""}
                position={livePos}
                dragging={isDragging}
                onPointerDownTile={(e) =>
                  agentDrag.beginGesture(agent, { x, z }, e)
                }
                onClick={() => {
                  if (agentDrag.wasJustDragged()) return;
                  transitionTo(
                    new Vector3(livePos[0], livePos[1] + 0.4, livePos[2]),
                    () => navigate(`/campus/${companyId}/agent/${agent.id}`),
                  );
                }}
              />
            );
          })
        )}
      </ContainerView>
      </Bounds>

      {/* Phase S6: delegation travellers for room-owner → leaf animations. */}
      {self && (
        <DelegationTravellerLayer
          agents={[
            { id: self.id, position: [0, 0.8, 0] },
            ...resolvedAgents.map(({ agent, x, z }) => ({
              id: agent.id,
              position: [x, 0, z] as [number, number, number],
            })),
          ]}
        />
      )}

      <CampusOrbitControls
        enabled={!isTransitioning && agentDrag.drag === null}
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
    <div className="flex h-[calc(100vh-0px)] w-full flex-row">
      <div className="relative flex-1 overflow-hidden">
        <Canvas
          camera={{ position: ROOM_CAMERA, fov: 45 }}
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
              <RoomScene companyId={companyId} id={id} />
            </ZoomTransitionProvider>
          </Suspense>
        </Canvas>
        <CampusOverlay />
        {companyId && id && (
          <FocalContainerPanel companyId={companyId} agentId={id} label="Room" />
        )}
      </div>
      {companyId && id && <ContainerInspector companyId={companyId} agentId={id} />}
    </div>
  );
}
