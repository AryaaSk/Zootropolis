/**
 * Zootropolis — Phase S3 building glow-up.
 *
 * GLB-backed campus building. Same 5 CC0 low-poly variants as before
 * (cottage / office / shop / small-house / tower), but now:
 *   - meshStandardMaterial so the building actually responds to the
 *     sunset IBL from <Environment> (Phase S1).
 *   - Per-building pastel wall tint picked deterministically from
 *     palette.BUILDING_TINTS, hashed on the agent id. Gives the
 *     Townscaper patchwork look without any asset changes.
 *   - Roof/trim kept in warm terracotta so the tint reads as "walls
 *     only" (which is what Townscaper does).
 *   - Cast + receive shadows — the directional key light now projects
 *     long soft shadows onto the hex island.
 *   - Chimney stub on top of every building, anchored at a stable
 *     local position. `ChimneySmoke` (Phase S5) will attach here.
 *
 * Fallback shell upgraded to match the new material vocabulary so the
 * low-quality path still feels consistent.
 */
import { Suspense, useMemo } from "react";
import { Edges, useGLTF } from "@react-three/drei";
import { Box3, Color, MeshStandardMaterial, Vector3, type Mesh, type Object3D } from "three";
import { palette, BUILDING_TINTS } from "../../palette";
import { useLowQualityMode } from "../../lib/quality-mode";
import { BuildingWindows } from "../BuildingWindows";

export const BUILDING_VARIANTS = [
  "small-house",
  "office",
  "shop",
  "tower",
  "cottage",
] as const;

export type BuildingVariant = (typeof BUILDING_VARIANTS)[number];

function buildingUrl(variant: BuildingVariant): string {
  return `/assets/zootropolis/buildings/${variant}.glb`;
}

// FNV-ish hash — stable across mounts.
function hashInt(id: string | undefined): number {
  if (!id) return 0;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hashToVariant(id: string | undefined): BuildingVariant {
  return BUILDING_VARIANTS[hashInt(id) % BUILDING_VARIANTS.length];
}

function hashToTint(id: string | undefined): string {
  return BUILDING_TINTS[(hashInt(id) * 2654435761) % BUILDING_TINTS.length];
}

const BUILDING_SCALE = 2.8;

/**
 * Compute the world-space front-face rect of a GLB scene at the scale
 * we render it. Replaces my earlier hardcoded per-variant table which
 * consistently placed windows at the wrong Z because I was guessing
 * dimensions. Box3 on the raw scene gives us the truth.
 */
function computeFace(scene: Object3D): {
  width: number;
  height: number;
  frontZ: number;
  yCenter: number;
  depth: number;
} {
  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  return {
    width: size.x * BUILDING_SCALE,
    height: size.y * BUILDING_SCALE,
    depth: size.z * BUILDING_SCALE,
    frontZ: (center.z + size.z / 2) * BUILDING_SCALE,
    yCenter: center.y * BUILDING_SCALE,
  };
}

// Preload all 5 GLBs at module scope.
for (const v of BUILDING_VARIANTS) {
  useGLTF.preload(buildingUrl(v));
}

/**
 * BuildingShellFallback — procedural body+roof for the low-quality path
 * and Suspense fallback. Gets the per-agent tint so the scene stays
 * visually consistent when GLBs haven't loaded yet.
 *
 * Note: removed the hardcoded chimney stub — it was anchored at a fixed
 * local position that didn't match any of the 5 GLB variants (tower vs
 * cottage vs shop have very different heights), which produced the
 * "floating box mid-tower" artifact. A proper chimney needs a per-
 * variant offset or (better) a named bone inside the GLB. Skipped for
 * this phase; revisit when we swap in a richer asset pack.
 */
function BuildingShellFallback({ tint }: { tint: string }) {
  return (
    <group>
      <mesh position={[0, 1.6, 0]} castShadow receiveShadow>
        <boxGeometry args={[3, 3.2, 3]} />
        <meshStandardMaterial color={tint} roughness={0.95} />
        <Edges color={palette.ink} threshold={20} />
      </mesh>
      <mesh position={[0, 3.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.3, 0.3, 3.3]} />
        <meshStandardMaterial color={palette.clay} roughness={1.0} />
        <Edges color={palette.ink} threshold={20} />
      </mesh>
    </group>
  );
}

/**
 * Heuristic: tint "wall" meshes (named/containing 'wall' or having the
 * lightest original color) with the per-agent pastel tint; leave roof/
 * trim meshes in their native color (usually terracotta in Quaternius-
 * style packs). Falls back to tinting every material if the GLB has no
 * name hints, so we never end up with a fully cream building in the
 * pastel city.
 */
function shouldTintAsWall(mesh: Mesh, originalColor: Color): boolean {
  const name = (mesh.name || "").toLowerCase();
  if (/roof|chimney|door|tile|brick/i.test(name)) return false;
  if (/wall|body|base|hull|structure/i.test(name)) return true;
  // Fallback: tint anything that's pale (lum > 0.75) — likely a wall.
  const luminance = 0.299 * originalColor.r + 0.587 * originalColor.g + 0.114 * originalColor.b;
  return luminance > 0.72;
}

function GLBBuilding({
  url,
  tint,
  seed,
  windowsActive,
  windowsIntensity,
  showWindows,
}: {
  url: string;
  tint: string;
  seed: string;
  windowsActive: boolean;
  windowsIntensity: number;
  showWindows: boolean;
}) {
  const { scene } = useGLTF(url) as { scene: Object3D };
  const tintColor = useMemo(() => new Color(tint), [tint]);

  const cloned = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((obj: Object3D) => {
      const mesh = obj as Mesh;
      if (!(mesh as Mesh).isMesh) return;
      const mat = mesh.material as { color?: Color } | undefined;
      const original = mat?.color ? mat.color.clone() : new Color(palette.bone);
      const isWall = shouldTintAsWall(mesh, original);
      mesh.material = new MeshStandardMaterial({
        color: isWall ? tintColor.clone() : original,
        roughness: 0.95,
        metalness: 0.0,
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    return copy;
  }, [scene, tintColor]);

  // Compute face dims from the ACTUAL GLB bounding box — no hardcoded
  // per-variant table needed. Windows end up flush against whatever
  // front face the model actually has.
  const face = useMemo(() => computeFace(scene), [scene]);
  // Pad rows/cols by building height so a tall tower gets more rows
  // than a wide shop.
  const cols = Math.max(2, Math.round(face.width / 1.3));
  const rows = Math.max(2, Math.round(face.height / 1.3));
  // Windows render slightly IN FRONT of the face (frontZ + small epsilon)
  // so they don't z-fight with the GLB surface.
  const windowsZ = face.frontZ + 0.02;
  // Shrink window rect a bit to leave a margin around the building edge.
  const windowsWidth = face.width * 0.7;
  const windowsHeight = face.height * 0.7;
  const windowsY = face.yCenter;

  return (
    <group>
      <primitive object={cloned} scale={BUILDING_SCALE} position={[0, 0, 0]} />
      {showWindows && (
        <BuildingWindows
          width={windowsWidth}
          height={windowsHeight}
          y={windowsY}
          z={windowsZ}
          active={windowsActive}
          intensity={windowsIntensity}
          seed={seed}
          cols={cols}
          rows={rows}
        />
      )}
    </group>
  );
}

interface BuildingModelProps {
  agentId: string;
  variant?: BuildingVariant;
  /**
   * Phase S3.2: window-glow controls pushed into BuildingModel itself so
   * windows can be sized from the actual GLB bounding box. The caller
   * (RootArchetype) tells us whether to show them and how intense the
   * glow should be based on agent activity.
   */
  showWindows?: boolean;
  windowsActive?: boolean;
  windowsIntensity?: number;
}

/**
 * BuildingModel — drop-in body for a campus building. Each building
 * deterministically picks a variant + wall tint from its agent id so
 * the same agent always renders as the same silhouette and colour.
 */
export function BuildingModel({
  agentId,
  variant,
  showWindows = true,
  windowsActive = false,
  windowsIntensity = 0.15,
}: BuildingModelProps) {
  const lq = useLowQualityMode();
  const chosen = variant ?? hashToVariant(agentId);
  const tint = hashToTint(agentId);
  if (lq) {
    return <BuildingShellFallback tint={tint} />;
  }
  return (
    <Suspense fallback={<BuildingShellFallback tint={tint} />}>
      <GLBBuilding
        url={buildingUrl(chosen)}
        tint={tint}
        seed={agentId}
        showWindows={showWindows}
        windowsActive={windowsActive}
        windowsIntensity={windowsIntensity}
      />
    </Suspense>
  );
}

export const __testing = { hashToVariant, hashToTint, BUILDING_VARIANTS };
