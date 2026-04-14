import { useEffect, useRef } from "react";
import { Edges } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { damp } from "maath/easing";
import type { Group } from "three";
import { palette } from "../palette";
import { useAgentLiveStatus } from "../hooks/useAgentLiveStatus";
import { useLowQualityMode } from "../lib/quality-mode";
import { StatusLight } from "./StatusLight";
import { AnimalModel } from "./models/AnimalModel";

interface AnimalProps {
  color?: string;
  position?: [number, number, number];
  /**
   * Optional agent id. When provided, the animal subscribes to the live event
   * stream and plays a one-shot scale pulse on every heartbeat.run.started
   * for that agent, plus renders a StatusLight that reflects the current
   * run status. Leaving this undefined keeps the original static rendering
   * (used by pre-B5 views that don't yet carry an agent id).
   */
  agentId?: string;
  /**
   * Zootropolis v1.2 K2 — agent role ("engineer" / "researcher" / …). Passed
   * through to AnimalModel to pick the matching low-poly GLB (fox, owl, …).
   * Missing / unknown roles fall back to a deterministic hash on agentId.
   */
  role?: string;
  /** When true, renders a StatusLight above the animal. Defaults to true when agentId is provided. */
  showStatusLight?: boolean;
  /**
   * Zootropolis J2 — true when the agent's daemon is not responding. Passes
   * through to StatusLight (red bulb + exclamation badge) and desaturates the
   * body material so the whole animal reads as "offline". Callers should only
   * set this for aliaskit_vm leaves; container agents never pass it true.
   */
  unreachable?: boolean;
}

// One-shot pulse: 1.0 → 1.15 → 1.0 over ~600ms. We drive this from useFrame
// via a simple "pulse target" counter that gets bumped on every new start
// event (via agentId). The progress is a local ref that resets on bump.
const PULSE_PEAK = 1.15;
const PULSE_DURATION_S = 0.6;

// Idle bob (G3): low-amplitude sine on Y so the animal feels alive without
// competing with the heartbeat pulse. 1cm at ~0.5Hz. Phase is deterministic
// per agent so a herd doesn't bob in unison.
const BOB_AMPLITUDE = 0.01;
const BOB_FREQ_HZ = 0.5;

// Cheap deterministic phase in [0, 2π) from a string id.
function hashPhase(id: string | undefined): number {
  if (!id) return 0;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 0xffffffff) * Math.PI * 2;
}

// Mix a palette colour toward neutral grey — used when an agent is unreachable
// so the whole body reads as muted/offline. Kept tiny + allocation-free per
// render; the mix ratio is fixed (50%) to match the red bulb's clear "off"
// signal without making the animal invisible.
function desaturate(hex: string): string {
  const parsed = hex.replace("#", "");
  if (parsed.length !== 6) return hex;
  const r = parseInt(parsed.slice(0, 2), 16);
  const g = parseInt(parsed.slice(2, 4), 16);
  const b = parseInt(parsed.slice(4, 6), 16);
  const gray = 0x90; // warm-neutral grey
  const mix = (c: number) => Math.round(c * 0.5 + gray * 0.5);
  return `#${mix(r).toString(16).padStart(2, "0")}${mix(g)
    .toString(16)
    .padStart(2, "0")}${mix(b).toString(16).padStart(2, "0")}`;
}

/**
 * Pre-K2 procedural cube body. Kept inline so `?lq=1` — and the GLB
 * Suspense fallback indirectly — still have a working animal even when
 * the model pipeline is disabled. The transform wrapper (idle bob +
 * heartbeat pulse) lives in the parent Animal component; this is just
 * the static geometry.
 */
function ProceduralAnimal({ bodyColor }: { bodyColor: string }) {
  return (
    <>
      {/* Body */}
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[1.2, 1.2, 1.6]} />
        <meshLambertMaterial color={bodyColor} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 1.55, 0.7]}>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshLambertMaterial color={bodyColor} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>

      {/* Eyes */}
      <mesh position={[-0.22, 1.65, 1.11]}>
        <boxGeometry args={[0.12, 0.12, 0.04]} />
        <meshLambertMaterial color={palette.ink} />
      </mesh>
      <mesh position={[0.22, 1.65, 1.11]}>
        <boxGeometry args={[0.12, 0.12, 0.04]} />
        <meshLambertMaterial color={palette.ink} />
      </mesh>

      {/* Legs */}
      <mesh position={[-0.4, -0.1, -0.5]}>
        <boxGeometry args={[0.3, 0.6, 0.3]} />
        <meshLambertMaterial color={bodyColor} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      <mesh position={[0.4, -0.1, -0.5]}>
        <boxGeometry args={[0.3, 0.6, 0.3]} />
        <meshLambertMaterial color={bodyColor} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      <mesh position={[-0.4, -0.1, 0.5]}>
        <boxGeometry args={[0.3, 0.6, 0.3]} />
        <meshLambertMaterial color={bodyColor} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      <mesh position={[0.4, -0.1, 0.5]}>
        <boxGeometry args={[0.3, 0.6, 0.3]} />
        <meshLambertMaterial color={bodyColor} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
    </>
  );
}

/**
 * Animal — group wrapper around either a role-mapped GLB (default) or
 * the procedural cube primitive (`?lq=1`). The wrapper owns the idle
 * bob + heartbeat pulse transforms so both paths animate identically.
 * With an agentId, pulses on heartbeat.run.started and status-lights the run.
 */
export function Animal({
  color = palette.terracotta,
  position = [0, 0, 0],
  agentId,
  role,
  showStatusLight,
  unreachable = false,
}: AnimalProps) {
  const groupRef = useRef<Group>(null);
  const { status, pulseKey } = useAgentLiveStatus(agentId);
  const bobPhaseRef = useRef(hashPhase(agentId));
  const baseYRef = useRef(position[1]);
  baseYRef.current = position[1];
  const lowQuality = useLowQualityMode();

  // Pulse state is intentionally kept out of React: bump a ref on pulseKey
  // change, then interpolate inside useFrame. Avoids per-frame re-renders
  // when 50+ agents are on screen.
  const pulseStartRef = useRef<number | null>(null);
  const lastPulseKeyRef = useRef(pulseKey);
  useEffect(() => {
    if (pulseKey !== lastPulseKeyRef.current) {
      lastPulseKeyRef.current = pulseKey;
      pulseStartRef.current = performance.now() / 1000;
    }
  }, [pulseKey]);

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    if (!group) return;

    // Compute the one-shot pulse scale target. Triangular envelope: 0→peak
    // in half the duration, peak→0 in the other half.
    let targetScale = 1;
    let pulseLift = 0;
    if (pulseStartRef.current !== null) {
      const now = performance.now() / 1000;
      const t = (now - pulseStartRef.current) / PULSE_DURATION_S;
      if (t >= 1) {
        pulseStartRef.current = null;
      } else {
        const tri = t < 0.5 ? t * 2 : (1 - t) * 2;
        targetScale = 1 + (PULSE_PEAK - 1) * tri;
        // Small lift synced to the scale pulse so the animal gently hops.
        pulseLift = tri * 0.04;
      }
    }

    // Damp toward the target on all three axes. `damp` is per-ref-object.
    damp(group.scale, "x", targetScale, 0.08, delta);
    damp(group.scale, "y", targetScale, 0.08, delta);
    damp(group.scale, "z", targetScale, 0.08, delta);

    // Idle bob — sine on Y, additive with the pulse lift. Hashed phase
    // keeps a roomful of animals from bobbing in unison.
    const t = clock.getElapsedTime();
    const bob =
      BOB_AMPLITUDE *
      Math.sin(t * Math.PI * 2 * BOB_FREQ_HZ + bobPhaseRef.current);
    group.position.y = baseYRef.current + bob + pulseLift;
  });

  const renderStatusLight = showStatusLight ?? !!agentId;
  const bodyColor = unreachable ? desaturate(color) : color;

  return (
    <group ref={groupRef} position={position}>
      {lowQuality ? (
        <ProceduralAnimal bodyColor={bodyColor} />
      ) : (
        <AnimalModel role={role} agentId={agentId} color={bodyColor} />
      )}

      {renderStatusLight && <StatusLight status={status} unreachable={unreachable} />}
    </group>
  );
}
