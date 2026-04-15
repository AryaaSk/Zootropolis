import { cn } from "@/lib/utils";

/**
 * Zootropolis J2 — reusable reachability status pill.
 *
 * States:
 *   - `reachable === null` → "Checking…" (muted)
 *   - `reachable === true` → "Online" (emerald) + rtMs badge if present
 *   - `reachable === false` → "Offline" (destructive)
 *
 * Phase U: switched from inline-style hex colors to semantic Tailwind tokens
 * so the pill reads consistently inside the dark inspector.
 */

interface ReachabilityStatusProps {
  reachable: boolean | null;
  rtMs?: number;
  probedAt?: string;
}

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
  const variant =
    reachable === null
      ? "checking"
      : reachable
        ? "online"
        : "offline";

  const label =
    variant === "checking" ? "Checking…" : variant === "online" ? "Online" : "Offline";

  const freshness = formatProbedAt(probedAt);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        variant === "online" &&
          "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
        variant === "offline" &&
          "bg-destructive/15 text-destructive",
        variant === "checking" &&
          "bg-muted text-muted-foreground",
      )}
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
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          variant === "online" && "bg-emerald-500 animate-pulse",
          variant === "offline" && "bg-destructive",
          variant === "checking" && "bg-muted-foreground/60",
        )}
      />
      {label}
      {reachable && typeof rtMs === "number" ? (
        <span className="font-normal opacity-70">{rtMs}ms</span>
      ) : null}
    </span>
  );
}
