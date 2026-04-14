import { useMemo } from "react";
import { palette } from "../palette";

interface BuildingWindowsProps {
  /** Face width (X). */
  width: number;
  /** Face height (Y). */
  height: number;
  /** Local Z of the face plane (e.g. +z_front_of_building). */
  z: number;
  /** Y position of the face center, relative to the parent group. */
  y: number;
  /** "on" = emissive accent glow; "off" = dim ink rectangles. */
  active: boolean;
  /** Columns × rows of windows. */
  cols?: number;
  rows?: number;
}

/**
 * BuildingWindows — a grid of small emissive rectangles laid on the front
 * face of a building shell. When `active` is true (some descendant is
 * running), the windows light up with palette `accent`; Bloom (via
 * <CampusPostFx />) turns that into a soft glow. When inactive, windows
 * render as dark ink rectangles so the grid still reads as architecture.
 */
export function BuildingWindows({
  width,
  height,
  z,
  y,
  active,
  cols = 4,
  rows = 3,
}: BuildingWindowsProps) {
  const windows = useMemo(() => {
    const marginX = width * 0.12;
    const marginY = height * 0.12;
    const innerW = width - marginX * 2;
    const innerH = height - marginY * 2;
    const cellW = innerW / cols;
    const cellH = innerH / rows;
    const winW = cellW * 0.55;
    const winH = cellH * 0.7;
    const items: { x: number; y: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = -width / 2 + marginX + cellW * (c + 0.5);
        const cy = -height / 2 + marginY + cellH * (r + 0.5);
        items.push({ x: cx, y: cy });
      }
    }
    return { items, winW, winH };
  }, [width, height, cols, rows]);

  return (
    <group position={[0, y, z]}>
      {windows.items.map((w, i) => (
        <mesh key={i} position={[w.x, w.y, 0.001]}>
          <planeGeometry args={[windows.winW, windows.winH]} />
          <meshStandardMaterial
            color={active ? palette.accent : palette.ink}
            emissive={active ? palette.accent : palette.ink}
            emissiveIntensity={active ? 1.8 : 0.0}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
