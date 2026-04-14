/**
 * Zootropolis v1.2 — Phase K2.
 *
 * Role-mapped low-poly GLB animal. Replaces the procedural cube body in
 * Animal.tsx so every agent has a visually distinctive species tied to
 * its role (engineer → fox, researcher → owl, …). Unknown / missing roles
 * hash on agentId so the choice is stable across re-renders without
 * needing to persist anything server-side.
 *
 * All 8 source GLBs live in `ui/public/assets/zootropolis/animals/`
 * (CC0, see LICENSES.md there). They're preloaded at module scope so
 * the first cube → fox swap on the campus doesn't hitch.
 */
import { Suspense, useMemo } from "react";
import { Edges, useGLTF } from "@react-three/drei";
import { MeshLambertMaterial, type Mesh, type Object3D } from "three";
import { palette } from "../../palette";

const ANIMALS = [
  "fox",
  "cat",
  "owl",
  "bear",
  "rabbit",
  "wolf",
  "dog",
  "sheep",
] as const;

type AnimalName = (typeof ANIMALS)[number];

const ROLE_TO_ANIMAL: Record<string, AnimalName> = {
  engineer: "fox",
  designer: "cat",
  researcher: "owl",
  pm: "bear",
  qa: "rabbit",
  devops: "dog",
  general: "wolf",
  ceo: "sheep",
  cto: "wolf",
  cmo: "cat",
  cfo: "owl",
};

function animalUrl(name: AnimalName): string {
  return `/assets/zootropolis/animals/${name}.glb`;
}

// Cheap FNV-ish hash on the agent id so unmapped roles still pick a
// stable species per agent. Intentionally the same shape as the bob
// phase hash in Animal.tsx — no reason to diverge.
function hashToAnimal(id: string | undefined): AnimalName {
  if (!id) return "fox";
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ANIMALS[(h >>> 0) % ANIMALS.length];
}

function pickAnimal(role: string | undefined, agentId: string | undefined): AnimalName {
  if (role) {
    const mapped = ROLE_TO_ANIMAL[role.toLowerCase()];
    if (mapped) return mapped;
  }
  return hashToAnimal(agentId);
}

// Preload every animal GLB at module scope. Total budget is small
// (<500KB for all 8) and preloading here means the campus doesn't
// hitch on first render of each species.
for (const a of ANIMALS) {
  useGLTF.preload(animalUrl(a));
}

interface AnimalModelProps {
  role?: string;
  agentId?: string;
  color: string;
}

/**
 * Cube fallback — identical silhouette to the pre-K2 procedural animal
 * so the Suspense gap doesn't visibly pop when a GLB is still fetching.
 * Kept intentionally simple (body + head only) since it only renders
 * for a frame or two.
 */
function CubeFallback({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[1.2, 1.2, 1.6]} />
        <meshLambertMaterial color={color} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      <mesh position={[0, 1.55, 0.7]}>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshLambertMaterial color={color} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
    </group>
  );
}

function TintedGLB({ url, color }: { url: string; color: string }) {
  const { scene } = useGLTF(url) as { scene: Object3D };

  // Clone + retint on every color change. The clone is cheap (shared
  // geometry) and lets multiple agents reuse the same GLB with
  // different palette colors. Re-tint only when color changes.
  const cloned = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((obj: Object3D) => {
      const mesh = obj as Mesh;
      if ((mesh as Mesh).isMesh) {
        // Replace whatever material the GLB shipped with by a simple
        // Lambert tinted to the palette color. Matches the cube
        // animal's shading model so lighting feels consistent.
        mesh.material = new MeshLambertMaterial({ color });
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });
    return copy;
  }, [scene, color]);

  // Scale tuned so the GLB roughly fills the same ~1-unit silhouette as
  // the old cube body. Quaternius / Kenney source models hover around
  // 1-2 units tall; 0.8 lands close to the cube body's visual mass.
  return <primitive object={cloned} scale={0.8} position={[0, 0, 0]} />;
}

/**
 * The swap-in for the procedural body in Animal.tsx. Wrapped in
 * <Suspense> with a matching cube fallback so the Animal group's
 * idle bob + pulse animations have something to apply to even while
 * the GLB is still resolving.
 */
export function AnimalModel({ role, agentId, color }: AnimalModelProps) {
  const name = pickAnimal(role, agentId);
  const url = animalUrl(name);
  return (
    <Suspense fallback={<CubeFallback color={color} />}>
      <TintedGLB url={url} color={color} />
    </Suspense>
  );
}

export const __testing = { ROLE_TO_ANIMAL, pickAnimal, ANIMALS };
