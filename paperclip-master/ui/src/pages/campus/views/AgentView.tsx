import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { CampusOrbitControls } from "../components/CampusOrbitControls";
import { NeutralToneMapping } from "three";
import { useParams } from "@/lib/router";
import { Animal } from "../components/Animal";
import { AgentScreen, AgentIssuesLineup } from "../components/AgentScreen";
import { CampusEnvironment } from "../components/CampusEnvironment";
import { CampusOverlay } from "../components/CampusOverlay";
import { CampusPostFx } from "../components/CampusPostFx";
import { ContainerInspector } from "../components/ContainerInspector";
import {
  LoadingOverlay,
  NotFoundOverlay,
} from "../components/SceneOverlays";
import {
  pickAnimalPaletteKey,
  useContainerChildren,
} from "../hooks/useContainerChildren";
import { useAgentReachability } from "../hooks/useAgentReachability";
import { palette } from "../palette";
import {
  ZoomTransitionProvider,
  useIsTransitioning,
  useZoomInEntrance,
} from "../lib/zoom-transition";

const AGENT_CAMERA: [number, number, number] = [4, 3.5, 5];
const AGENT_LOOKAT: [number, number, number] = [0, 0.8, 0];

function AgentScene({
  companyId,
  id,
  unreachable,
}: {
  companyId: string | undefined;
  id: string | undefined;
  unreachable: boolean;
}) {
  const { self, parent, loading } = useContainerChildren(
    companyId ?? "",
    id ?? null,
  );
  const isTransitioning = useIsTransitioning();
  useZoomInEntrance(AGENT_CAMERA, AGENT_LOOKAT);

  const showNotFound = !loading && !!id && self === null;
  const label = self?.name ?? id ?? "agent";
  const color = id ? palette[pickAnimalPaletteKey(id)] : palette.terracotta;

  const backHref = parent
    ? `/campus/${companyId}/room/${parent.id}`
    : `/campus/${companyId}`;
  const backLabel = parent ? "room" : "campus";

  return (
    <>
      <CampusEnvironment />


      {/* Ground */}
      <mesh position={[0, -0.45, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[30, 30]} />
        <meshLambertMaterial color={palette.ground} />
      </mesh>

      {loading ? (
        <LoadingOverlay />
      ) : showNotFound ? (
        <NotFoundOverlay layer="agent" backHref={backHref} backLabel={backLabel} />
      ) : (
        <>
          <Animal
            color={color}
            agentId={id}
            role={self?.role ?? undefined}
            size="large"
            unreachable={unreachable}
          />
          <Text
            position={[0, -0.9, 1.2]}
            rotation={[-Math.PI / 6, 0, 0]}
            fontSize={0.24}
            color={palette.ink}
            anchorX="center"
            anchorY="middle"
          >
            {label}
          </Text>
          {/* Phase W — two floating screens above the agent. The left
              screen shows agent state + current active issue (clickable
              to the agent/issue page). The right screen shows the
              pending-issues lineup assigned to this leaf. Replaces the
              earlier placeholder VNC TV; when Cua/Coasty ships, a third
              screen variant can host the live terminal stream. */}
          {companyId && id && (
            <>
              <group position={[-2.0, 1.6, -1.2]}>
                <AgentScreen companyId={companyId} agentId={id} variant="large" />
              </group>
              <group position={[2.0, 1.6, -1.2]}>
                <AgentIssuesLineup companyId={companyId} agentId={id} />
              </group>
            </>
          )}
        </>
      )}

      <CampusOrbitControls
        enabled={!isTransitioning}
        minDistance={4}
        maxDistance={12}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.2}
        target={AGENT_LOOKAT}
      />

      <CampusPostFx />
    </>
  );
}

/**
 * AgentView — single-leaf-agent R3F scene.
 * Pulls the agent's display name (and color) from Paperclip's agents list so
 * the label reflects the real name rather than the URL :id. Leaf layer: no
 * children to zoom into, so only the entrance animation runs on mount.
 */
export function AgentView() {
  const { companyId, id } = useParams<{ companyId: string; id: string }>();
  // Zootropolis J2 — reachability hook drives both the Animal's red indicator
  // (passed into the scene) and the banner overlay below. Hook is gated on
  // agentId; callers on non-aliaskit-vm agents will see `reachable !== false`
  // (either null or true if the server reports not_applicable).
  const reach = useAgentReachability(companyId ?? "", id ?? null);
  const offline = reach.reachable === false;

  return (
    <div className="flex h-[calc(100vh-0px)] w-full flex-row">
      <div className="relative flex-1 overflow-hidden">
        <Canvas
          camera={{ position: AGENT_CAMERA, fov: 45 }}
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
              <AgentScene companyId={companyId} id={id} unreachable={offline} />
            </ZoomTransitionProvider>
          </Suspense>
        </Canvas>
        <CampusOverlay />
        {offline && <UnreachableBanner onRetry={reach.refetch} error={reach.error} />}
      </div>
      {companyId && id && <ContainerInspector companyId={companyId} agentId={id} />}
    </div>
  );
}

/**
 * Zootropolis J2 — top-screen soft-fail banner when the agent's daemon is
 * not responding. Positioned absolutely over (not inside) the Canvas so it
 * stays in HTML for accessibility and crisp text. "Retry probe" invalidates
 * the reachability query to trigger an immediate refetch.
 */
function UnreachableBanner({
  onRetry,
  error,
}: {
  onRetry: () => void;
  error?: { code: string; message: string };
}) {
  const endpointHint =
    error?.code === "no_endpoint"
      ? "this agent has no runtimeEndpoint configured"
      : "the configured runtimeEndpoint";
  return (
    <div
      role="alert"
      style={{
        position: "absolute",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 20,
        maxWidth: 640,
        padding: "10px 16px",
        background: "rgba(239, 68, 68, 0.16)",
        border: `1px solid ${palette.clay}`,
        borderRadius: 8,
        color: "#7a1d1d",
        fontSize: 13,
        lineHeight: 1.4,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        display: "flex",
        alignItems: "center",
        gap: 12,
        backdropFilter: "blur(4px)",
      }}
    >
      <span>
        Agent daemon at {endpointHint} not responding. Started your runtime?
        {error?.message ? (
          <span style={{ opacity: 0.7, marginLeft: 6, fontSize: 11 }}>
            ({error.code})
          </span>
        ) : null}
      </span>
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: "4px 10px",
          background: palette.clay,
          color: palette.cream,
          border: "none",
          borderRadius: 4,
          cursor: "pointer",
          fontSize: 12,
          fontFamily: "inherit",
        }}
      >
        Retry probe
      </button>
    </div>
  );
}

