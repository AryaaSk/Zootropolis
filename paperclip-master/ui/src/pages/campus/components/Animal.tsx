import { useEffect, useRef } from "react";
import { Edges } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { damp } from "maath/easing";
import type { Group } from "three";
import { palette } from "../palette";
import { useAgentLiveStatus } from "../hooks/useAgentLiveStatus";
import { StatusLight } from "./StatusLight";

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
  /** When true, renders a StatusLight above the animal. Defaults to true when agentId is provided. */
  showStatusLight?: boolean;
}

// One-shot pulse: 1.0 → 1.15 → 1.0 over ~600ms. We drive this from useFrame
// via a simple "pulse target" counter that gets bumped on every new start
// event (via agentId). The progress is a local ref that resets on bump.
const PULSE_PEAK = 1.15;
const PULSE_DURATION_S = 0.6;

/**
 * Cube-animal primitive.
 * Simple body cube + small head cube + 2 eye dots. Flat Lambert + outlines.
 * With an agentId, pulses on heartbeat.run.started and status-lights the run.
 */
export function Animal({
  color = palette.terracotta,
  position = [0, 0, 0],
  agentId,
  showStatusLight,
}: AnimalProps) {
  const groupRef = useRef<Group>(null);
  const { status, pulseKey } = useAgentLiveStatus(agentId);

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

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    // Compute the one-shot pulse scale target. Triangular envelope: 0→peak
    // in half the duration, peak→0 in the other half.
    let targetScale = 1;
    if (pulseStartRef.current !== null) {
      const now = performance.now() / 1000;
      const t = (now - pulseStartRef.current) / PULSE_DURATION_S;
      if (t >= 1) {
        pulseStartRef.current = null;
      } else {
        const tri = t < 0.5 ? t * 2 : (1 - t) * 2;
        targetScale = 1 + (PULSE_PEAK - 1) * tri;
      }
    }

    // Damp toward the target on all three axes. `damp` is per-ref-object.
    damp(group.scale, "x", targetScale, 0.08, delta);
    damp(group.scale, "y", targetScale, 0.08, delta);
    damp(group.scale, "z", targetScale, 0.08, delta);
  });

  const renderStatusLight = showStatusLight ?? !!agentId;

  return (
    <group ref={groupRef} position={position}>
      {/* Body */}
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[1.2, 1.2, 1.6]} />
        <meshLambertMaterial color={color} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 1.55, 0.7]}>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshLambertMaterial color={color} />
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
        <meshLambertMaterial color={color} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      <mesh position={[0.4, -0.1, -0.5]}>
        <boxGeometry args={[0.3, 0.6, 0.3]} />
        <meshLambertMaterial color={color} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      <mesh position={[-0.4, -0.1, 0.5]}>
        <boxGeometry args={[0.3, 0.6, 0.3]} />
        <meshLambertMaterial color={color} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>
      <mesh position={[0.4, -0.1, 0.5]}>
        <boxGeometry args={[0.3, 0.6, 0.3]} />
        <meshLambertMaterial color={color} />
        <Edges color={palette.ink} threshold={15} />
      </mesh>

      {renderStatusLight && <StatusLight status={status} />}
    </group>
  );
}
