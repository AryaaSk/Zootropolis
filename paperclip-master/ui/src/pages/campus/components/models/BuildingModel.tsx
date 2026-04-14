/**
 * Zootropolis v1.2 — Phase K3.
 *
 * GLB-backed campus building. Replaces the procedural box+roof body used
 * by CampusView's `BuildingPlaceholder` and the translucent tower shell
 * in BuildingView/ContainerView. Five CC0 low-poly variants ship in
 * `ui/public/assets/zootropolis/buildings/`; the variant is either
 * supplied by the caller or derived by hashing the agent id so the same
 * agent always renders as the same building silhouette.
 *
 * Suspense fallback: the procedural BuildingShellFallback below — the
 * pre-K3 procedural body — so the scene never renders empty while the
 * GLB is fetching. `?lq=1` skips the GLB entirely and renders the
 * fallback instead.
 */
import { Suspense, useMemo } from "react";
import { Edges, useGLTF } from "@react-three/drei";
import { Color, MeshLambertMaterial, type Mesh, type Object3D } from "three";
import { palette } from "../../palette";
import { useLowQualityMode } from "../../lib/quality-mode";

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

// FNV-ish hash on the agent id so the variant is stable across mounts.
function hashToVariant(id: string | undefined): BuildingVariant {
  if (!id) return "small-house";
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return BUILDING_VARIANTS[(h >>> 0) % BUILDING_VARIANTS.length];
}

// Preload all 5 GLBs at module scope — total footprint is small
// (~200-400KB combined) and preloading means swapping between variants
// across the campus never hitches on first paint.
for (const v of BUILDING_VARIANTS) {
  useGLTF.preload(buildingUrl(v));
}

/**
 * BuildingShellFallback — the pre-K3 procedural body+roof (lifted from
 * CampusView's BuildingPlaceholder). Rendered while the GLB is loading
 * and also when ?lq=1 is active. Sized to match the GLB footprint
 * (~3 wide, ~3.2 tall at the body; roof on top) so the window overlay
 * keeps registering on the same front face regardless of which path
 * renders.
 */
function BuildingShellFallback() {
  return (
    <group>
      <mesh position={[0, 1.6, 0]}>
        <boxGeometry args={[3, 3.2, 3]} />
        <meshLambertMaterial color={palette.bone} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      <mesh position={[0, 3.35, 0]}>
        <boxGeometry args={[3.3, 0.3, 3.3]} />
        <meshLambertMaterial color={palette.clay} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
    </group>
  );
}

function GLBBuilding({ url }: { url: string }) {
  const { scene } = useGLTF(url) as { scene: Object3D };

  // Clone once per url so multiple buildings can share the same GLB
  // geometry without fighting over scene-graph parents. Re-tint nothing
  // here — buildings keep the GLB's native coloring (unlike animals,
  // which tint to role palette). We do replace materials with a flat
  // Lambert so buildings read in the same shading vocabulary as the
  // rest of the campus.
  const cloned = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((obj: Object3D) => {
      const mesh = obj as Mesh;
      if ((mesh as Mesh).isMesh) {
        const mat = mesh.material as { color?: Color } | undefined;
        const sourceColor = mat?.color ? mat.color.clone() : new Color(palette.bone);
        mesh.material = new MeshLambertMaterial({ color: sourceColor });
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });
    return copy;
  }, [scene]);

  // Kenney City Kit models tend to be ~2 units wide. Scale ~2.5x to
  // roughly match the procedural shell footprint (3 wide, 3.2 tall).
  return <primitive object={cloned} scale={2.5} position={[0, 0, 0]} />;
}

interface BuildingModelProps {
  agentId: string;
  variant?: BuildingVariant;
}

/**
 * BuildingModel — drop-in body for a campus building. Swap this in
 * where procedural box+roof geometry used to live. Window overlays
 * (BuildingWindows) still layer on top via the parent group.
 */
export function BuildingModel({ agentId, variant }: BuildingModelProps) {
  const lq = useLowQualityMode();
  const chosen = variant ?? hashToVariant(agentId);
  if (lq) {
    return <BuildingShellFallback />;
  }
  return (
    <Suspense fallback={<BuildingShellFallback />}>
      <GLBBuilding url={buildingUrl(chosen)} />
    </Suspense>
  );
}

export const __testing = { hashToVariant, BUILDING_VARIANTS };
