/**
 * Zootropolis spatial-hierarchy types.
 *
 * Every Paperclip agent in a Zootropolis tree carries a `layer` tag in its
 * `agents.metadata.zootropolis` JSONB field. The tag determines what shape
 * the agent renders as in the 3D campus and which adapter it should use:
 * leaf agents do real work; container agents (room/floor/building/campus)
 * are pure delegators.
 */

/**
 * The full ladder of layer tags. `"campus"` stays a valid tag because
 * every company has exactly ONE implicit campus agent (the org's root)
 * — but users never create or wrap into it. The campus agent is
 * auto-provisioned at company-setup time, and every other agent lives
 * below it via `reportsTo`. To reflect that policy, UI affordances
 * ("Wrap in …") cap at `building`.
 */
export const ZOOTROPOLIS_LAYERS = [
  "agent",
  "room",
  "floor",
  "building",
  "campus",
] as const;

/** Layers a user can explicitly wrap INTO. Excludes `campus` because
 *  the campus is always auto-created and implicit. */
export const ZOOTROPOLIS_WRAPPABLE_LAYERS = [
  "room",
  "floor",
  "building",
] as const;

export type ZootropolisLayer = (typeof ZOOTROPOLIS_LAYERS)[number];
export type ZootropolisWrappableLayer = (typeof ZOOTROPOLIS_WRAPPABLE_LAYERS)[number];

/**
 * Runtime descriptor for the per-agent VM-surrogate (folder-as-VM in dev,
 * real Cua/Coasty VM in prod). Set by the port broker on hire.
 */
export interface ZootropolisRuntime {
  endpoint: string;
  port: number;
}

/**
 * Public-safe handles for the AliasKit identity provisioned to a leaf at
 * hire time. Secrets (card number, TOTP) live only in the agent's folder.
 */
export interface ZootropolisAliasHandles {
  email?: string;
  phone?: string;
}

/**
 * Phase T — stored spatial position. One of four discriminated kinds
 * depending on the layer the agent lives in:
 *   - `hex`       — campus root children (island tiles)
 *   - `floorRank` — floors inside a building (vertical order)
 *   - `rowSlot`   — rooms inside a floor (horizontal row)
 *   - `grid2d`    — agents inside a room (free 2D grid on the floor)
 *
 * All `pos` is OPTIONAL — when missing, the renderer falls back to the
 * spiral/linear default order, so existing agents keep working
 * unchanged until the user drags one for the first time.
 */
export type ZootropolisPos =
  | { kind: "hex"; q: number; r: number }
  | { kind: "floorRank"; rank: number }
  | { kind: "rowSlot"; slot: number }
  | { kind: "grid2d"; x: number; z: number };

/**
 * Shape stored at `agents.metadata.zootropolis`. All fields optional so
 * existing Paperclip agents (without Zootropolis metadata) keep working.
 */
export interface ZootropolisAgentMetadata {
  layer?: ZootropolisLayer;
  displayName?: string;
  runtime?: ZootropolisRuntime;
  aliaskit?: ZootropolisAliasHandles;
  pos?: ZootropolisPos;
}

export function isZootropolisLayer(value: unknown): value is ZootropolisLayer {
  return typeof value === "string" && (ZOOTROPOLIS_LAYERS as readonly string[]).includes(value);
}

export function isZootropolisWrappableLayer(
  value: unknown,
): value is ZootropolisWrappableLayer {
  return (
    typeof value === "string" &&
    (ZOOTROPOLIS_WRAPPABLE_LAYERS as readonly string[]).includes(value)
  );
}

/**
 * Pull the layer tag out of an agent's `metadata.zootropolis` JSONB. Returns
 * undefined for agents not part of a Zootropolis hierarchy.
 */
export function readZootropolisLayer(metadata: unknown): ZootropolisLayer | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const z = (metadata as Record<string, unknown>).zootropolis;
  if (!z || typeof z !== "object") return undefined;
  const layer = (z as Record<string, unknown>).layer;
  return isZootropolisLayer(layer) ? layer : undefined;
}

/**
 * Pull a persisted spatial position out of `metadata.zootropolis.pos`.
 * Returns `undefined` if the field is absent or malformed — callers
 * fall back to a layer-appropriate default (spiral / linear order).
 */
export function readZootropolisPos(metadata: unknown): ZootropolisPos | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const z = (metadata as Record<string, unknown>).zootropolis;
  if (!z || typeof z !== "object") return undefined;
  const pos = (z as Record<string, unknown>).pos;
  if (!pos || typeof pos !== "object") return undefined;
  const kind = (pos as Record<string, unknown>).kind;
  if (kind === "hex") {
    const q = (pos as Record<string, unknown>).q;
    const r = (pos as Record<string, unknown>).r;
    if (typeof q === "number" && typeof r === "number") return { kind: "hex", q, r };
    return undefined;
  }
  if (kind === "floorRank") {
    const rank = (pos as Record<string, unknown>).rank;
    if (typeof rank === "number") return { kind: "floorRank", rank };
    return undefined;
  }
  if (kind === "rowSlot") {
    const slot = (pos as Record<string, unknown>).slot;
    if (typeof slot === "number") return { kind: "rowSlot", slot };
    return undefined;
  }
  if (kind === "grid2d") {
    const x = (pos as Record<string, unknown>).x;
    const zCoord = (pos as Record<string, unknown>).z;
    if (typeof x === "number" && typeof zCoord === "number") {
      return { kind: "grid2d", x, z: zCoord };
    }
    return undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Issue-close marker (Phase D1)
//
// Convention: a leaf agent's underlying CLI emits a JSON object as its LAST
// stdout line. If the object contains a `zootropolis` field matching the
// shape below, the heartbeat runner will (a) post `artifact` as the issue's
// closing comment and (b) transition the assigned issue to `status` (default
// "done"). Absent or malformed markers fall back to today's behaviour: the
// run finishes, stdout-tail becomes a comment, the issue stays open.
// ---------------------------------------------------------------------------

export interface ZootropolisCloseMarker {
  action: "close";
  status?: "done" | "cancelled";
  summary?: string;
  artifact?: string;
}

export interface ZootropolisResultEnvelope {
  zootropolis: ZootropolisCloseMarker;
}

export function readZootropolisCloseMarker(
  resultJson: unknown,
): ZootropolisCloseMarker | null {
  if (!resultJson || typeof resultJson !== "object" || Array.isArray(resultJson)) return null;
  const z = (resultJson as Record<string, unknown>).zootropolis;
  if (!z || typeof z !== "object" || Array.isArray(z)) return null;
  const marker = z as Record<string, unknown>;
  if (marker.action !== "close") return null;
  const status =
    marker.status === "cancelled" ? "cancelled"
    : "done";
  const summary = typeof marker.summary === "string" && marker.summary.trim().length > 0
    ? marker.summary.trim() : undefined;
  const artifact = typeof marker.artifact === "string" && marker.artifact.trim().length > 0
    ? marker.artifact : undefined;
  return { action: "close", status, summary, artifact };
}
