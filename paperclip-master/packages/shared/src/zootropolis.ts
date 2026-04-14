/**
 * Zootropolis spatial-hierarchy types.
 *
 * Every Paperclip agent in a Zootropolis tree carries a `layer` tag in its
 * `agents.metadata.zootropolis` JSONB field. The tag determines what shape
 * the agent renders as in the 3D campus and which adapter it should use:
 * leaf agents do real work; container agents (room/floor/building/campus)
 * are pure delegators.
 */

export const ZOOTROPOLIS_LAYERS = [
  "agent",
  "room",
  "floor",
  "building",
  "campus",
] as const;

export type ZootropolisLayer = (typeof ZOOTROPOLIS_LAYERS)[number];

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
 * Shape stored at `agents.metadata.zootropolis`. All fields optional so
 * existing Paperclip agents (without Zootropolis metadata) keep working.
 */
export interface ZootropolisAgentMetadata {
  layer?: ZootropolisLayer;
  displayName?: string;
  runtime?: ZootropolisRuntime;
  aliaskit?: ZootropolisAliasHandles;
}

export function isZootropolisLayer(value: unknown): value is ZootropolisLayer {
  return typeof value === "string" && (ZOOTROPOLIS_LAYERS as readonly string[]).includes(value);
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
