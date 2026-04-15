/**
 * Pointy-top hex-grid math for the Phase S2 floating island.
 *
 * The island grows outward in rings as the campus grows:
 *   N=1   → 1 tile                (ring 0)
 *   N=2–7 → centre + 6-ring      (ring 1)
 *   N=8–19 → + 12-ring            (ring 2)
 *   N=20–37 → + 18-ring            (ring 3)
 *
 * Returned world positions are on the x/z plane (y=0). Consumers add their
 * own height offset. `spacing` is the centre-to-centre distance between
 * neighbouring hexes; it equals the hex "size" (vertex-to-centre radius)
 * times sqrt(3) for pointy-top.
 */

export const HEX_SIZE = 2.2; // radius: centre to a vertex
export const HEX_SPACING = HEX_SIZE * Math.sqrt(3); // centre-to-centre for pointy-top

// Axial -> Cartesian for pointy-top hex grid.
export function axialToWorld(q: number, r: number, size: number): [number, number] {
  const x = size * Math.sqrt(3) * (q + r / 2);
  const z = size * 1.5 * r;
  return [x, z];
}

// Six axial neighbour directions for pointy-top.
const AXIAL_DIRS: Array<[number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];

/**
 * Generate `count` hex centres in spiral order starting at the origin.
 * Ring k contains 6k tiles (k ≥ 1); ring 0 is the single centre.
 * Walk each ring clockwise starting from a fixed offset so the layout is
 * stable across renders.
 */
export function hexSpiralAxial(count: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (count <= 0) return out;
  out.push([0, 0]);
  if (count === 1) return out;
  let k = 1;
  while (out.length < count) {
    // Start at the "top" of ring k — move k steps in direction 4 from origin.
    let q = AXIAL_DIRS[4][0] * k;
    let r = AXIAL_DIRS[4][1] * k;
    for (let side = 0; side < 6 && out.length < count; side++) {
      for (let step = 0; step < k && out.length < count; step++) {
        out.push([q, r]);
        const [dq, dr] = AXIAL_DIRS[side];
        q += dq;
        r += dr;
      }
    }
    k += 1;
  }
  return out;
}

/**
 * Convenience: spiral positions in world coordinates (x, z). `spacing`
 * defaults to HEX_SPACING which is tuned so the default hex tile geometry
 * fits flush against its neighbours.
 */
export function hexSpiralWorld(
  count: number,
  spacing: number = HEX_SPACING,
): Array<[number, number]> {
  const size = spacing / Math.sqrt(3);
  return hexSpiralAxial(count).map(([q, r]) => axialToWorld(q, r, size));
}

/**
 * Inverse of `axialToWorld` — given a world (x, z), return the axial
 * (q, r) of the hex that world point falls into.
 *
 * Uses cube-coord rounding (the standard redblobgames algorithm): the
 * fractional axial is converted to cube, each component rounded, the
 * component with the largest rounding delta is recomputed from the
 * other two so the sum stays 0. Result re-projected back to axial.
 */
export function worldToAxial(
  x: number,
  z: number,
  size: number = HEX_SIZE,
): { q: number; r: number } {
  const qFrac = (x * Math.sqrt(3) / 3 - z / 3) / size;
  const rFrac = (z * 2 / 3) / size;
  // Convert to cube.
  const xCube = qFrac;
  const zCube = rFrac;
  const yCube = -xCube - zCube;
  // Round.
  let rx = Math.round(xCube);
  let ry = Math.round(yCube);
  let rz = Math.round(zCube);
  const xDiff = Math.abs(rx - xCube);
  const yDiff = Math.abs(ry - yCube);
  const zDiff = Math.abs(rz - zCube);
  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }
  return { q: rx, r: rz };
}

/**
 * Compute a tight bounding radius of the island given `count` tiles.
 * Used by callers that need to place distant props (rocks, birds, camera
 * limits) outside the island footprint.
 */
export function hexIslandRadius(count: number, spacing: number = HEX_SPACING): number {
  if (count <= 1) return spacing;
  // rings needed: smallest k s.t. 1 + 3k(k+1) >= count
  let k = 0;
  let capacity = 1;
  while (capacity < count) {
    k += 1;
    capacity = 1 + 3 * k * (k + 1);
  }
  return spacing * (k + 0.5);
}
