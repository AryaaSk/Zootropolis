import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { Text, useCursor } from "@react-three/drei";
import { Navigate, useNavigate, useParams } from "@/lib/router";
import type { Agent } from "@paperclipai/shared";
import { Vector3 } from "three";
import { RootArchetype, routeForLayer } from "../components/RootArchetype";
import { readZootropolisLayer } from "@paperclipai/shared";
import { hexSpiralAxial, HEX_SIZE } from "../layout/hexGrid";
import { resolveCampusPos } from "../layout/positionStore";
import { agentAxialOrFallback, useHexDrag } from "../lib/useHexDrag";
import { CampusDecorations } from "../components/CampusDecorations";
import { CampusEnvironment } from "../components/CampusEnvironment";
import { CampusOverlay } from "../components/CampusOverlay";
import { CampusPostFx } from "../components/CampusPostFx";
import { ContainerInspector, HireForm } from "../components/ContainerInspector";
import { FocalContainerPanel } from "../components/FocalContainerPanel";
import { ContainerView } from "../components/ContainerView";
import { DelegationTravellerLayer } from "../components/DelegationTravellerLayer";
import { Bounds } from "@react-three/drei";
import { AutoFit } from "../components/AutoFit";
import { CampusOrbitControls } from "../components/CampusOrbitControls";
import { EmptyHexSlot } from "../components/EmptyHexSlot";
import { HexIsland } from "../components/HexIsland";
import { InfiniteWater } from "../components/InfiniteWater";
import { useCampusRootAgent } from "../hooks/useCampusRootAgent";
import { LoadingOverlay } from "../components/SceneOverlays";
import { useContainerChildren } from "../hooks/useContainerChildren";
import { useContainerLiveStatus } from "../hooks/useContainerLiveStatus";
import { hexSpiralWorld } from "../layout/hexGrid";
import { palette } from "../palette";
import {
  ZoomTransitionProvider,
  useIsTransitioning,
  useZoomInEntrance,
  useZoomInTransition,
} from "../lib/zoom-transition";

// Phase X11 — user-chosen frame: looking straight down the +Z axis at
// the island centre with a gentle ~27° downward tilt. Distance ~19
// puts the default ring of hexes comfortably in frame at any time of
// day, with the floating screens above buildings still visible at the
// top of the view. Target is locked to origin because the hex spiral
// always centres there, regardless of how many tiles the island has.
const CAMPUS_CAMERA: [number, number, number] = [0, 8.5, 17];
const CAMPUS_LOOKAT: [number, number, number] = [0, 0, 0];

/**
 * Phase S2: lay out N buildings on hex-tile centres in spiral order. Each
 * building sits on its own tile; a single leaf sits on the centre tile
 * while the surrounding ring(s) stay decorative.
 */
function buildingPositions(total: number): Array<[number, number, number]> {
  return hexSpiralWorld(total).map(([x, z]) => [x, 0, z] as [number, number, number]);
}

// Phase N1: BuildingPlaceholder replaced by RootArchetype dispatcher in
// ../components/RootArchetype.tsx. The dispatcher picks the right 3D
// archetype per child based on metadata.zootropolis.layer so a lone leaf
// no longer renders as a ghost tower.

function CampusScene({
  companyId,
  onRequestHire,
}: {
  companyId: string | undefined;
  onRequestHire: (pos: { q: number; r: number }) => void;
}) {
  const navigate = useNavigate();
  // Find agents that report to nobody (reportsTo === null). If exactly one
  // exists AND is tagged `layer === "campus"`, it IS the implicit campus
  // root — unfold it and show ITS children as the top-level tiles. This
  // is the "Paperclip always has a CEO" pattern adapted to Zootropolis:
  // the company always has an implicit campus agent whose name mirrors
  // the company's, and everything else hangs off it.
  const roots = useContainerChildren(companyId ?? "", null);
  const onlyRoot = !roots.loading && roots.children.length === 1
    ? roots.children[0]
    : null;
  const onlyRootIsCampus =
    onlyRoot != null && readZootropolisLayer(onlyRoot.metadata) === "campus";
  const effectiveParentId = onlyRootIsCampus ? onlyRoot!.id : null;

  const nested = useContainerChildren(companyId ?? "", effectiveParentId);
  const children = onlyRootIsCampus ? nested.children : roots.children;
  const loading = roots.loading || (onlyRootIsCampus && nested.loading);
  const campusName = onlyRootIsCampus ? onlyRoot!.name : companyId ?? "Zootropolis";
  const liveStatus = useContainerLiveStatus(companyId ?? "", effectiveParentId);
  const transitionTo = useZoomInTransition();
  const isTransitioning = useIsTransitioning();
  useZoomInEntrance(CAMPUS_CAMERA, CAMPUS_LOOKAT);

  // Phase T — resolve each child's current axial + world pos. Stored
  // metadata.zootropolis.pos wins over spiral-order fallback.
  const baseSpiralAxial = hexSpiralAxial(Math.max(children.length, 7));
  const defaultSpiralWorld = buildingPositions(children.length);
  const resolvedPositions = children.map((agent, i) => {
    const fallbackAxial = baseSpiralAxial[i] ?? [0, 0];
    const axial = agentAxialOrFallback(agent, { q: fallbackAxial[0], r: fallbackAxial[1] });
    const resolved = resolveCampusPos(agent, i, defaultSpiralWorld.map(([x, , z]) => [x, z]));
    return { agent, axial, world: [resolved.x, 0, resolved.z] as [number, number, number] };
  });

  // Phase T5b (revised) — frontier-based expansion. The island's
  // visible tiles are every occupied hex + the 6 neighbours of each
  // occupied hex (plus a baseline ring of 7 around origin when there
  // are no children yet). Clicking any unoccupied tile opens the hire
  // form. No explicit "grow ring" button; growth happens per-edge.
  const occupied = new Set(
    resolvedPositions.map(({ axial }) => `${axial.q},${axial.r}`),
  );
  const hexNeighbours = (q: number, r: number): Array<[number, number]> => [
    [q + 1, r],
    [q + 1, r - 1],
    [q, r - 1],
    [q - 1, r],
    [q - 1, r + 1],
    [q, r + 1],
  ];
  const visibleAxials = new Map<string, [number, number]>();
  for (const { axial } of resolvedPositions) {
    visibleAxials.set(`${axial.q},${axial.r}`, [axial.q, axial.r]);
    for (const [nq, nr] of hexNeighbours(axial.q, axial.r)) {
      const key = `${nq},${nr}`;
      if (!visibleAxials.has(key)) visibleAxials.set(key, [nq, nr]);
    }
  }
  // Baseline — always show origin + 6 neighbours, even on a totally
  // empty campus, so the user has somewhere to click.
  if (resolvedPositions.length === 0) {
    visibleAxials.set("0,0", [0, 0]);
    for (const [nq, nr] of hexNeighbours(0, 0)) {
      visibleAxials.set(`${nq},${nr}`, [nq, nr]);
    }
  }
  const visibleAxialsList = Array.from(visibleAxials.values());
  const frontierAxials = visibleAxialsList.filter(
    ([q, r]) => !occupied.has(`${q},${r}`),
  );

  // Phase T2 — drag controller. Provides beginGesture / isDragging to
  // tiles so clicking navigates and dragging repositions.
  const siblings = resolvedPositions.map(({ agent, axial }) => ({ agent, axial }));
  const hexDrag = useHexDrag({ companyId, siblings });

  return (
    <>
      <CampusEnvironment />

      {/* Phase S2: endless stylized water + floating hex island. The
          island is composed of every occupied hex plus its six
          neighbours, so it can grow one tile at a time from any edge
          the user hires into. */}
      <InfiniteWater />

      {/* Bounds wraps ONLY the island so the AutoFit camera sizes
          itself to the island footprint. Buildings + their floating
          AgentScreens are mounted as siblings outside Bounds — Html
          transform planes inside the screens are huge in world units
          and would otherwise inflate the bbox dramatically. */}
      <Bounds fit clip margin={1.45}>
        <AutoFit refitKey={visibleAxialsList.length} />
        <HexIsland axials={visibleAxialsList} />
      </Bounds>

        <ContainerView layer="campus" name={campusName} status={liveStatus}>
        {loading ? (
          <LoadingOverlay />
        ) : children.length === 0 ? (
          // F1: empty-state is handled by the HTML overlay in CampusView;
          // the 3D scene stays as the empty island + water (ContainerView shell).
          null
        ) : (
          resolvedPositions.map(({ agent, axial, world }) => {
            const childLayer = readZootropolisLayer(agent.metadata);
            const route = routeForLayer(childLayer);
            const isBeingDragged = hexDrag.isDragging(agent.id);
            // While dragging: SNAP to the nearest hex each frame so the
            // user sees exactly which tile the drop will land on.
            // Slightly elevated so it reads as in-transit.
            const livePos: [number, number, number] =
              isBeingDragged && hexDrag.drag
                ? (() => {
                    const [sx, sz] = [
                      HEX_SIZE * Math.sqrt(3) *
                        (hexDrag.drag.currentAxial.q +
                          hexDrag.drag.currentAxial.r / 2),
                      HEX_SIZE * 1.5 * hexDrag.drag.currentAxial.r,
                    ];
                    return [sx, 0.4, sz];
                  })()
                : world;
            return (
              <RootArchetype
                key={agent.id}
                agent={agent}
                position={livePos}
                // Keep smooth tween even while dragging — since livePos
                // is the SNAPPED hex center, damping gives nice
                // hex-to-hex gliding feedback.
                dragging={false}
                companyId={companyId}
                onPointerDownTile={(e) =>
                  hexDrag.beginGesture(agent, axial, e)
                }
                onClick={() => {
                  if (hexDrag.wasJustDragged()) return;
                  transitionTo(
                    new Vector3(world[0], world[1] + 1.6, world[2]),
                    () => {
                      if (route) {
                        navigate(`/campus/${companyId}/${route}/${agent.id}`);
                      }
                    },
                  );
                }}
              />
            );
          })
        )}
      </ContainerView>

      <CampusDecorations
        layer="campus"
        companyId={companyId}
        parentId={effectiveParentId}
        islandAxials={visibleAxialsList}
        occupiedAxialKeys={occupied}
      />

      {/* Phase T3/T5 — empty hex slot at every frontier tile (current
          occupied hexes + their neighbours, minus anything already
          occupied). Each is a subtle + click target that opens the
          hire dialog pre-filled for that tile. */}
      {!loading &&
        frontierAxials.map(([q, r]) => {
          const [wx, wz] = [
            HEX_SIZE * Math.sqrt(3) * (q + r / 2),
            HEX_SIZE * 1.5 * r,
          ];
          return (
            <EmptyHexSlot
              key={`empty-${q}-${r}`}
              position={[wx, 0, wz]}
              axial={{ q, r }}
              onClick={(a) => onRequestHire(a)}
            />
          );
        })}

      {/* Phase S6: traveller animation on delegations between any two
          top-level children rendered here. For a lone campus with one
          root this rarely fires — it's most visible on nested views once
          we mount the same layer there in a later pass. */}
      <DelegationTravellerLayer
        agents={resolvedPositions.map(({ agent, world }) => ({
          id: agent.id,
          position: world,
        }))}
      />

      <CampusOrbitControls
        enabled={!isTransitioning && hexDrag.drag === null}
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
  // Discover the implicit campus root (if any) + its children. Same
  // two-step query as CampusScene does internally so the outer view can
  // decide empty-state / N2 redirect correctly.
  const roots = useContainerChildren(companyId ?? "", null);
  const onlyRoot = !roots.loading && roots.children.length === 1
    ? roots.children[0]
    : null;
  const onlyRootIsCampus =
    onlyRoot != null && readZootropolisLayer(onlyRoot.metadata) === "campus";
  const nested = useContainerChildren(
    companyId ?? "",
    onlyRootIsCampus ? onlyRoot!.id : null,
  );
  const effective = onlyRootIsCampus ? nested : roots;
  const loading = roots.loading || (onlyRootIsCampus && nested.loading);

  // N2 redirect: only meaningful in the legacy case where there's no
  // implicit campus agent AND the single top-level root is a lone
  // leaf (so we skip the "ghost tower on vast campus" state). When an
  // implicit campus exists we NEVER redirect past it — the whole point
  // of the campus is to be the persistent canvas, even if it only has
  // one building on it.
  if (
    !loading &&
    !onlyRootIsCampus &&
    effective.children.length === 1 &&
    companyId
  ) {
    const only = effective.children[0];
    const onlyLayer = readZootropolisLayer(only.metadata);
    const route = routeForLayer(onlyLayer);
    if (route) {
      return <Navigate to={`/campus/${companyId}/${route}/${only.id}`} replace />;
    }
  }

  // Phase T3 — click-to-hire-at-hex state, lifted here so the HireForm
  // dialog renders as a DOM overlay (Canvas children can't open HTML
  // modals directly).
  const [pendingHirePos, setPendingHirePos] = useState<{ q: number; r: number } | null>(null);
  // When the campus agent exists, top-level hires target IT as parent.
  const { parentId: campusParentId } = useCampusRootAgent(companyId);

  return (
    <div className="flex h-[calc(100vh-0px)] w-full flex-row">
      <div className="relative flex-1 overflow-hidden">
        <Canvas
          camera={{ position: CAMPUS_CAMERA, fov: 45 }}
          shadows="soft"
          dpr={[1, 1.5]}
          gl={{
            antialias: false,
            powerPreference: "high-performance",
            toneMapping: THREE.NeutralToneMapping,
            toneMappingExposure: 1.15,
          }}
        >
          <Suspense fallback={null}>
            <ZoomTransitionProvider>
              <CampusScene
                companyId={companyId}
                onRequestHire={(axial) => setPendingHirePos(axial)}
              />
            </ZoomTransitionProvider>
          </Suspense>
        </Canvas>
        <CampusOverlay />
        {companyId && (
          <FocalContainerPanel
            companyId={companyId}
            agentId={null}
            label="Campus"
          />
        )}
        {companyId && pendingHirePos && (
          <HireAtHexOverlay
            companyId={companyId}
            parentAgentId={campusParentId}
            pos={pendingHirePos}
            onClose={() => setPendingHirePos(null)}
          />
        )}
      </div>
      {companyId && (
        <ContainerInspector
          companyId={companyId}
          agentId={campusParentId}
        />
      )}
    </div>
  );
}

function HireAtHexOverlay({
  companyId,
  parentAgentId,
  pos,
  onClose,
}: {
  companyId: string;
  parentAgentId: string | null;
  pos: { q: number; r: number };
  onClose: () => void;
}) {
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-[340px] rounded-lg border border-border bg-card/95 p-4 shadow-xl backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-medium text-foreground">
            Hire at ({pos.q}, {pos.r})
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
        <HireForm
          companyId={companyId}
          parentAgentId={parentAgentId}
          layer="agent"
          initialPos={{ kind: "hex", q: pos.q, r: pos.r }}
          onCancel={onClose}
          onCreated={onClose}
          submitLabel="Hire"
        />
      </div>
    </div>
  );
}
