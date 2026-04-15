import { useMemo, useEffect } from "react";
import { CylinderGeometry, BufferGeometry, BufferAttribute, Color } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Edges } from "@react-three/drei";
import { palette } from "../palette";
import { HEX_SIZE, hexIslandRadius, hexSpiralWorld, axialToWorld } from "../layout/hexGrid";

interface HexIslandProps {
  /**
   * Default mode — render a spiral of this many tiles. If `axials` is
   * supplied, `count` is ignored.
   */
  count?: number;
  /**
   * Phase T5 — explicit axial coordinates for each tile. Lets the
   * caller grow/shrink the island freely (one hex at a time) rather
   * than in whole rings. Every tile is rendered with the same
   * pastel-tint logic as the spiral mode.
   */
  axials?: Array<[number, number]>;
  /** Y of the tile top face. Defaults tuned so the island sits just above water at y=-0.6. */
  topY?: number;
  /** Total height of each tile (top face → bottom of bevel). */
  tileHeight?: number;
  /** Minimum tiles to render (so a lone leaf still sits on an island). */
  minTiles?: number;
}

/**
 * HexIsland — Phase S2 (v2).
 *
 * All tiles are merged into a SINGLE BufferGeometry so there are no
 * shared-edge seams between tiles. Each tile gets a deterministic pastel
 * tint baked to vertex colors at merge time. Single draw call; no
 * self-shadow fringe; no anti-alias gap lines.
 *
 * Geometry is a tapered hex prism (pointy-top): top radius HEX_SIZE,
 * bottom radius 72% of top, so the island reads as a chunky Townscaper
 * bevel when orbited below the horizon.
 */
export function HexIsland({
  count,
  axials,
  topY = 0,
  tileHeight = 1.9,
  minTiles = 7,
}: HexIslandProps) {
  const mergedGeometry = useMemo(() => {
    const tiles = axials
      ? axials.map(([q, r]) => axialToWorld(q, r, HEX_SIZE))
      : hexSpiralWorld(Math.max(count ?? 0, minTiles));

    // Prototype prism — pointy-top hex. Three.js CylinderGeometry with
    // 6 segments already places vertices at θ=0,60,120,... which lands
    // vertices on the ±Z axis (pointy-top) and flat edges on ±X. That
    // matches the pointy-top axialToWorld in hexGrid.ts, so NO rotation
    // is needed — my earlier PI/6 rotation was the bug that made tiles
    // not share edges.
    const r = HEX_SIZE * 1.005;
    const proto = new CylinderGeometry(r, r, tileHeight, 6, 1);
    proto.translate(0, -tileHeight / 2, 0);

    const perTile: BufferGeometry[] = [];
    for (const [x, z] of tiles) {
      const g = proto.clone();
      // Deterministic pastel color per tile.
      const h = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
      const col = new Color(
        h < 0.55 ? palette.sage : h < 0.82 ? palette.sand : palette.bone,
      );
      const n = g.attributes.position.count;
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        colors[i * 3 + 0] = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;
      }
      g.setAttribute("color", new BufferAttribute(colors, 3));
      g.translate(x, 0, z);
      perTile.push(g);
    }

    const merged = mergeGeometries(perTile, false);
    proto.dispose();
    perTile.forEach((g) => g.dispose());
    return merged ?? proto;
  }, [axials, count, minTiles, tileHeight]);

  useEffect(() => {
    return () => {
      mergedGeometry.dispose();
    };
  }, [mergedGeometry]);

  // Bevelled underbelly — ONE big tapered hex-ish cone beneath the tile
  // layer so the island has visible thickness from below without seams.
  const islandRadius = useMemo(() => {
    if (axials && axials.length > 0) {
      // Tight bound of the explicit axials — max distance from origin.
      let maxDist = 0;
      for (const [q, r] of axials) {
        const [wx, wz] = axialToWorld(q, r, HEX_SIZE);
        maxDist = Math.max(maxDist, Math.hypot(wx, wz));
      }
      return maxDist + HEX_SIZE;
    }
    return hexIslandRadius(Math.max(count ?? 0, minTiles));
  }, [axials, count, minTiles]);

  return (
    <group position={[0, topY, 0]}>
      {/* Top tile layer — merged prism per tile. <Edges> adds a subtle
          ink outline per hex (Townscaper hand-drawn look). threshold=20°
          draws only the strong silhouette edges, not every internal
          face seam. */}
      <mesh geometry={mergedGeometry} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.92} metalness={0.0} />
        <Edges threshold={20} color={palette.ink} scale={1} />
      </mesh>
      {/* Warm tapered belly under the whole island — one cone. */}
      <mesh position={[0, -tileHeight - 0.05, 0]}>
        <coneGeometry args={[islandRadius * 1.05, 3.2, 36, 1, true]} />
        <meshStandardMaterial
          color={palette.clay}
          roughness={1.0}
          metalness={0.0}
          side={2 /* DoubleSide — no backface culling on the cone hull */}
        />
      </mesh>
    </group>
  );
}
