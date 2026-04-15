import { useMemo, useRef } from "react";
import { Edges } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { palette } from "../palette";
import { axialToWorld, hexSpiralWorld, HEX_SIZE } from "../layout/hexGrid";
import { LamppostModel, TreeModel } from "./models/NatureModels";

/**
 * G2 — Procedural low-poly decorations sprinkled across the campus shells.
 *
 * No GLBs, no textures: trees, lampposts, clouds, chimneys, benches are all
 * built from primitive geometry with the same flat Lambert + Edges + palette
 * aesthetic as the rest of the campus. Instanced via drei's <Instances> so
 * N trees cost one draw call per archetype sub-mesh.
 *
 * Deterministic layout: every placement comes from a hash of the container id
 * so the exact same sprinkle shows up across re-renders / re-mounts. Trees
 * sway, clouds drift — both are cheap one-trig-per-frame loops.
 */

// --- deterministic prng (mulberry32) + string hash ---

function hashSeed(id: string | null | undefined): number {
  let h = 2166136261 >>> 0;
  const s = id ?? "zootropolis";
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Placement entry shared by every archetype.
interface Placement {
  position: [number, number, number];
  rotationY: number;
  scale: number;
  /** Hashed phase in [0, 2π). */
  phase: number;
}

/**
 * Scatter N placements inside a rectangular region on the xz plane,
 * optionally skipping the center to avoid colliding with the container shell.
 */
function scatter(
  seed: number,
  count: number,
  region: { xMin: number; xMax: number; zMin: number; zMax: number },
  options: { minRadius?: number; y?: number; scaleJitter?: number } = {},
): Placement[] {
  const rng = mulberry32(seed);
  const placements: Placement[] = [];
  const { minRadius = 0, y = 0, scaleJitter = 0.2 } = options;
  let guard = 0;
  while (placements.length < count && guard < count * 20) {
    guard++;
    const x = region.xMin + rng() * (region.xMax - region.xMin);
    const z = region.zMin + rng() * (region.zMax - region.zMin);
    if (minRadius > 0 && Math.hypot(x, z) < minRadius) continue;
    placements.push({
      position: [x, y, z],
      rotationY: rng() * Math.PI * 2,
      scale: 1 + (rng() - 0.5) * 2 * scaleJitter,
      phase: rng() * Math.PI * 2,
    });
  }
  return placements;
}

// --- Trees ------------------------------------------------------------------

/**
 * TreeCluster — instanced trunks + canopy spheres for a group of trees.
 * Trees sway: rotation.z ±2° at 0.3Hz with hashed phase per instance.
 */
function TreeCluster({ placements }: { placements: Placement[] }) {
  const groupsRef = useRef<Array<Group | null>>([]);

  // Sway: rotate each tree group by a sine of time + its hashed phase.
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const amp = (Math.PI / 180) * 2; // 2 degrees
    const freq = 0.3; // Hz
    const groups = groupsRef.current;
    for (let i = 0; i < placements.length; i++) {
      const g = groups[i];
      if (!g) continue;
      g.rotation.z = amp * Math.sin(t * Math.PI * 2 * freq + placements[i].phase);
    }
  });

  if (placements.length === 0) return null;

  // K4: swap the procedural trunk + canopy spheres for a GLB tree.
  // Alternate pine / oak by index so clusters read as mixed forest. The
  // sway animation stays on the outer group wrapper — it rotates the
  // GLB as a whole, so no animation code changes with the geometry swap.
  return (
    <group>
      {placements.map((p, i) => (
        <group
          key={i}
          ref={(el) => {
            groupsRef.current[i] = el;
          }}
          position={p.position}
          rotation={[0, p.rotationY, 0]}
          scale={p.scale}
        >
          <TreeModel variant={i % 2 === 0 ? "pine" : "oak"} />
        </group>
      ))}
    </group>
  );
}

// --- Lampposts --------------------------------------------------------------

/**
 * LamppostCluster — thin tall cylinder + emissive cream sphere on top.
 * Emissive feeds into the existing CampusPostFx bloom.
 */
function LamppostCluster({
  placements,
  height = 1.8,
}: {
  placements: Placement[];
  height?: number;
}) {
  if (placements.length === 0) return null;
  // K4: GLB lamppost per placement via <Clone>. We still scatter + size
  // the placements the same way as before, so existing seeds don't move
  // lampposts around the campus. An emissive cream bulb sits on top of
  // the GLB post so bloom still picks up a glow (Kenney's lamppost model
  // doesn't ship with an emissive material of its own).
  return (
    <group>
      {placements.map((p, i) => (
        <group
          key={i}
          position={p.position}
          rotation={[0, p.rotationY, 0]}
          scale={p.scale}
        >
          <LamppostModel height={height} />
          <mesh position={[0, height + 0.1, 0]}>
            <sphereGeometry args={[0.13, 10, 8]} />
            <meshStandardMaterial
              color={palette.cream}
              emissive={palette.cream}
              emissiveIntensity={1.6}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// --- Clouds -----------------------------------------------------------------

const CLOUD_DRIFT_SPEED = 0.05; // units/sec
const CLOUD_WRAP_X = 22;

function CloudCluster({ placements }: { placements: Placement[] }) {
  const groupsRef = useRef<Array<Group | null>>([]);
  const offsetsRef = useRef<number[]>(placements.map(() => 0));
  // Reset offsets if placements length changes between renders.
  if (offsetsRef.current.length !== placements.length) {
    offsetsRef.current = placements.map(() => 0);
  }

  useFrame((_, delta) => {
    const offsets = offsetsRef.current;
    for (let i = 0; i < placements.length; i++) {
      offsets[i] += delta * CLOUD_DRIFT_SPEED;
      const baseX = placements[i].position[0];
      let x = baseX + offsets[i];
      // Wrap across ±CLOUD_WRAP_X so clouds reappear on the far side.
      const span = CLOUD_WRAP_X * 2;
      while (x > CLOUD_WRAP_X) x -= span;
      while (x < -CLOUD_WRAP_X) x += span;
      const g = groupsRef.current[i];
      if (g) {
        g.position.x = x;
      }
    }
  });

  if (placements.length === 0) return null;

  return (
    <group>
      {placements.map((p, i) => (
        <group
          key={i}
          ref={(el) => {
            groupsRef.current[i] = el;
          }}
          position={p.position}
          scale={p.scale}
        >
          {[
            { pos: [0, 0, 0] as [number, number, number], r: 0.9 },
            { pos: [0.8, 0.15, 0.1] as [number, number, number], r: 0.7 },
            { pos: [-0.75, 0.05, -0.1] as [number, number, number], r: 0.65 },
          ].map((s, k) => (
            <mesh key={k} position={s.pos}>
              <sphereGeometry args={[s.r, 10, 8]} />
              <meshLambertMaterial
                color={palette.bone}
                transparent
                opacity={0.75}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

// --- Chimneys ---------------------------------------------------------------

function ChimneyCluster({ placements }: { placements: Placement[] }) {
  if (placements.length === 0) return null;
  return (
    <group>
      {placements.map((p, i) => (
        <group
          key={i}
          position={p.position}
          rotation={[0, p.rotationY, 0]}
          scale={p.scale}
        >
          {/* Body */}
          <mesh position={[0, 0.3, 0]}>
            <boxGeometry args={[0.34, 0.6, 0.34]} />
            <meshLambertMaterial color={palette.clay} />
            <Edges color={palette.ink} threshold={15} />
          </mesh>
          {/* Cap */}
          <mesh position={[0, 0.64, 0]}>
            <boxGeometry args={[0.42, 0.08, 0.42]} />
            <meshLambertMaterial color={palette.ink} />
            <Edges color={palette.ink} threshold={15} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// --- Benches ----------------------------------------------------------------

function BenchCluster({ placements }: { placements: Placement[] }) {
  if (placements.length === 0) return null;
  return (
    <group>
      {placements.map((p, i) => (
        <group
          key={i}
          position={p.position}
          rotation={[0, p.rotationY, 0]}
          scale={p.scale}
        >
          {/* Slab */}
          <mesh position={[0, 0.22, 0]}>
            <boxGeometry args={[0.9, 0.08, 0.3]} />
            <meshLambertMaterial color={palette.cream} />
            <Edges color={palette.ink} threshold={15} />
          </mesh>
          {/* Legs */}
          <mesh position={[-0.35, 0.11, 0]}>
            <boxGeometry args={[0.08, 0.22, 0.28]} />
            <meshLambertMaterial color={palette.ink} />
          </mesh>
          <mesh position={[0.35, 0.11, 0]}>
            <boxGeometry args={[0.08, 0.22, 0.28]} />
            <meshLambertMaterial color={palette.ink} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// --- Top-level component ----------------------------------------------------

export type DecorationLayer = "campus" | "floor" | "building";

interface CampusDecorationsProps {
  layer: DecorationLayer;
  companyId?: string | null;
  parentId?: string | null;
  /**
   * Phase S2: for `layer === "campus"`, the island footprint is a hex
   * spiral rather than a rectangular grass plane. Callers pass the
   * number of occupied tiles (child count); decor is scattered ONLY on
   * unoccupied tiles so trees don't float in the water.
   */
  occupiedTileCount?: number;
  /**
   * Phase S2: total tiles on the hex island. Defaults to 7 (matches
   * HexIsland `minTiles`). Decor can be placed on tiles
   * `[occupiedTileCount, totalTileCount)`.
   */
  totalTileCount?: number;
  /**
   * Phase T5: explicit list of VISIBLE island axials — when the
   * frontier-expansion layout is active, the island's tiles are no
   * longer a simple spiral of `totalTileCount`. Passing this overrides
   * the spiral assumption so decor only lands on tiles that actually
   * exist (no more trees floating in the sea).
   */
  islandAxials?: Array<[number, number]>;
  /** Subset of `islandAxials` occupied by children (skipped for decor). */
  occupiedAxialKeys?: Set<string>;
}

/**
 * CampusDecorations — sprinkled procedural accents for a given shell layer.
 * Layout is deterministic per (layer, companyId, parentId) so re-renders are
 * stable. Mount as a sibling of the existing scene content inside the Canvas.
 */
export function CampusDecorations({
  layer,
  companyId,
  parentId,
  occupiedTileCount = 0,
  totalTileCount = 7,
  islandAxials,
  occupiedAxialKeys,
}: CampusDecorationsProps) {
  const seedBase = useMemo(
    () => hashSeed(`${layer}:${companyId ?? ""}:${parentId ?? ""}`),
    [layer, companyId, parentId],
  );

  const decor = useMemo(() => {
    if (layer === "campus") {
      // Phase T5: prefer caller-supplied explicit axials (frontier mode).
      // Fallback to the old spiral assumption for legacy callers.
      let freeTiles: Array<[number, number]>;
      if (islandAxials) {
        freeTiles = islandAxials
          .filter(([q, r]) => !(occupiedAxialKeys?.has(`${q},${r}`) ?? false))
          .map(([q, r]) => axialToWorld(q, r, HEX_SIZE));
      } else {
        const allTiles = hexSpiralWorld(Math.max(totalTileCount, occupiedTileCount));
        freeTiles = allTiles.slice(occupiedTileCount);
      }
      const rng = mulberry32(seedBase ^ 0xde7a);
      const trees: Placement[] = [];
      const lampposts: Placement[] = [];
      for (let i = 0; i < freeTiles.length; i++) {
        const [x, z] = freeTiles[i];
        const roll = rng();
        // Tiny offset on the tile top so decor isn't glued to the centre.
        const ox = (rng() - 0.5) * 0.6;
        const oz = (rng() - 0.5) * 0.6;
        const placement: Placement = {
          position: [x + ox, 0, z + oz],
          rotationY: rng() * Math.PI * 2,
          scale: 0.85 + rng() * 0.25,
          phase: rng() * Math.PI * 2,
        };
        if (roll < 0.55) trees.push(placement);
        else if (roll < 0.75) lampposts.push(placement);
        // else: leave the tile bare for visual breathing room.
      }
      // Clouds removed — they pushed the AutoFit bounding box up and
      // forced the camera too far back; the sky already has the
      // sunset HDRI and they didn't add much visually.
      return { trees, clouds: [], lampposts, benches: [], chimneys: [] };
    }
    if (layer === "floor") {
      // Floor slab is ~4.4x4.4 in BuildingView but FloorView uses a wider
      // walk; we sprinkle just outside the room footprints.
      const lampposts = scatter(seedBase ^ 0x1a3b, 3, {
        xMin: -5,
        xMax: 5,
        zMin: -2.8,
        zMax: 2.8,
      }, { minRadius: 2.2, y: 0, scaleJitter: 0.1 });
      const benches = scatter(seedBase ^ 0xbe11, 1, {
        xMin: -4,
        xMax: 4,
        zMin: -2.2,
        zMax: 2.2,
      }, { minRadius: 2.4, y: 0, scaleJitter: 0.15 });
      return { trees: [], clouds: [], lampposts, benches, chimneys: [] };
    }
    // Phase S polish: chimney decorations disabled for the building
    // layer — they were anchored at a hardcoded y=6.5 which floated
    // them mid-air above the building silhouette. Needs per-building
    // rooftop anchors to do properly; skipping for now.
    return { trees: [], clouds: [], lampposts: [], benches: [], chimneys: [] };
  }, [layer, seedBase]);

  return (
    <group>
      <TreeCluster placements={decor.trees} />
      <CloudCluster placements={decor.clouds} />
      <LamppostCluster
        placements={decor.lampposts}
        height={layer === "campus" ? 2.2 : 1.5}
      />
      <BenchCluster placements={decor.benches} />
      <ChimneyCluster placements={decor.chimneys} />
    </group>
  );
}

