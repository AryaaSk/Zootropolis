/**
 * Zootropolis v1.2 — Phase K4.
 *
 * Thin <Clone> wrappers around each CC0 nature GLB. Each GLB is loaded
 * once at module scope; every instance rendered on the campus shares
 * the same underlying geometry via drei's <Clone>, so a grove of 20
 * trees still costs one geometry upload.
 *
 * The animation layer (sway on trees, scatter-positioning, etc.) lives
 * in CampusDecorations.tsx — these components are pure geometry. Scales
 * below are tuned so the GLB visual mass matches the pre-K4 procedural
 * tree / lamppost silhouettes.
 */
import { Suspense } from "react";
import { Clone, useGLTF } from "@react-three/drei";
import type { Object3D } from "three";

const NATURE_URLS = {
  "tree-pine": "/assets/zootropolis/nature/tree-pine.glb",
  "tree-oak": "/assets/zootropolis/nature/tree-oak.glb",
  rock: "/assets/zootropolis/nature/rock.glb",
  bush: "/assets/zootropolis/nature/bush.glb",
  "fence-post": "/assets/zootropolis/nature/fence-post.glb",
  lamppost: "/assets/zootropolis/nature/lamppost.glb",
} as const;

for (const url of Object.values(NATURE_URLS)) {
  useGLTF.preload(url);
}

function CloneGLB({ url, scale }: { url: string; scale: number }) {
  const { scene } = useGLTF(url) as { scene: Object3D };
  // drei <Clone> keeps instances lightweight — shared geometry, unique
  // transforms per instance. Scale at clone-level so we don't mutate
  // the cached source scene.
  return <Clone object={scene} scale={scale} />;
}

interface TreeModelProps {
  variant?: "pine" | "oak";
}

/**
 * TreeModel — pine or oak tree from the Kenney Nature Kit.
 *
 * Scale ~0.9 lands the GLB canopy at ~1.5 units tall, matching the
 * pre-K4 procedural tree so scatter positions and sway amplitudes
 * carry over without tweaking CampusDecorations.
 */
export function TreeModel({ variant = "pine" }: TreeModelProps) {
  const url = variant === "oak" ? NATURE_URLS["tree-oak"] : NATURE_URLS["tree-pine"];
  return (
    <Suspense fallback={null}>
      <CloneGLB url={url} scale={0.9} />
    </Suspense>
  );
}

export function RockModel() {
  return (
    <Suspense fallback={null}>
      <CloneGLB url={NATURE_URLS.rock} scale={0.6} />
    </Suspense>
  );
}

export function BushModel() {
  return (
    <Suspense fallback={null}>
      <CloneGLB url={NATURE_URLS.bush} scale={0.7} />
    </Suspense>
  );
}

export function FencePostModel() {
  return (
    <Suspense fallback={null}>
      <CloneGLB url={NATURE_URLS["fence-post"]} scale={0.9} />
    </Suspense>
  );
}

interface LamppostModelProps {
  /** Requested lamppost height in units; GLB is scaled to match. */
  height?: number;
}

/**
 * LamppostModel — the Kenney lamppost. Source model is ~2.5 units
 * tall; we normalise that to the caller-requested height so campus
 * lampposts (height ~2.2) and floor-level lampposts (~1.5) both look
 * plausible without hand-tuning positions in CampusDecorations.
 */
export function LamppostModel({ height = 2.2 }: LamppostModelProps) {
  const scale = height / 2.5;
  return (
    <Suspense fallback={null}>
      <CloneGLB url={NATURE_URLS.lamppost} scale={scale} />
    </Suspense>
  );
}
