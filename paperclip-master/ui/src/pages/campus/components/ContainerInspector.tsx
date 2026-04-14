import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  readZootropolisLayer,
  type Issue,
  type ZootropolisAgentMetadata,
  type ZootropolisLayer,
} from "@paperclipai/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { agentsApi } from "../../../api/agents";
import { queryKeys } from "../../../lib/queryKeys";
import { IssueRow } from "../../../components/IssueRow";
import { useContainerChildren } from "../hooks/useContainerChildren";
import { useContainerIssues } from "../hooks/useContainerIssues";
import { useContainerLiveStatus } from "../hooks/useContainerLiveStatus";
import { palette } from "../palette";

/**
 * Tailwind class for each Zootropolis layer pill — matches OrgChart.tsx so
 * the badge reads the same everywhere it appears.
 */
const LAYER_PILL_CLASS: Record<ZootropolisLayer, string> = {
  agent: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  room: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  floor: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  building:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  campus: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
};

type HireSpec = {
  label: string;
  /** Layer of the agent that will be created. */
  layer: ZootropolisLayer;
};

/** What can I hire from a given layer? Keyed by the CURRENT view's layer. */
function hireOptionsFor(
  currentLayer: ZootropolisLayer | "campus-root",
): HireSpec[] {
  switch (currentLayer) {
    case "campus-root":
      return [
        { label: "+ Hire one agent", layer: "agent" },
        { label: "+ Hire a building", layer: "building" },
      ];
    case "campus":
      return [{ label: "+ Hire a building", layer: "building" }];
    case "building":
      return [{ label: "+ Hire a floor in this building", layer: "floor" }];
    case "floor":
      return [{ label: "+ Hire a room on this floor", layer: "room" }];
    case "room":
      return [{ label: "+ Hire an agent into this room", layer: "agent" }];
    case "agent":
    default:
      return [];
  }
}

interface ContainerInspectorProps {
  companyId: string;
  /** null on the campus root view. */
  agentId: string | null;
  /** Optional: hide the hire footer (F1 CampusView handles empty-state itself). */
  hideHireFooter?: boolean;
  /** Start collapsed? Default: open. */
  defaultOpen?: boolean;
}

/**
 * ContainerInspector — right-edge slide-in drawer for every campus view.
 *
 * Mirrors the Minimap's anchor pattern: an HTML overlay mounted as a sibling
 * of the R3F <Canvas> (the parent div is already position: relative per B8).
 *
 * Phase E2: Header (name + layer pill + live dot), two issue sections
 * ("Tasks delegated" / "Tasks I owe") — or a runtime/identity card on the
 * leaf agent view.
 *
 * Phase F2: Footer with layer-aware "+ Hire <next layer down>" buttons that
 * expand into an inline name form and POST to /api/companies/:id/agents.
 */
export function ContainerInspector({
  companyId,
  agentId,
  hideHireFooter = false,
  defaultOpen = true,
}: ContainerInspectorProps) {
  const [open, setOpen] = useState(defaultOpen);
  const { self } = useContainerChildren(companyId, agentId);
  const { issuedDown, receivedFromAbove, loading } = useContainerIssues(
    companyId,
    agentId,
  );
  const liveStatus = useContainerLiveStatus(companyId, agentId);

  const selfLayer = useMemo<ZootropolisLayer | "campus-root">(() => {
    if (agentId === null) return "campus-root";
    return readZootropolisLayer(self?.metadata) ?? "agent";
  }, [agentId, self]);

  const displayName = useMemo(() => {
    if (agentId === null) return companyId || "Campus";
    return self?.name ?? agentId.slice(0, 8);
  }, [agentId, companyId, self]);

  // For the footer "Hire" controls.
  const hireOptions = hideHireFooter ? [] : hireOptionsFor(selfLayer);
  const showTasksDelegated = selfLayer !== "agent";
  const showTasksOwed = selfLayer !== "campus-root" && selfLayer !== "campus";
  const isLeaf = selfLayer === "agent";

  return (
    <>
      {/* Toggle chevron — always visible on the right edge. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Hide inspector" : "Show inspector"}
        className="pointer-events-auto absolute top-1/2 z-20 -translate-y-1/2 rounded-l-md border border-r-0 p-1 shadow-sm transition-[right] backdrop-blur-md"
        style={{
          right: open ? 360 : 0,
          backgroundColor: `${palette.bone}e6`,
          borderColor: palette.ink,
          color: palette.ink,
        }}
      >
        {open ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      <aside
        aria-label="Container inspector"
        className="pointer-events-auto absolute right-0 top-0 z-10 flex h-full flex-col border-l shadow-lg backdrop-blur-md transition-transform"
        style={{
          width: 360,
          backgroundColor: `${palette.bone}f0`,
          borderColor: palette.ink,
          color: palette.ink,
          transform: open ? "translateX(0)" : "translateX(100%)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 border-b px-3 py-2.5"
          style={{ borderColor: `${palette.ink}33` }}
        >
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            title={`Live status: ${liveStatus}`}
            style={{
              backgroundColor:
                liveStatus === "running" ? palette.accent : palette.dustBlue,
              boxShadow:
                liveStatus === "running"
                  ? `0 0 6px ${palette.accent}`
                  : undefined,
            }}
          />
          <span className="truncate text-sm font-semibold">{displayName}</span>
          <span
            className={`ml-auto shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide ${
              selfLayer === "campus-root"
                ? LAYER_PILL_CLASS.campus
                : LAYER_PILL_CLASS[selfLayer]
            }`}
          >
            {selfLayer === "campus-root" ? "campus" : selfLayer}
          </span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {isLeaf ? (
            <LeafAgentBody metadata={self?.metadata as ZootropolisAgentMetadata | null | undefined} />
          ) : (
            <>
              {showTasksDelegated && (
                <Section title="Tasks delegated">
                  {loading ? (
                    <SpinnerRow />
                  ) : issuedDown.length === 0 ? (
                    <EmptyRow>No tasks delegated yet</EmptyRow>
                  ) : (
                    <IssueList issues={issuedDown} />
                  )}
                </Section>
              )}
              {showTasksOwed && (
                <Section title="Tasks I owe">
                  {loading ? (
                    <SpinnerRow />
                  ) : receivedFromAbove.length === 0 ? (
                    <EmptyRow>No tasks owed upward</EmptyRow>
                  ) : (
                    <IssueList issues={receivedFromAbove} />
                  )}
                </Section>
              )}
            </>
          )}
        </div>

        {/* Footer — Hire controls (F2). */}
        {hireOptions.length > 0 && (
          <HireFooter
            companyId={companyId}
            parentAgentId={agentId}
            options={hireOptions}
          />
        )}
      </aside>
    </>
  );
}

// ── Body sub-components ────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="border-b"
      style={{ borderColor: `${palette.ink}1a` }}
    >
      <div
        className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: palette.deepBlue }}
      >
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-3 text-xs italic" style={{ color: `${palette.ink}99` }}>
      {children}
    </div>
  );
}

function SpinnerRow() {
  return (
    <div
      className="flex items-center gap-2 px-3 pb-3 text-xs"
      style={{ color: `${palette.ink}99` }}
    >
      <span
        aria-hidden
        className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-t-transparent"
        style={{ borderColor: `${palette.deepBlue} transparent ${palette.deepBlue} ${palette.deepBlue}` }}
      />
      loading…
    </div>
  );
}

function IssueList({ issues }: { issues: Issue[] }) {
  return (
    <div className="px-1 pb-2">
      {issues.map((issue) => (
        <IssueRow key={issue.id} issue={issue} />
      ))}
    </div>
  );
}

function LeafAgentBody({
  metadata,
}: {
  metadata: ZootropolisAgentMetadata | null | undefined;
}) {
  const runtime = metadata?.runtime;
  const aliasEmail = metadata?.aliaskit?.email;
  return (
    <>
      <Section title="Runtime">
        {runtime ? (
          <div className="space-y-0.5 px-3 pb-3 font-mono text-[11px]" style={{ color: palette.ink }}>
            <div>endpoint: {runtime.endpoint}</div>
            <div>port: {runtime.port}</div>
            {aliasEmail && <div>identity: {aliasEmail}</div>}
          </div>
        ) : (
          <EmptyRow>No runtime metadata (not a Zootropolis leaf)</EmptyRow>
        )}
      </Section>
      <Section title="Live transcript">
        <EmptyRow>transcript wires in Phase E5</EmptyRow>
      </Section>
    </>
  );
}

// ── Footer: hire controls (Phase F2) ───────────────────────────────────────

function HireFooter({
  companyId,
  parentAgentId,
  options,
}: {
  companyId: string;
  parentAgentId: string | null;
  options: HireSpec[];
}) {
  const [activeLayer, setActiveLayer] = useState<ZootropolisLayer | null>(null);
  return (
    <div
      className="border-t px-3 py-2.5"
      style={{ borderColor: `${palette.ink}33` }}
    >
      <div
        className="pb-1.5 text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: palette.deepBlue }}
      >
        Hire
      </div>
      <div className="flex flex-col gap-1.5">
        {options.map((opt) => (
          <div key={opt.layer}>
            {activeLayer === opt.layer ? (
              <HireForm
                companyId={companyId}
                parentAgentId={parentAgentId}
                layer={opt.layer}
                onCancel={() => setActiveLayer(null)}
                onCreated={() => setActiveLayer(null)}
              />
            ) : (
              <button
                type="button"
                className="w-full rounded-md border px-2 py-1.5 text-left text-xs font-medium transition-colors"
                onClick={() => setActiveLayer(opt.layer)}
                style={{
                  borderColor: palette.ink,
                  backgroundColor: palette.cream,
                  color: palette.ink,
                }}
              >
                {opt.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * HireForm — inline name input + Create button. POSTs an agents.create body
 * mirroring scripts/seed-zootropolis-demo.ts so the new agent shows up in the
 * campus immediately (the agents.list query is invalidated on success).
 */
export function HireForm({
  companyId,
  parentAgentId,
  layer,
  onCancel,
  onCreated,
  submitLabel = "Create",
}: {
  companyId: string;
  parentAgentId: string | null;
  layer: ZootropolisLayer;
  onCancel?: () => void;
  onCreated?: () => void;
  submitLabel?: string;
}) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const adapterType = layer === "agent" ? "aliaskit_vm" : "claude_local";
      const role = layer === "agent" ? "engineer" : "general";
      const body: Record<string, unknown> = {
        name: trimmed,
        role,
        title: null,
        reportsTo: parentAgentId,
        adapterType,
        adapterConfig: {},
        runtimeConfig: {},
        budgetMonthlyCents: 5000,
        metadata: {
          zootropolis: {
            layer,
            displayName: trimmed,
          },
        },
      };
      await agentsApi.create(companyId, body);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.agents.list(companyId),
      });
      setName("");
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-1.5 rounded-md border p-2"
      style={{ borderColor: palette.ink, backgroundColor: palette.cream }}
    >
      <input
        type="text"
        autoFocus
        placeholder={`${layer} name`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={submitting}
        className="w-full rounded border px-2 py-1 text-xs outline-none"
        style={{
          borderColor: `${palette.ink}55`,
          backgroundColor: palette.bone,
          color: palette.ink,
        }}
      />
      {error && (
        <div className="text-[10px]" style={{ color: palette.clay }}>
          {error}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <button
          type="submit"
          disabled={submitting || name.trim().length === 0}
          className="rounded border px-2 py-1 text-xs font-medium disabled:opacity-50"
          style={{
            borderColor: palette.ink,
            backgroundColor: palette.accent,
            color: palette.ink,
          }}
        >
          {submitting ? "Creating…" : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded border px-2 py-1 text-xs"
            style={{
              borderColor: `${palette.ink}55`,
              backgroundColor: palette.bone,
              color: palette.ink,
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
