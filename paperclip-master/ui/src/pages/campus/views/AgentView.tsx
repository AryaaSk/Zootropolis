import { useEffect, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text, Html } from "@react-three/drei";
import { useQuery } from "@tanstack/react-query";
import { readZootropolisLayer, type ZootropolisAgentMetadata } from "@paperclipai/shared";
import { useParams } from "@/lib/router";
import { Animal } from "../components/Animal";
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
import { palette } from "../palette";
import {
  ZoomTransitionProvider,
  useIsTransitioning,
  useZoomInEntrance,
} from "../lib/zoom-transition";
import { heartbeatsApi, type LiveRunForIssue } from "../../../api/heartbeats";
import { queryKeys } from "../../../lib/queryKeys";
import type { TranscriptEntry } from "../../../adapters";
import { useLiveRunTranscripts } from "../../../components/transcript/useLiveRunTranscripts";

const AGENT_CAMERA: [number, number, number] = [4, 3.5, 5];
const AGENT_LOOKAT: [number, number, number] = [0, 0.8, 0];

function AgentScene({
  companyId,
  id,
}: {
  companyId: string | undefined;
  id: string | undefined;
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

      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 8, 3]} intensity={0.6} />

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
          <Animal color={color} agentId={id} />
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
          {/* VM-stream surface — Phase B7. Renders an HTML overlay framed
              inside the scene as the agent's "screen". For v1 we show a
              placeholder until Cua/Coasty wires real VNC; once
              metadata.zootropolis.runtime exposes a vncUrl, this <Html>
              will host the noVNC iframe. */}
          <group position={[0, 1.6, -1.2]}>
            <mesh>
              <planeGeometry args={[3.4, 1.9]} />
              <meshLambertMaterial color={palette.bone} />
            </mesh>
            <mesh position={[0, 0, 0.001]}>
              <planeGeometry args={[3.2, 1.7]} />
              <meshLambertMaterial color={palette.ink} />
            </mesh>
            <Html
              position={[0, 0, 0.01]}
              transform
              distanceFactor={2}
              occlude={false}
              style={{
                width: 280,
                height: 150,
                background: palette.ink,
                color: palette.cream,
                padding: 8,
                fontFamily: "ui-monospace, monospace",
                fontSize: 10,
                overflow: "hidden",
                border: `1px solid ${palette.dustBlue}`,
                borderRadius: 2,
              }}
            >
              <ScreenContent
                companyId={companyId ?? ""}
                agentId={id ?? ""}
                metadata={self?.metadata as ZootropolisAgentMetadata | null | undefined}
              />
            </Html>
          </group>
        </>
      )}

      <OrbitControls
        enabled={!isTransitioning}
        enablePan={false}
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

  return (
    <div className="relative h-[calc(100vh-0px)] w-full">
      <Canvas
        camera={{ position: AGENT_CAMERA, fov: 45 }}
        shadows={false}
        dpr={[1, 2]}
      >
        <ZoomTransitionProvider>
          <AgentScene companyId={companyId} id={id} />
        </ZoomTransitionProvider>
      </Canvas>
      <CampusOverlay />
      {companyId && id && <ContainerInspector companyId={companyId} agentId={id} />}
    </div>
  );
}

/**
 * Placeholder content for the leaf agent's "screen" inside the room. v1
 * shows the agent's runtime endpoint (so you can confirm the daemon is
 * configured) and a "Live VNC stream coming when Cua/Coasty wires in"
 * note. When metadata.zootropolis.runtime.vncUrl exists, a noVNC iframe
 * will go here instead.
 */
function VmStreamPlaceholder(props: {
  agentId: string;
  metadata?: ZootropolisAgentMetadata | null;
}) {
  const layer = readZootropolisLayer(props.metadata as Record<string, unknown> | null | undefined);
  const runtime = props.metadata?.runtime;
  const aliaskit = props.metadata?.aliaskit;
  return (
    <div>
      <div style={{ opacity: 0.7, marginBottom: 4 }}>
        agent {props.agentId.slice(0, 8)} • {layer ?? "untagged"}
      </div>
      {runtime ? (
        <div style={{ opacity: 0.9 }}>
          <div>endpoint: {runtime.endpoint}</div>
          <div>port: {runtime.port}</div>
          {aliaskit?.email && <div>identity: {aliaskit.email}</div>}
        </div>
      ) : (
        <div style={{ opacity: 0.6 }}>
          (no runtime; this agent isn't a Zootropolis leaf)
        </div>
      )}
      <div style={{ marginTop: 8, opacity: 0.5 }}>
        live VNC stream lands when Cua/Coasty integration ships
      </div>
    </div>
  );
}

/**
 * Chooses between the static VM-stream placeholder and a live scrolling
 * transcript for the agent's currently-running heartbeat run. Falls back to
 * the placeholder when there's no active run (idle/completed/failed).
 */
function ScreenContent(props: {
  companyId: string;
  agentId: string;
  metadata?: ZootropolisAgentMetadata | null;
}) {
  const { companyId, agentId, metadata } = props;
  const enabled = !!companyId && !!agentId;
  const { data: liveRuns, isLoading: liveRunsLoading } = useQuery({
    queryKey: queryKeys.liveRuns(companyId),
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId),
    enabled,
    refetchInterval: 10_000,
  });

  const activeRun = useMemo<LiveRunForIssue | null>(() => {
    if (!liveRuns) return null;
    return (
      liveRuns.find(
        (run) => run.agentId === agentId && run.status === "running",
      ) ?? null
    );
  }, [liveRuns, agentId]);

  if (liveRunsLoading && !liveRuns) {
    return (
      <div style={{ opacity: 0.6 }}>Loading transcript…</div>
    );
  }

  if (activeRun) {
    return (
      <LiveTranscript
        companyId={companyId}
        run={activeRun}
      />
    );
  }

  return <VmStreamPlaceholder agentId={agentId} metadata={metadata} />;
}

const KIND_COLOR: Record<string, string> = {
  assistant: "#a5d8ff",
  thinking: "#b197fc",
  user: "#ffd8a8",
  tool_call: "#ffe066",
  tool_result: "#c0eb75",
  init: "#63e6be",
  result: "#74c0fc",
  stderr: "#ff8787",
  system: "#868e96",
  stdout: "#f1f3f5",
  diff: "#eebefa",
};

const KIND_PREFIX: Record<string, string> = {
  assistant: "assistant",
  thinking: "think",
  user: "user",
  tool_call: "tool",
  tool_result: "result",
  init: "init",
  result: "done",
  stderr: "err",
  system: "sys",
  stdout: "out",
  diff: "diff",
};

function entryText(entry: TranscriptEntry): string {
  switch (entry.kind) {
    case "assistant":
    case "thinking":
    case "user":
    case "stderr":
    case "system":
    case "stdout":
    case "diff":
      return entry.text;
    case "tool_call":
      return `${entry.name}(${typeof entry.input === "string" ? entry.input : JSON.stringify(entry.input ?? {})})`;
    case "tool_result":
      return entry.content;
    case "init":
      return `session ${entry.sessionId.slice(0, 8)} • ${entry.model}`;
    case "result":
      return entry.text || (entry.isError ? "error" : "done");
    default:
      return "";
  }
}

const MAX_LINES = 30;

function LiveTranscript(props: { companyId: string; run: LiveRunForIssue }) {
  const { companyId, run } = props;
  const runSources = useMemo(
    () => [
      {
        id: run.id,
        status: run.status,
        adapterType: run.adapterType,
      },
    ],
    [run.id, run.status, run.adapterType],
  );
  const { transcriptByRun, isInitialHydrating } = useLiveRunTranscripts({
    runs: runSources,
    companyId,
    maxChunksPerRun: 120,
  });

  const entries = useMemo(() => {
    const all = transcriptByRun.get(run.id) ?? [];
    return all.slice(-MAX_LINES);
  }, [transcriptByRun, run.id]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries]);

  if (isInitialHydrating && entries.length === 0) {
    return <div style={{ opacity: 0.6 }}>Loading transcript…</div>;
  }

  return (
    <div
      ref={scrollRef}
      style={{
        height: "100%",
        overflowY: "auto",
        fontFamily: "ui-monospace, monospace",
        fontSize: 9,
        lineHeight: 1.35,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {entries.length === 0 ? (
        <div style={{ opacity: 0.6 }}>
          run {run.id.slice(0, 8)} • waiting for output…
        </div>
      ) : (
        entries.map((entry, idx) => {
          const color = KIND_COLOR[entry.kind] ?? palette.cream;
          const prefix = KIND_PREFIX[entry.kind] ?? entry.kind;
          const text = entryText(entry);
          return (
            <div key={`${entry.ts}:${idx}`} style={{ color, opacity: 0.95 }}>
              <span style={{ opacity: 0.55 }}>{prefix}</span>
              {" "}
              {text}
            </div>
          );
        })
      )}
    </div>
  );
}
