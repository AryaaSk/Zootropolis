/**
 * Zootropolis v1.2 — Phase K5.
 *
 * RoomInterior populates the room shell with CC0 GLB furniture so each
 * room reads as an actual workspace instead of an empty box. One
 * "workstation" (desk + chair + monitor + lamp) is placed per child
 * agent around the room perimeter facing inward. 1-2 bookshelves fill
 * remaining wall space for flavor.
 *
 * Design notes:
 *   - GLBs are preloaded at module scope and reused via drei's <Clone>
 *     so N desks = 1 GLB load, N clones (shared geometry).
 *   - Positions are derived from a deterministic hash of roomId so the
 *     same room always lays out the same way (stable across reloads,
 *     different between rooms).
 *   - Workstations sit on a ~2.5 unit radius; the animalPosition()
 *     row in RoomView lives near center (x in ~[-3, 3], z=0), so they
 *     don't overlap.
 *   - Suspense fallback is render-nothing: the room shell + animals
 *     are the load-bearing elements, furniture is decoration.
 *   - Respects ?lq=1 — furniture is the first thing we cut.
 */
import { Suspense, useMemo } from "react";
import { Clone, useGLTF } from "@react-three/drei";
import type { Object3D } from "three";
import { useLowQualityMode } from "../../lib/quality-mode";

const FURNITURE = ["desk", "chair", "monitor", "lamp", "bookshelf"] as const;
type FurnitureName = (typeof FURNITURE)[number];

function furnitureUrl(name: FurnitureName): string {
  return `/assets/zootropolis/furniture/${name}.glb`;
}

// Preload all 5 GLBs at module scope. Total budget is small and this
// means the first navigation into a room doesn't hitch on furniture.
for (const f of FURNITURE) {
  useGLTF.preload(furnitureUrl(f));
}

// Room inner floor is 6x6 centered at origin (see ContainerView's
// RoomShell). Floor top sits at y = -0.3 (floor mesh at y=-0.5, thickness
// negligible). Workstations live on a 2.5-unit radius ring so they hug
// the walls without clipping through them.
const FLOOR_Y = -0.3;
const WALL_RADIUS = 2.5;
const MAX_WORKSTATIONS = 6;

// Scale tuning — Quaternius/Kenney furniture GLBs ship around 1-2 units
// tall. 0.8 lands each desk roughly 1 unit wide, matching an animal.
const FURNITURE_SCALE = 0.8;

// FNV-ish hash matching AnimalModel so the hash style stays consistent
// across the codebase. Deterministic seed from roomId drives which wall
// each workstation sits on and which wall gets a bookshelf.
function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Tiny seeded PRNG (Mulberry32) so we can pull multiple stable draws
// from a single roomId hash without collision.
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

interface Placement {
  position: [number, number, number];
  /** rotation-Y in radians so the furniture faces inward */
  rotationY: number;
}

/**
 * Generate N workstation placements around the perimeter. The ring is
 * sampled at evenly-spaced angles starting from a hashed offset so
 * different rooms rotate their layout relative to each other.
 */
function workstationPlacements(count: number, seed: number): Placement[] {
  const n = Math.min(count, MAX_WORKSTATIONS);
  if (n <= 0) return [];
  const rand = mulberry32(seed);
  const angleOffset = rand() * Math.PI * 2;
  const placements: Placement[] = [];
  for (let i = 0; i < n; i++) {
    const theta = angleOffset + (i / n) * Math.PI * 2;
    const x = Math.cos(theta) * WALL_RADIUS;
    const z = Math.sin(theta) * WALL_RADIUS;
    // Face inward: rotate so +Z of the desk points toward origin. The
    // GLBs ship facing +Z by default (Quaternius convention), so we
    // rotate by atan2(x, z) + PI to flip them around.
    const rotationY = Math.atan2(x, z) + Math.PI;
    placements.push({ position: [x, FLOOR_Y, z], rotationY });
  }
  return placements;
}

/**
 * 1–2 bookshelves tucked flat against a wall picked by the room seed.
 * They skip angles already occupied by workstations by offsetting along
 * the wall.
 */
function bookshelfPlacements(seed: number, workstations: number): Placement[] {
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const count = workstations >= 4 ? 2 : 1;
  // Pick a wall (0..3 → -z, +z, -x, +x). Bookshelf sits flush against
  // that wall at ~2.7 units out, offset along the wall by a random
  // amount in [-1.5, 1.5].
  const wall = Math.floor(rand() * 4);
  const placements: Placement[] = [];
  for (let i = 0; i < count; i++) {
    const t = (rand() - 0.5) * 3; // -1.5..1.5
    let position: [number, number, number];
    let rotationY: number;
    switch (wall) {
      case 0:
        position = [t, FLOOR_Y, -2.7];
        rotationY = 0; // face +z
        break;
      case 1:
        position = [t, FLOOR_Y, 2.7];
        rotationY = Math.PI;
        break;
      case 2:
        position = [-2.7, FLOOR_Y, t];
        rotationY = Math.PI / 2;
        break;
      default:
        position = [2.7, FLOOR_Y, t];
        rotationY = -Math.PI / 2;
        break;
    }
    placements.push({ position, rotationY });
  }
  return placements;
}

function useFurnitureScene(name: FurnitureName): Object3D {
  const { scene } = useGLTF(furnitureUrl(name)) as { scene: Object3D };
  return scene;
}

/**
 * One desk + chair + monitor + lamp grouping. Chair sits in front of
 * the desk (toward the room center), monitor on top, lamp on the
 * desk's back-left corner.
 */
function Workstation({ placement }: { placement: Placement }) {
  const desk = useFurnitureScene("desk");
  const chair = useFurnitureScene("chair");
  const monitor = useFurnitureScene("monitor");
  const lamp = useFurnitureScene("lamp");
  const [x, y, z] = placement.position;
  return (
    <group position={[x, y, z]} rotation={[0, placement.rotationY, 0]}>
      {/* Desk sits flush against the wall */}
      <Clone object={desk} scale={FURNITURE_SCALE} />
      {/* Monitor on top of desk, toward the back edge */}
      <Clone
        object={monitor}
        scale={FURNITURE_SCALE * 0.6}
        position={[0, 0.55, -0.15]}
      />
      {/* Lamp on the back-left corner of the desk */}
      <Clone
        object={lamp}
        scale={FURNITURE_SCALE * 0.5}
        position={[-0.4, 0.55, -0.15]}
      />
      {/* Chair pulled out in front of the desk, facing it */}
      <Clone
        object={chair}
        scale={FURNITURE_SCALE}
        position={[0, 0, 0.6]}
        rotation={[0, Math.PI, 0]}
      />
    </group>
  );
}

function Bookshelf({ placement }: { placement: Placement }) {
  const shelf = useFurnitureScene("bookshelf");
  const [x, y, z] = placement.position;
  return (
    <group position={[x, y, z]} rotation={[0, placement.rotationY, 0]}>
      <Clone object={shelf} scale={FURNITURE_SCALE} />
    </group>
  );
}

interface RoomInteriorProps {
  childCount: number;
  roomId: string;
}

function RoomInteriorInner({ childCount, roomId }: RoomInteriorProps) {
  const seed = useMemo(() => hash32(roomId), [roomId]);
  const workstations = useMemo(
    () => workstationPlacements(childCount, seed),
    [childCount, seed],
  );
  const shelves = useMemo(
    () => bookshelfPlacements(seed, workstations.length),
    [seed, workstations.length],
  );
  return (
    <group>
      {workstations.map((p, i) => (
        <Workstation key={`w${i}`} placement={p} />
      ))}
      {shelves.map((p, i) => (
        <Bookshelf key={`s${i}`} placement={p} />
      ))}
    </group>
  );
}

/**
 * RoomInterior — decorative furniture layer for a room. Rendered inside
 * ContainerView alongside the animal children. Safe to mount even when
 * childCount is 0 (renders only the bookshelves in that case).
 */
export function RoomInterior({ childCount, roomId }: RoomInteriorProps) {
  const lq = useLowQualityMode();
  if (lq) return null;
  return (
    <Suspense fallback={null}>
      <RoomInteriorInner childCount={childCount} roomId={roomId} />
    </Suspense>
  );
}
