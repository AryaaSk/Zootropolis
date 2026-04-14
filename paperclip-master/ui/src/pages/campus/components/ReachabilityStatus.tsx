import { palette } from "../palette";

/**
 * Zootropolis J2 — reusable reachability status pill.
 *
 * Self-contained HTML component with no hook dependencies; parents pass in
 * the result of {@link useAgentReachability} (or a subset of its fields).
 * Designed to slot into the leaf-agent drawer in `ContainerInspector.tsx`
 * (I2/I3 owns that file), so the ContainerInspector integration is a
 * one-line import + drop-in.
 *
 * States:
 *   - `reachable === null` → "Checking…" (neutral grey)
 *   - `reachable === true` → "Online" (accent green) + rtMs badge if present
 *   - `reachable === false` → "Offline" (clay red)
 */

interface ReachabilityStatusProps {
  reachable: boolean | null;
  rtMs?: number;
  probedAt?: string;
}

const GREEN = "#2f8f5c";
const GREEN_BG = "rgba(111, 216, 150, 0.18)";
const RED_BG = "rgba(239, 68, 68, 0.16)";
const GREY = "#6b6b6b";
const GREY_BG = "rgba(120, 120, 120, 0.14)";

function formatProbedAt(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = Date.now() - date.getTime();
  const s = Math.max(0, Math.round(diffMs / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

export function ReachabilityStatus({
  reachable,
  rtMs,
  probedAt,
}: ReachabilityStatusProps) {
  let label: string;
  let color: string;
  let background: string;
  if (reachable === null) {
    label = "Checking…";
    color = GREY;
    background = GREY_BG;
  } else if (reachable) {
    label = "Online";
    color = GREEN;
    background = GREEN_BG;
  } else {
    label = "Offline";
    color = palette.clay;
    background = RED_BG;
  }

  const freshness = formatProbedAt(probedAt);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 10px",
        borderRadius: 999,
        background,
        color,
        fontSize: 12,
        fontWeight: 500,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        lineHeight: 1.4,
      }}
      title={
        probedAt
          ? `Last probed ${freshness ?? probedAt}${
              typeof rtMs === "number" ? ` • ${rtMs}ms` : ""
            }`
          : undefined
      }
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: color,
          display: "inline-block",
        }}
      />
      {label}
      {reachable && typeof rtMs === "number" ? (
        <span style={{ opacity: 0.7, fontWeight: 400 }}>{rtMs}ms</span>
      ) : null}
    </span>
  );
}
