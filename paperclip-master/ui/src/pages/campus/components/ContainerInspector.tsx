import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  readZootropolisLayer,
  ZOOTROPOLIS_LAYERS,
  type Agent,
  type Issue,
  type ZootropolisAgentMetadata,
  type ZootropolisLayer,
} from "@paperclipai/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "@/lib/router";
import { agentsApi } from "../../../api/agents";
import { useDialog } from "../../../context/DialogContext";
import { queryKeys } from "../../../lib/queryKeys";
import { IssueRow } from "../../../components/IssueRow";
import { useContainerChildren } from "../hooks/useContainerChildren";
import { useContainerIssues } from "../hooks/useContainerIssues";
import { useContainerLiveStatus } from "../hooks/useContainerLiveStatus";
import { IssueQuickLook } from "./IssueQuickLook";
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

/**
 * Return the layer one step *above* the given layer — used by F3 "Wrap me in".
 * campus has no next-up (it's already the root concept).
 */
function nextLayerUp(layer: ZootropolisLayer): ZootropolisLayer | null {
  const idx = ZOOTROPOLIS_LAYERS.indexOf(layer);
  if (idx < 0 || idx >= ZOOTROPOLIS_LAYERS.length - 1) return null;
  return ZOOTROPOLIS_LAYERS[idx + 1] ?? null;
}

/** Route segment for a given container layer (matches AppRoutes). */
function routeForLayer(layer: ZootropolisLayer): string | null {
  switch (layer) {
    case "room":
      return "room";
    case "floor":
      return "floor";
    case "building":
      return "building";
    case "campus":
      // Campus-layer roots live directly under /campus/<companyId>; the user
      // doesn't navigate into them as a container — they ARE the canvas.
      return null;
    case "agent":
      return "agent";
    default:
      return null;
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
 * Phase E3: "+ Delegate to <child>" buttons per direct child (container
 * layers), plus "+ New task for this <layer>" for top-level work that
 * targets the container itself. Leaf agents only see "+ Receive new task".
 *
 * Phase E4: Clicking an IssueRow swaps the drawer body out for an embedded
 * IssueQuickLook; a back arrow restores the layer overview.
 *
 * Phase F2: Footer with layer-aware "+ Hire <next layer down>" buttons that
 * expand into an inline name form and POST to /api/companies/:id/agents.
 *
 * Phase F3: "+ Wrap me in a <next-up>" button — create a new container
 * agent that takes this agent's old parent, then re-parent this agent to
 * the new container.
 */
export function ContainerInspector({
  companyId,
  agentId,
  hideHireFooter = false,
  defaultOpen = true,
}: ContainerInspectorProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const { self, children } = useContainerChildren(companyId, agentId);
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

  // The "received task" whose lineage new delegations should extend (E3).
  // Picks the most recently updated received task; useContainerIssues already
  // orders desc.
  const currentReceivedTask = receivedFromAbove[0] ?? null;

  // F3: wrap-in is available for every non-root layer that can be
  // promoted upward. campus-root has no "above".
  const wrapInLayer =
    selfLayer === "campus-root" ? null : nextLayerUp(selfLayer);

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
        {selectedIssueId ? (
          /* E4: embedded issue read view. Replaces the drawer body. */
          <IssueQuickLook
            id={selectedIssueId}
            companyId={companyId}
            onBack={() => setSelectedIssueId(null)}
          />
        ) : (
          <>
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
                <LeafAgentBody
                  metadata={
                    self?.metadata as ZootropolisAgentMetadata | null | undefined
                  }
                  receivedFromAbove={receivedFromAbove}
                  loading={loading}
                  agentId={agentId}
                  onSelectIssue={setSelectedIssueId}
                />
              ) : (
                <>
                  {showTasksDelegated && (
                    <Section title="Tasks delegated">
                      {loading ? (
                        <SpinnerRow />
                      ) : issuedDown.length === 0 ? (
                        <EmptyRow>No tasks delegated yet</EmptyRow>
                      ) : (
                        <IssueList
                          issues={issuedDown}
                          onSelect={setSelectedIssueId}
                        />
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
                        <IssueList
                          issues={receivedFromAbove}
                          onSelect={setSelectedIssueId}
                        />
                      )}
                    </Section>
                  )}

                  {/* E3: per-child delegate + self-assign. */}
                  <DelegateSection
                    agentId={agentId}
                    selfLayer={selfLayer}
                    childAgents={children}
                    currentReceivedTask={currentReceivedTask}
                  />
                </>
              )}
            </div>

            {/* Footer — Hire + Wrap-in controls. */}
            {(hireOptions.length > 0 || wrapInLayer) && (
              <FooterActions
                companyId={companyId}
                parentAgentId={agentId}
                self={self}
                selfLayer={selfLayer}
                hireOptions={hireOptions}
                wrapInLayer={wrapInLayer}
              />
            )}
          </>
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

function IssueList({
  issues,
  onSelect,
}: {
  issues: Issue[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="px-1 pb-2">
      {issues.map((issue) => (
        <div
          key={issue.id}
          /* E4: intercept IssueRow's <Link> so the click swaps the drawer
             body to IssueQuickLook instead of navigating away. */
          onClickCapture={(e) => {
            // Don't hijack modifier-clicks (open-in-new-tab etc).
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            e.stopPropagation();
            onSelect(issue.id);
          }}
        >
          <IssueRow issue={issue} />
        </div>
      ))}
    </div>
  );
}

function LeafAgentBody({
  metadata,
  receivedFromAbove,
  loading,
  agentId,
  onSelectIssue,
}: {
  metadata: ZootropolisAgentMetadata | null | undefined;
  receivedFromAbove: Issue[];
  loading: boolean;
  agentId: string | null;
  onSelectIssue: (id: string) => void;
}) {
  const { openNewIssue } = useDialog();
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
      <Section title="Tasks I owe">
        {loading ? (
          <SpinnerRow />
        ) : receivedFromAbove.length === 0 ? (
          <EmptyRow>No tasks owed upward</EmptyRow>
        ) : (
          <IssueList issues={receivedFromAbove} onSelect={onSelectIssue} />
        )}
      </Section>
      <Section title="New task">
        <div className="px-3 pb-3">
          {/* E3: strict delegation guard — leaves have no children, so there
              are no "+ Delegate" buttons. A human/admin may inject a task
              directly to this leaf via "+ Receive new task". */}
          <button
            type="button"
            disabled={!agentId}
            className="w-full rounded-md border px-2 py-1.5 text-left text-xs font-medium disabled:opacity-50"
            onClick={() => {
              if (!agentId) return;
              openNewIssue({ assigneeAgentId: agentId });
            }}
            style={{
              borderColor: palette.ink,
              backgroundColor: palette.cream,
              color: palette.ink,
            }}
          >
            + Receive new task
          </button>
        </div>
      </Section>
      <Section title="Live transcript">
        <EmptyRow>transcript wires in Phase E5</EmptyRow>
      </Section>
    </>
  );
}

// ── E3: delegation controls ────────────────────────────────────────────────

function DelegateSection({
  agentId,
  selfLayer,
  childAgents,
  currentReceivedTask,
}: {
  agentId: string | null;
  selfLayer: ZootropolisLayer | "campus-root";
  childAgents: Agent[];
  currentReceivedTask: Issue | null;
}) {
  const { openNewIssue } = useDialog();

  // A top-level work item targeted at this container makes sense whenever
  // there's a real container agent to receive it. Campus-root has no agent
  // id to assign to, so we skip the self-assign button there.
  const canSelfAssign = agentId !== null;

  return (
    <Section title="Delegate">
      <div className="flex flex-col gap-1.5 px-3 pb-3">
        {childAgents.length === 0 ? (
          <div className="text-[11px] italic" style={{ color: `${palette.ink}88` }}>
            No direct children yet — delegation requires a report.
          </div>
        ) : (
          childAgents.map((child) => (
            <button
              key={child.id}
              type="button"
              className="w-full rounded-md border px-2 py-1.5 text-left text-xs font-medium"
              onClick={() =>
                openNewIssue({
                  assigneeAgentId: child.id,
                  parentId: currentReceivedTask?.id,
                })
              }
              style={{
                borderColor: palette.ink,
                backgroundColor: palette.cream,
                color: palette.ink,
              }}
              title={
                currentReceivedTask
                  ? `Lineage: parent = ${
                      currentReceivedTask.identifier ??
                      currentReceivedTask.id.slice(0, 8)
                    }`
                  : undefined
              }
            >
              + Delegate to {child.name}
            </button>
          ))
        )}
        {canSelfAssign && (
          <button
            type="button"
            className="w-full rounded-md border px-2 py-1.5 text-left text-xs"
            onClick={() =>
              openNewIssue({
                assigneeAgentId: agentId ?? undefined,
              })
            }
            style={{
              borderColor: `${palette.ink}55`,
              backgroundColor: palette.bone,
              color: palette.ink,
            }}
          >
            + New task for this {selfLayer === "campus-root" ? "campus" : selfLayer}
          </button>
        )}
      </div>
    </Section>
  );
}

// ── Footer: hire + wrap-in ─────────────────────────────────────────────────

function FooterActions({
  companyId,
  parentAgentId,
  self,
  selfLayer,
  hireOptions,
  wrapInLayer,
}: {
  companyId: string;
  parentAgentId: string | null;
  self: Agent | null;
  selfLayer: ZootropolisLayer | "campus-root";
  hireOptions: HireSpec[];
  wrapInLayer: ZootropolisLayer | null;
}) {
  const [activeLayer, setActiveLayer] = useState<ZootropolisLayer | null>(null);
  return (
    <div
      className="border-t px-3 py-2.5"
      style={{ borderColor: `${palette.ink}33` }}
    >
      {hireOptions.length > 0 && (
        <>
          <div
            className="pb-1.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: palette.deepBlue }}
          >
            Hire
          </div>
          <div className="flex flex-col gap-1.5">
            {hireOptions.map((opt) => (
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
        </>
      )}

      {wrapInLayer && self && selfLayer !== "campus-root" && (
        <div className={hireOptions.length > 0 ? "mt-3" : ""}>
          <div
            className="pb-1.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: palette.deepBlue }}
          >
            Promote
          </div>
          <WrapInButton
            companyId={companyId}
            self={self}
            wrapInLayer={wrapInLayer}
          />
        </div>
      )}
    </div>
  );
}

// ── F3: wrap-in promote ────────────────────────────────────────────────────

function WrapInButton({
  companyId,
  self,
  wrapInLayer,
}: {
  companyId: string;
  self: Agent;
  wrapInLayer: ZootropolisLayer;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);

    // Step 1: POST the new container, taking self's old parent.
    const adapterType = wrapInLayer === "agent" ? "aliaskit_vm" : "claude_local";
    const role = wrapInLayer === "agent" ? "engineer" : "general";
    const body: Record<string, unknown> = {
      name: trimmed,
      role,
      title: null,
      reportsTo: self.reportsTo,
      adapterType,
      adapterConfig: {},
      runtimeConfig: {},
      budgetMonthlyCents: 5000,
      metadata: {
        zootropolis: {
          layer: wrapInLayer,
          displayName: trimmed,
        },
      },
    };

    try {
      const created = await agentsApi.create(companyId, body);

      // Step 2: PATCH self to reparent under the new container. Best-effort
      // rollback if this fails — log and surface the error, but we can't
      // un-create the new container without a delete endpoint in the mix,
      // so a successful POST + failed PATCH leaves an orphan parent the
      // user can either delete manually or re-use by adopting children.
      try {
        await agentsApi.update(
          self.id,
          { reportsTo: created.id },
          companyId,
        );
      } catch (patchErr) {
        console.error(
          "[ContainerInspector] wrap-in: PATCH reportsTo failed; new container left in place",
          patchErr,
        );
        throw patchErr;
      }

      await queryClient.invalidateQueries({
        queryKey: queryKeys.agents.list(companyId),
      });

      // Navigate into the new container. For campus-layer wraps, the campus
      // root is the canvas itself (no /campus/<id> route), so we land on
      // the campus view which will now include the freshly wrapped
      // building. For every other layer we route into the new container.
      const route = routeForLayer(wrapInLayer);
      if (route) {
        navigate(`/campus/${companyId}/${route}/${created.id}`);
      } else {
        navigate(`/campus/${companyId}`);
      }
      setOpen(false);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-md border px-2 py-1.5 text-left text-xs font-medium"
        style={{
          borderColor: palette.ink,
          backgroundColor: palette.cream,
          color: palette.ink,
        }}
      >
        + Wrap me in a {wrapInLayer === "campus" ? "campus root" : wrapInLayer}
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-1.5 rounded-md border p-2"
      style={{ borderColor: palette.ink, backgroundColor: palette.cream }}
    >
      <input
        type="text"
        autoFocus
        placeholder={`${wrapInLayer} name`}
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
          {submitting ? "Wrapping…" : "Wrap"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setName("");
            setError(null);
          }}
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
      </div>
    </form>
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
