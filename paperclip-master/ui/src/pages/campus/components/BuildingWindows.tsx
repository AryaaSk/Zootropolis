import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { MeshStandardMaterial } from "three";
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
  /**
   * Optional 0..1 scalar controlling how many windows are lit + how
   * brightly they glow. Defaults: 1.0 when active, 0.1 when idle.
   */
  intensity?: number;
  /**
   * Stable seed for per-window phase/hash. Pass a building id or similar
   * so two buildings don't flicker in lock-step. Falls back to a stable
   * position-derived default via (width, height, z, y).
   */
  seed?: string | number;
}

/**
 * Tiny deterministic 32-bit string hash (FNV-1a-ish). We don't need crypto —
 * just enough to decorrelate per-window phases between buildings.
 */
function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Normalised pseudo-random in [0, 1) from an integer key. */
function rand01(h: number): number {
  // xorshift32
  let x = h | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (((x >>> 0) % 100000) / 100000);
}

/**
 * BuildingWindows — a grid of small emissive rectangles laid on the front
 * face of a building shell.
 *
 * Phase G4 upgrade: each window has its own deterministic phase offset
 * (hashed from the building seed + window index). Lit windows glow warm
 * cream; unlit windows read as dim dust-blue so the grid still reads as
 * architecture even when the building is idle. The lit-window count and
 * the per-window glow both scale with `intensity` (0..1) which the parent
 * derives from descendant running-agent activity.
 *
 * Flicker is a small sine on emissive intensity (~0.85..1.15, ~0.5–1Hz)
 * driven by useFrame — React state is only touched on `active` flips.
 */
export function BuildingWindows({
  width,
  height,
  z,
  y,
  active,
  cols = 4,
  rows = 3,
  intensity,
  seed,
}: BuildingWindowsProps) {
  const effectiveIntensity =
    typeof intensity === "number"
      ? Math.max(0, Math.min(1, intensity))
      : active
        ? 1.0
        : 0.1;

  const derivedSeed = useMemo(() => {
    if (seed !== undefined) return String(seed);
    // Fallback seed from geometry so two identical buildings still differ a
    // bit; callers that want stable per-building identity should pass `seed`.
    return `${width.toFixed(3)}:${height.toFixed(3)}:${z.toFixed(3)}:${y.toFixed(3)}`;
  }, [seed, width, height, z, y]);

  const windows = useMemo(() => {
    const baseHash = hashSeed(derivedSeed);
    const marginX = width * 0.12;
    const marginY = height * 0.12;
    const innerW = width - marginX * 2;
    const innerH = height - marginY * 2;
    const cellW = innerW / cols;
    const cellH = innerH / rows;
    const winW = cellW * 0.55;
    const winH = cellH * 0.7;
    const items: {
      x: number;
      y: number;
      /** 0..1 constant — determines whether this window is on at a given intensity. */
      litThreshold: number;
      /** Phase offset in radians for the flicker sine. */
      phase: number;
      /** Per-window flicker freq 0.5–1Hz (radians/second). */
      freq: number;
    }[] = [];
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = -width / 2 + marginX + cellW * (c + 0.5);
        const cy = -height / 2 + marginY + cellH * (r + 0.5);
        // Three decorrelated pseudo-randoms per window.
        const h1 = hashSeed(`${baseHash}:${idx}:t`);
        const h2 = hashSeed(`${baseHash}:${idx}:p`);
        const h3 = hashSeed(`${baseHash}:${idx}:f`);
        const litThreshold = rand01(h1);
        const phase = rand01(h2) * Math.PI * 2;
        // freq: 0.5..1 Hz → 2π*(0.5..1) rad/s
        const freq = (0.5 + rand01(h3) * 0.5) * Math.PI * 2;
        items.push({ x: cx, y: cy, litThreshold, phase, freq });
        idx += 1;
      }
    }
    return { items, winW, winH };
  }, [derivedSeed, width, height, cols, rows]);

  // Per-window lit decision. A window is "on" if its stable threshold is
  // below the idle-lit floor (10–20%) plus the active-driven bonus. This
  // guarantees that as intensity rises, strictly MORE windows light up —
  // never a random subset that causes popping.
  const litFlags = useMemo(() => {
    // Idle floor: 15% of windows glow even when the building is idle (the
    // "someone left a lamp on" look). Active scales the lit fraction up
    // toward ~90% at intensity=1.
    const idleFloor = 0.15;
    const activeCap = 0.9;
    const litFraction = idleFloor + (activeCap - idleFloor) * effectiveIntensity;
    return windows.items.map((w) => w.litThreshold < litFraction);
  }, [windows, effectiveIntensity]);

  // Refs to each lit window's material for useFrame emissive updates.
  const materialRefs = useRef<(MeshStandardMaterial | null)[]>([]);
  // Re-size the ref array to the current grid size.
  if (materialRefs.current.length !== windows.items.length) {
    materialRefs.current = new Array(windows.items.length).fill(null);
  }

  // Base emissive intensity scales gently with effectiveIntensity so a busy
  // building literally glows brighter overall.
  const baseEmissive = 1.2 + effectiveIntensity * 0.9; // ~1.2..2.1

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < windows.items.length; i++) {
      const mat = materialRefs.current[i];
      if (!mat) continue;
      if (!litFlags[i]) {
        // Off windows stay at 0 emissive; setting once is enough but the
        // cost of an assignment is negligible and keeps state consistent
        // across hot-reloads.
        mat.emissiveIntensity = 0;
        continue;
      }
      const w = windows.items[i];
      // Sine flicker in [0.85, 1.15]
      const flicker = 1.0 + 0.15 * Math.sin(w.phase + t * w.freq);
      mat.emissiveIntensity = baseEmissive * flicker;
    }
  });

  return (
    <group position={[0, y, z]}>
      {windows.items.map((w, i) => {
        const lit = litFlags[i];
        return (
          <mesh key={i} position={[w.x, w.y, 0.001]}>
            <planeGeometry args={[windows.winW, windows.winH]} />
            <meshStandardMaterial
              ref={(m) => {
                materialRefs.current[i] = m;
              }}
              // Off: dim dust-blue rectangles so the grid still reads as
              // architecture. On: warm cream glass that bloom turns into a
              // soft lamp glow.
              color={lit ? palette.cream : palette.dustBlue}
              emissive={lit ? palette.cream : palette.ink}
              emissiveIntensity={lit ? baseEmissive : 0}
              toneMapped={false}
              opacity={lit ? 1 : 0.55}
              transparent={!lit}
            />
          </mesh>
        );
      })}
    </group>
  );
}
