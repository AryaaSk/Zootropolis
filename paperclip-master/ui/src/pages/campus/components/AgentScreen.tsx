import { QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { Html } from "@react-three/drei";
import { readZootropolisLayer, type Agent, type Issue } from "@paperclipai/shared";
import { useNavigate } from "@/lib/router";
import { cn, agentUrl } from "@/lib/utils";
import { createIssueDetailPath } from "../../../lib/issueDetailBreadcrumb";
import { agentsApi } from "../../../api/agents";
import { queryKeys } from "../../../lib/queryKeys";
import { useContainerIssues } from "../hooks/useContainerIssues";
import { useCurrentAgentWork } from "../hooks/useCurrentAgentWork";
import { layerPillClass } from "../lib/layer-pill";

/**
 * Phase W6 — context bridge for drei's <Html>.
 *
 * drei's <Html> does `ReactDOM.createRoot(el).render(children)` (see
 * node_modules/.../drei/web/Html.js line 143), which creates a NEW
 * React root. New roots don't inherit context from the parent tree, so
 * `useQuery`/`useNavigate`/`useParams` blow up inside the body
 * (`No QueryClient set`, etc).
 *
 * The fix: capture queryClient + navigate in the OUTER tree (where
 * AgentScreen renders, inside the Canvas but inside the App's React
 * tree), then re-provide queryClient via QueryClientProvider and pass
 * `navigate` as a callback prop. Body components don't call any router
 * hooks themselves — they receive `navigate` from props.
 */
type NavigateFn = (to: string) => void;

/**
 * Phase W — floating "control panel" screen anchored above an agent's 3D
 * representation. Real world-space mesh (bezel) + `drei <Html transform>`
 * so the screen behaves like a physical object that the camera orbits,
 * while the HTML inside it accepts pointer events (click-to-navigate).
 *
 * Two variants:
 *   - AgentScreen: issue + state sections, default size. Mount above every
 *     agent/container tile.
 *   - AgentIssuesLineup: scrollable pending-issues list. Used only on
 *     AgentView (alongside an AgentScreen) as the second of the two
 *     replacement screens.
 */

interface AgentScreenProps {
  companyId: string;
  agentId: string | null;
  /**
   * - "default": small screen for children / tiles
   * - "large": AgentView's single-leaf screens (state + issues lineup)
   * - "focal": the view's main container summary — deliberately much larger
   *   than child screens so the focal container dominates visually.
   */
  variant?: "default" | "large" | "focal";
}

// Phase W4 — child screens are 2D HTML overlays anchored to their tile's
// 3D world position via drei <Html> in NON-transform mode. Earlier
// transform-mode rendering had a CSS3D compositor-layer issue: with a
// low zIndexRange (needed to keep overlay chrome on top), the HTML
// stacked behind the WebGL canvas, so all you saw was the bezel mesh.
// Non-transform mode renders HTML in screen space at the projected
// position — always readable, deterministically z-stacked.
//
// Sizes are CSS pixels (Html without transform is in screen space).
// Phase W9 — bumped child screen sizes so they're easier to read at
// typical camera distances.
const DEFAULT_HTML = { w: 280, h: 120 };
const LARGE_HTML = { w: 340, h: 170 };
const FOCAL_HTML = { w: 360, h: 200 };

// Range starts at 1 so even drei's far-depth elements stay ABOVE the
// canvas (which sits at z-auto / treated as 0). Max 9 stays below the
// z-10 overlay chrome (Breadcrumb/Minimap/Inspector/ExitCampus).
const SCREEN_Z_INDEX_RANGE: [number, number] = [9, 1];

export function AgentScreen({
  companyId,
  agentId,
  variant = "default",
}: AgentScreenProps) {
  // Capture contexts in the outer React tree BEFORE entering drei's <Html>
  // portal — see Phase W6 note above for why.
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const html =
    variant === "focal" ? FOCAL_HTML : variant === "large" ? LARGE_HTML : DEFAULT_HTML;
  return (
    <Html
      position={[0, 0, 0]}
      center
      // occlude=false — always visible. Tried "blending" for depth
      // occlusion but it restacks the canvas in a way that breaks the
      // chrome overlays. Living without occlusion until we have a
      // cleaner approach; mitigate by positioning screens high enough
      // that camera angles rarely overlap them with 3D models.
      occlude={false}
      zIndexRange={SCREEN_Z_INDEX_RANGE}
      // Inline styles (not Tailwind) on the wrapper so we don't depend on
      // CSS-variable resolution working through drei's portal.
      style={{
        width: html.w,
        minHeight: html.h,
        pointerEvents: "auto",
        background: "rgba(15, 17, 21, 0.95)",
        color: "#e7eaf0",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
        backdropFilter: "blur(10px)",
        overflow: "hidden",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      <QueryClientProvider client={queryClient}>
        <AgentScreenBody
          companyId={companyId}
          agentId={agentId}
          variant={variant}
          navigate={navigate}
        />
      </QueryClientProvider>
    </Html>
  );
}

interface AgentIssuesLineupProps {
  companyId: string;
  agentId: string;
}

export function AgentIssuesLineup({
  companyId,
  agentId,
}: AgentIssuesLineupProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return (
    <Html
      position={[0, 0, 0]}
      center
      // occlude=false — always visible. Tried "blending" for depth
      // occlusion but it restacks the canvas in a way that breaks the
      // chrome overlays. Living without occlusion until we have a
      // cleaner approach; mitigate by positioning screens high enough
      // that camera angles rarely overlap them with 3D models.
      occlude={false}
      zIndexRange={SCREEN_Z_INDEX_RANGE}
      style={{
        width: LARGE_HTML.w,
        minHeight: LARGE_HTML.h,
        pointerEvents: "auto",
        background: "rgba(15, 17, 21, 0.95)",
        color: "#e7eaf0",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
        backdropFilter: "blur(10px)",
        overflow: "hidden",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      <QueryClientProvider client={queryClient}>
        <AgentIssuesLineupBody
          companyId={companyId}
          agentId={agentId}
          navigate={navigate}
        />
      </QueryClientProvider>
    </Html>
  );
}

// ── Bodies ─────────────────────────────────────────────────────────────────

export function AgentScreenBody({
  companyId,
  agentId,
  variant,
  navigate,
}: {
  companyId: string;
  agentId: string | null;
  variant: "default" | "large" | "focal";
  navigate: NavigateFn;
}) {
  // If agentId is null (campus root), we still render but show a generic
  // campus summary. For now we short-circuit to the sleeping state — the
  // campus root has no single owning agent.
  const { data: agent } = useQuery({
    queryKey: agentId ? ["agent", agentId] : ["_no_agent"],
    queryFn: () => agentsApi.list(companyId).then(
      (rows: Agent[]) => rows.find((a: Agent) => a.id === agentId) ?? null,
    ),
    enabled: !!companyId && !!agentId,
  });

  const work = useCurrentAgentWork(companyId, agentId);

  const displayName =
    agent?.name ?? (agentId === null ? "Campus" : (agentId ?? "").slice(0, 8));
  const layer = agent ? (readZootropolisLayer(agent.metadata) ?? "agent") : "campus";
  const pillLabel = agentId === null ? "campus" : layer;

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col divide-y divide-border/60 rounded-sm bg-card text-foreground",
        variant !== "default" ? "text-[12px]" : "text-[10px]",
      )}
    >
      <IssueSection
        activeIssue={work.activeIssue}
        status={work.status}
        variant={variant}
        navigate={navigate}
      />
      <StateSection
        agent={agent ?? null}
        agentId={agentId}
        displayName={displayName}
        pillLabel={pillLabel}
        status={work.status}
        activeIssue={work.activeIssue}
        variant={variant}
        navigate={navigate}
      />
    </div>
  );
}

function IssueSection({
  activeIssue,
  status,
  variant,
  navigate,
}: {
  activeIssue: Issue | null;
  status: "running" | "idle" | "sleeping";
  variant: "default" | "large" | "focal";
  navigate: NavigateFn;
}) {
  const pad = variant !== "default" ? "px-3 py-2.5" : "px-2 py-2";

  if (!activeIssue) {
    return (
      <div className={cn("flex items-center justify-between", pad)}>
        <div className="flex flex-col">
          <div className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground/60">
            current issue
          </div>
          <div className="mt-0.5 italic text-muted-foreground">
            {status === "sleeping" ? "Sleeping" : "No active issue"}
          </div>
        </div>
      </div>
    );
  }

  const identifier = activeIssue.identifier ?? activeIssue.id.slice(0, 8);
  const href = createIssueDetailPath(activeIssue.identifier ?? activeIssue.id);

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={(e) => {
        // Stop the click from reaching the 3D tile's own onClick (which
        // would dolly-zoom into the agent).
        e.stopPropagation();
        navigate(href);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(href);
        }
      }}
      className={cn(
        "group flex flex-col cursor-pointer rounded-sm no-underline text-foreground hover:bg-accent/40 transition-colors",
        pad,
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground/70">
          {identifier}
        </span>
        <StatusPill status={activeIssue.status} />
      </div>
      <div
        className={cn(
          "mt-0.5 font-semibold leading-snug line-clamp-2 group-hover:underline",
          variant !== "default" ? "text-[13px]" : "text-[11px]",
        )}
      >
        {activeIssue.title}
      </div>
    </div>
  );
}

function StateSection({
  agent,
  agentId,
  displayName,
  pillLabel,
  status,
  activeIssue,
  variant,
  navigate,
}: {
  agent: Agent | null;
  agentId: string | null;
  displayName: string;
  pillLabel: string;
  status: "running" | "idle" | "sleeping";
  activeIssue: Issue | null;
  variant: "default" | "large" | "focal";
  navigate: NavigateFn;
}) {
  const pad = variant !== "default" ? "px-3 py-2.5" : "px-2 py-2";

  const subtext =
    status === "running" && activeIssue
      ? `running · ${activeIssue.identifier ?? activeIssue.id.slice(0, 8)}`
      : status === "idle"
        ? "idle"
        : "sleeping";

  const inner = (
    <>
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className={cn(
            "inline-block h-2 w-2 shrink-0 rounded-full",
            status === "running"
              ? "bg-emerald-400 shadow-[0_0_6px_theme(colors.emerald.400)] animate-pulse"
              : status === "idle"
                ? "bg-amber-400/70"
                : "bg-muted-foreground/40",
          )}
        />
        <span
          className={cn(
            "truncate font-semibold",
            variant !== "default" ? "text-[12px]" : "text-[10px]",
          )}
        >
          {displayName}
        </span>
        <span
          className={cn(
            "ml-auto shrink-0 rounded px-1 py-0.5 font-mono uppercase tracking-wide",
            variant !== "default" ? "text-[8px]" : "text-[7px]",
            layerPillClass((pillLabel as Parameters<typeof layerPillClass>[0])),
          )}
        >
          {pillLabel}
        </span>
      </div>
      <div
        className={cn(
          "mt-0.5 text-muted-foreground",
          variant !== "default" ? "text-[10px]" : "text-[9px]",
        )}
      >
        {subtext}
      </div>
    </>
  );

  if (!agent || !agentId) {
    // Campus root or agent not loaded — no link.
    return <div className={cn("flex flex-col", pad)}>{inner}</div>;
  }

  const href = agentUrl(agent);
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        navigate(href);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(href);
        }
      }}
      className={cn(
        "group flex flex-col cursor-pointer rounded-sm no-underline text-foreground hover:bg-accent/40 transition-colors",
        pad,
      )}
    >
      {inner}
    </div>
  );
}

// ── Issues lineup (AgentView right-hand screen) ───────────────────────────

export function AgentIssuesLineupBody({
  companyId,
  agentId,
  navigate,
}: {
  companyId: string;
  agentId: string;
  navigate: NavigateFn;
}) {
  const { receivedFromAbove, loading } = useContainerIssues(companyId, agentId);
  const actionable = receivedFromAbove.filter(
    (i) => i.status !== "done" && i.status !== "cancelled",
  );

  return (
    <div className="flex h-full w-full flex-col rounded-sm bg-card text-foreground">
      <div className="border-b border-border/60 px-3 py-2">
        <div className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground/70">
          Pending issues
        </div>
        <div className="text-[11px] text-muted-foreground">
          {loading
            ? "loading…"
            : actionable.length === 0
              ? "Nothing in the lineup"
              : `${actionable.length} pending`}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {actionable.length === 0 ? null : (
          <ul className="divide-y divide-border/60">
            {actionable.map((issue) => {
              const identifier = issue.identifier ?? issue.id.slice(0, 8);
              const href = createIssueDetailPath(issue.identifier ?? issue.id);
              return (
                <li key={issue.id}>
                  <div
                    role="link"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(href);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(href);
                      }
                    }}
                    className="group flex items-start gap-1.5 px-3 py-1.5 no-underline text-foreground hover:bg-accent/40 transition-colors cursor-pointer"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                        issue.status === "in_progress"
                          ? "bg-indigo-400"
                          : issue.status === "blocked"
                            ? "bg-red-400"
                            : "bg-sky-400",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground/70">
                          {identifier}
                        </span>
                        <StatusPill status={issue.status} />
                      </div>
                      <div className="mt-0.5 truncate text-[11px] font-medium group-hover:underline">
                        {issue.title}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Small atoms ────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "rounded px-1 py-[1px] font-mono text-[8px] uppercase tracking-wide",
        statusPillColor(status),
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function statusPillColor(status: string): string {
  switch (status) {
    case "in_progress":
      return "bg-indigo-500/20 text-indigo-300";
    case "done":
      return "bg-emerald-500/20 text-emerald-300";
    case "blocked":
      return "bg-red-500/20 text-red-300";
    case "in_review":
      return "bg-violet-500/20 text-violet-300";
    case "cancelled":
      return "bg-muted/60 text-muted-foreground";
    case "todo":
    default:
      return "bg-sky-500/20 text-sky-300";
  }
}
