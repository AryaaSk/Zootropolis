import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import {
  Color,
  type Group,
  type Mesh,
  type MeshStandardMaterial,
} from "three";

/**
 * Phase S polish — "glow on hover".
 *
 * Traverses every Mesh in the group and temporarily boosts its material's
 * emissive channel while `active` is true. Caches the original emissive
 * color + intensity on first mount so we can restore it cleanly on
 * un-hover. Zero geometry changes, no pointer-entry flicker — this reads
 * as "the whole object lights up in your cursor's color".
 *
 * Works on any MeshStandardMaterial / MeshPhysicalMaterial (the defaults
 * for our GLB buildings and procedural tiles). Falls through safely on
 * materials that don't have `emissive`.
 */
interface HoverEmissiveOptions {
  /**
   * Optional override color. When omitted, the hook uses each mesh's
   * OWN base color as the emissive tint — so the object appears to glow
   * in its own hue rather than wash out to uniform white. This matches
   * how CSS `filter: brightness(1.3)` reads.
   */
  color?: string | Color;
  /** Emissive intensity while hovered. 0.55 ≈ CSS brightness(1.3). */
  intensity?: number;
}

export function useHoverEmissive(
  ref: RefObject<Group | null>,
  active: boolean,
  { color, intensity = 0.55 }: HoverEmissiveOptions = {},
) {
  const explicitColor = useRef<Color | null>(
    color ? (color instanceof Color ? color : new Color(color)) : null,
  );
  explicitColor.current = color
    ? color instanceof Color
      ? color
      : new Color(color)
    : null;
  const originals = useRef<
    Map<MeshStandardMaterial, { emissive: Color; intensity: number }>
  >(new Map());

  useEffect(() => {
    const group = ref.current;
    if (!group) return;
    group.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as MeshStandardMaterial | MeshStandardMaterial[];
      const mats = Array.isArray(mat) ? mat : [mat];
      for (const m of mats) {
        if (!m || !(m as MeshStandardMaterial).emissive) continue;
        const std = m as MeshStandardMaterial;
        if (!originals.current.has(std)) {
          originals.current.set(std, {
            emissive: std.emissive.clone(),
            intensity: std.emissiveIntensity ?? 0,
          });
        }
        if (active) {
          // Self-glow — emissive mirrors the base color so the object
          // brightens in its own hue, not a flat white wash.
          const tint = explicitColor.current ?? std.color;
          std.emissive.copy(tint);
          std.emissiveIntensity = intensity;
        } else {
          const orig = originals.current.get(std);
          if (orig) {
            std.emissive.copy(orig.emissive);
            std.emissiveIntensity = orig.intensity;
          }
        }
      }
    });
  }, [active, intensity, ref]);
}
