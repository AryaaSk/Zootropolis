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

/**
 * Per-animal render tweaks — some GLBs ship with Z-up baked in (or a
 * root rotation that reads as "lying down" in our Y-up scene), and
 * some need a bigger base scale so they don't read as toys on the
 * bigger hex tiles. Values tuned by eye. Defaults at the bottom apply
 * when the map has no entry.
 */
// Quaternius low-poly animals ship with a baked rotation that makes
// them lie on their side in a Y-up scene. Turning +PI/2 around X puts
// their spine vertical and snout forward (toward +Z) — that's the
// orientation we want. Owl already ships Y-up so leaves it alone.
const ANIMAL_ROTATION: Partial<Record<AnimalName, [number, number, number]>> = {};

// Per-species base scale for the DEFAULT (small) variant. These were
// tuned for the campus/room/floor viewports where the animal sits on
// a hex tile alongside buildings. AgentView uses size="large" which
// multiplies these by ~2× for the isolated leaf view.
const ANIMAL_SCALE: Partial<Record<AnimalName, number>> = {};
const DEFAULT_ANIMAL_SCALE = 0.8;
const LARGE_ANIMAL_MULTIPLIER = 1.25;

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
  /**
   * Visual size tier. `default` is tuned for tiles on the hex grid
   * (campus / floor / room). `large` is used by AgentView where the
   * single leaf is centered on its own canvas.
   */
  size?: "default" | "large";
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

function TintedGLB({
  url,
  color,
  name,
  size = "default",
}: {
  url: string;
  color: string;
  name: AnimalName;
  size?: "default" | "large";
}) {
  const { scene } = useGLTF(url) as { scene: Object3D };

  const cloned = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((obj: Object3D) => {
      const mesh = obj as Mesh;
      if ((mesh as Mesh).isMesh) {
        mesh.material = new MeshLambertMaterial({ color });
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });
    return copy;
  }, [scene, color]);

  const rotation = ANIMAL_ROTATION[name] ?? [0, 0, 0];
  const baseScale = ANIMAL_SCALE[name] ?? DEFAULT_ANIMAL_SCALE;
  const scale = size === "large" ? baseScale * LARGE_ANIMAL_MULTIPLIER : baseScale;
  return (
    <primitive object={cloned} scale={scale} rotation={rotation} position={[0, 0, 0]} />
  );
}

/**
 * The swap-in for the procedural body in Animal.tsx. Wrapped in
 * <Suspense> with a matching cube fallback so the Animal group's
 * idle bob + pulse animations have something to apply to even while
 * the GLB is still resolving.
 */
export function AnimalModel({ role, agentId, color, size = "default" }: AnimalModelProps) {
  const name = pickAnimal(role, agentId);
  const url = animalUrl(name);
  return (
    <Suspense fallback={<CubeFallback color={color} />}>
      <TintedGLB url={url} color={color} name={name} size={size} />
    </Suspense>
  );
}

export const __testing = { ROLE_TO_ANIMAL, pickAnimal, ANIMALS };
