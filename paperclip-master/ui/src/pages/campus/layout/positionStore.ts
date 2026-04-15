import type { Agent } from "@paperclipai/shared";
import { readZootropolisPos, type ZootropolisPos } from "@paperclipai/shared";
import { axialToWorld, HEX_SIZE } from "./hexGrid";

/**
 * Phase T — layout lookup helpers.
 *
 * Every view has a default "spiral / linear" order it uses when no
 * positions are persisted. These helpers let each view opt in to stored
 * positions without changing that default: if the agent has a
 * `metadata.zootropolis.pos` of the right kind, use it; else call the
 * caller's `fallback` to get the default order.
 */

export function readPosOfKind<K extends ZootropolisPos["kind"]>(
  agent: Agent,
  kind: K,
): Extract<ZootropolisPos, { kind: K }> | undefined {
  const pos = readZootropolisPos(agent.metadata);
  if (!pos) return undefined;
  if (pos.kind !== kind) return undefined;
  return pos as Extract<ZootropolisPos, { kind: K }>;
}

/** Resolve a campus-root child's world (x, z), hex-snapped. */
export function resolveCampusPos(
  agent: Agent,
  fallbackIndex: number,
  spiralOrder: Array<[number, number]>,
): { x: number; z: number; axial: { q: number; r: number } | null } {
  const stored = readPosOfKind(agent, "hex");
  if (stored) {
    const [x, z] = axialToWorld(stored.q, stored.r, HEX_SIZE);
    return { x, z, axial: { q: stored.q, r: stored.r } };
  }
  const [fx, fz] = spiralOrder[fallbackIndex] ?? [0, 0];
  return { x: fx, z: fz, axial: null };
}

/** Resolve a building floor's vertical y and rank. */
export function resolveFloorRank(
  agent: Agent,
  fallbackIndex: number,
): { rank: number; y: number } {
  const stored = readPosOfKind(agent, "floorRank");
  const rank = stored?.rank ?? fallbackIndex;
  const y = 0.8 + rank * 3.2;
  return { rank, y };
}

/** Resolve a floor-room's horizontal slot and x position. */
export function resolveRoomSlot(
  agent: Agent,
  fallbackIndex: number,
  totalSlots: number,
): { slot: number; x: number } {
  const stored = readPosOfKind(agent, "rowSlot");
  const slot = stored?.slot ?? fallbackIndex;
  const x = (slot - (Math.max(totalSlots, 1) - 1) / 2) * 3.5;
  return { slot, x };
}

/** Resolve a room-agent's free 2D grid position (snapped). */
export function resolveRoomAgentPos(
  agent: Agent,
  fallbackIndex: number,
  total: number,
): { x: number; z: number } {
  const stored = readPosOfKind(agent, "grid2d");
  if (stored) return { x: stored.x, z: stored.z };
  // Fallback: the existing line-of-agents layout.
  const x = (fallbackIndex - (Math.max(total, 1) - 1) / 2) * 1.8;
  return { x, z: 0 };
}
