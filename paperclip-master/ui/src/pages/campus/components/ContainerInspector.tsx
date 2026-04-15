import { useMemo, useState } from "react";
import { INSPECTOR_OPEN_WIDTH, useInspectorOpen } from "../lib/useInspectorOpen";
import { useQueryClient } from "@tanstack/react-query";
import {
  readZootropolisLayer,
  readZootropolisPos,
  ZOOTROPOLIS_LAYERS,
  type Agent,
  type Issue,
  type ZootropolisAgentMetadata,
  type ZootropolisLayer,
} from "@paperclipai/shared";
import { ChevronLeft, ChevronRight, Plus, Loader2 } from "lucide-react";
import { useNavigate } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { agentsApi } from "../../../api/agents";
import { useDialog } from "../../../context/DialogContext";
import { queryKeys } from "../../../lib/queryKeys";
import { IssueRow } from "../../../components/IssueRow";
import { useContainerChildren } from "../hooks/useContainerChildren";
import { useContainerIssues } from "../hooks/useContainerIssues";
import { useContainerLiveStatus } from "../hooks/useContainerLiveStatus";
import { IssueQuickLook } from "./IssueQuickLook";
import { AddToExistingButton } from "./AddToExistingDialog";
import { layerPillClass } from "../lib/layer-pill";

type HireSpec = {
  label: string;
  layer: ZootropolisLayer;
};

function hireOptionsFor(
  currentLayer: ZootropolisLayer | "campus-root",
): HireSpec[] {
  if (currentLayer === "campus-root") {
    return [{ label: "Hire an agent", layer: "agent" }];
  }
  return [];
}

/**
 * Next layer you can wrap an agent INTO. Caps at `building` — `campus`
 * is implicit (one per company, auto-created) and never a user-choose
 * wrap target.
 */
function nextLayerUp(layer: ZootropolisLayer): ZootropolisLayer | null {
  if (layer === "agent") return "room";
  if (layer === "room") return "floor";
  if (layer === "floor") return "building";
  return null; // building → nothing to wrap into; campus → already at top
}

function routeForLayer(layer: ZootropolisLayer): string | null {
  switch (layer) {
    case "room":
      return "room";
    case "floor":
      return "floor";
    case "building":
      return "building";
    case "campus":
      return null;
    case "agent":
      return "agent";
    default:
      return null;
  }
}

interface ContainerInspectorProps {
  companyId: string;
  agentId: string | null;
  hideHireFooter?: boolean;
  defaultOpen?: boolean;
}

/**
 * ContainerInspector — right-edge slide-in drawer for every campus view.
 * Mirrors the Minimap's anchor pattern: an HTML overlay mounted as a sibling
 * of the R3F <Canvas> (the parent div is already position: relative per B8).
 *
 * Phase U: restyled to use Paperclip semantic tokens (bg-card, border-border,
 * text-foreground/text-muted-foreground) and shadcn primitives (Button,
 * Input) instead of the Townscaper cream palette + inline styles. Keeps the
 * 3D scene's warm aesthetic intact while the chrome reads like the rest of
 * Paperclip.
 */
export function ContainerInspector({
  companyId,
  agentId,
  hideHireFooter = false,
  defaultOpen = false,
}: ContainerInspectorProps) {
  // Phase T polish — sidebar state lifted to a shared hook so each
  // view's outer layout can resize the canvas around it (instead of
  // overlaying). Persisted to localStorage; survives navigation +
  // reload and stays in sync across components.
  const [open, setOpen] = useInspectorOpen(defaultOpen);
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

  const hireOptions = hideHireFooter ? [] : hireOptionsFor(selfLayer);
  const showTasksDelegated = selfLayer !== "agent";
  const showTasksOwed = selfLayer !== "campus-root" && selfLayer !== "campus";
  const isLeaf = selfLayer === "agent";

  const currentReceivedTask = receivedFromAbove[0] ?? null;

  const wrapInLayer =
    selfLayer === "campus-root" ? null : nextLayerUp(selfLayer);

  return (
    <>
      {/* Toggle chevron — sits on the inspector's left edge as a real
          layout-affecting element when the inspector is open, or floats
          on the right edge as a tab when it's closed. The wrapper view
          uses INSPECTOR_OPEN_WIDTH to size the canvas around it. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Hide inspector" : "Show inspector"}
        className="pointer-events-auto absolute top-1/2 z-20 -translate-y-1/2 rounded-l-md border border-r-0 border-border bg-card/95 p-1.5 text-foreground shadow-sm backdrop-blur-md hover:bg-accent hover:text-accent-foreground"
        style={{ right: 0, transform: "translate(0, -50%)" }}
      >
        {open ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      <aside
        aria-label="Container inspector"
        className={cn(
          "pointer-events-auto flex h-full flex-col overflow-hidden border-l border-border bg-card/95 text-foreground shadow-lg backdrop-blur-md transition-[width]",
        )}
        style={{ width: open ? INSPECTOR_OPEN_WIDTH : 0 }}
      >
        {selectedIssueId ? (
          <IssueQuickLook
            id={selectedIssueId}
            companyId={companyId}
            onBack={() => setSelectedIssueId(null)}
          />
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <span
                aria-hidden
                title={`Live status: ${liveStatus}`}
                className={cn(
                  "inline-block h-2 w-2 shrink-0 rounded-full",
                  liveStatus === "running"
                    ? "bg-emerald-400 shadow-[0_0_6px_theme(colors.emerald.400)] animate-pulse"
                    : "bg-muted-foreground/40",
                )}
              />
              <span className="truncate text-sm font-semibold">{displayName}</span>
              <span
                className={cn(
                  "ml-auto shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide",
                  layerPillClass(selfLayer),
                )}
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

                  <DelegateSection
                    agentId={agentId}
                    selfLayer={selfLayer}
                    childAgents={children}
                    currentReceivedTask={currentReceivedTask}
                  />
                </>
              )}
            </div>

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
    <div className="border-b border-border/60">
      <div className="px-4 pb-1.5 pt-3.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pb-3 text-xs italic text-muted-foreground">
      {children}
    </div>
  );
}

function SpinnerRow() {
  return (
    <div className="flex items-center gap-2 px-4 pb-3 text-xs text-muted-foreground">
      <Loader2 size={12} className="animate-spin" />
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
    <div className="px-2 pb-2">
      {issues.map((issue) => (
        <div
          key={issue.id}
          onClickCapture={(e) => {
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
  // Phase Z — identity is worker-managed on the VM, no longer visible
  // to the server. Only the runtime endpoint is shown here.

  return (
    <>
      <Section title="Runtime">
        {runtime ? (
          <div className="space-y-0.5 px-4 pb-3 font-mono text-[11px] text-foreground/90">
            <div>endpoint: {runtime.endpoint}</div>
            <div>port: {runtime.port}</div>
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
        <div className="px-4 pb-3">
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={!agentId}
            className="w-full justify-start"
            onClick={() => {
              if (!agentId) return;
              openNewIssue({ assigneeAgentId: agentId });
            }}
          >
            <Plus size={12} />
            Receive new task
          </Button>
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
  const canSelfAssign = agentId !== null;

  return (
    <Section title="Delegate">
      <div className="flex flex-col gap-1.5 px-4 pb-3">
        {childAgents.length === 0 ? (
          <div className="text-[11px] italic text-muted-foreground">
            No direct children yet — delegation requires a report.
          </div>
        ) : (
          childAgents.map((child) => (
            <Button
              key={child.id}
              type="button"
              variant="outline"
              size="xs"
              className="w-full justify-start"
              onClick={() =>
                openNewIssue({
                  assigneeAgentId: child.id,
                  parentId: currentReceivedTask?.id,
                })
              }
              title={
                currentReceivedTask
                  ? `Lineage: parent = ${
                      currentReceivedTask.identifier ??
                      currentReceivedTask.id.slice(0, 8)
                    }`
                  : undefined
              }
            >
              <Plus size={12} />
              Delegate to {child.name}
            </Button>
          ))
        )}
        {canSelfAssign && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="w-full justify-start"
            onClick={() =>
              openNewIssue({
                assigneeAgentId: agentId ?? undefined,
              })
            }
          >
            <Plus size={12} />
            New task for this {selfLayer === "campus-root" ? "campus" : selfLayer}
          </Button>
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
    <div className="border-t border-border px-4 py-3">
      {hireOptions.length > 0 && (
        <>
          <div className="pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="w-full justify-start"
                    onClick={() => setActiveLayer(opt.layer)}
                  >
                    <Plus size={12} />
                    {opt.label}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {wrapInLayer && self && selfLayer !== "campus-root" && (
        <div className={hireOptions.length > 0 ? "mt-3" : ""}>
          <div className="pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Promote
          </div>
          <div className="flex flex-col gap-1.5">
            <WrapInButton
              companyId={companyId}
              self={self}
              wrapInLayer={wrapInLayer}
            />
            <AddToExistingButton
              companyId={companyId}
              self={self}
              parentLayer={wrapInLayer}
            />
          </div>
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

    const adapterType = wrapInLayer === "agent" ? "aliaskit_vm" : "claude_local";
    const role = wrapInLayer === "agent" ? "engineer" : "general";

    // Phase T polish: the wrapped agent's stored position belongs to
    // the OLD hierarchy level (campus hex / floor row / etc). The new
    // container is taking that same logical slot, so inherit the pos
    // and drop it from the wrapped agent's metadata — otherwise the
    // new container falls back to spiral order and collides with a
    // sibling, while the wrapped agent retains a meaningless hex pos
    // it no longer applies to.
    const wrappedPos = readZootropolisPos(self.metadata);
    const inheritablePos =
      wrappedPos &&
      ((wrapInLayer === "room" || wrapInLayer === "floor" || wrapInLayer === "building") &&
        (wrappedPos.kind === "hex" ||
          wrappedPos.kind === "rowSlot" ||
          wrappedPos.kind === "floorRank"))
        ? wrappedPos
        : null;

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
          ...(inheritablePos ? { pos: inheritablePos } : {}),
        },
      },
    };

    try {
      const created = await agentsApi.create(companyId, body);
      // Compose the wrapped-agent patch: re-parent + strip the now-
      // meaningless `pos` so it gets a fresh default in its new
      // container's coordinate system.
      const wrappedExistingMeta =
        (self.metadata as Record<string, unknown> | null) ?? {};
      const wrappedExistingZ =
        (wrappedExistingMeta.zootropolis as Record<string, unknown> | undefined) ?? {};
      const { pos: _strippedPos, ...restZ } = wrappedExistingZ;
      const wrappedPatch: Record<string, unknown> = {
        reportsTo: created.id,
        metadata: { ...wrappedExistingMeta, zootropolis: restZ },
      };
      try {
        await agentsApi.update(self.id, wrappedPatch, companyId);
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
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="w-full justify-start"
        onClick={() => setOpen(true)}
      >
        <Plus size={12} />
        Wrap me in a {wrapInLayer === "campus" ? "campus root" : wrapInLayer}
      </Button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-1.5 rounded-md border border-border bg-popover p-2"
    >
      <Input
        type="text"
        autoFocus
        placeholder={`${wrapInLayer} name`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={submitting}
        className="h-7 text-xs"
      />
      {error && (
        <div className="text-[10px] text-destructive">{error}</div>
      )}
      <div className="flex items-center gap-1.5">
        <Button
          type="submit"
          variant="default"
          size="xs"
          disabled={submitting || name.trim().length === 0}
        >
          {submitting ? (
            <>
              <Loader2 size={10} className="animate-spin" />
              Wrapping…
            </>
          ) : (
            "Wrap"
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => {
            setOpen(false);
            setName("");
            setError(null);
          }}
          disabled={submitting}
        >
          Cancel
        </Button>
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
  initialPos,
}: {
  companyId: string;
  parentAgentId: string | null;
  layer: ZootropolisLayer;
  onCancel?: () => void;
  onCreated?: () => void;
  submitLabel?: string;
  /**
   * Phase T3 — optional pre-filled spatial position. Bakes into the
   * new agent's `metadata.zootropolis.pos` so click-to-hire on an
   * empty hex slot lands the agent on exactly that hex.
   */
  initialPos?: import("@paperclipai/shared").ZootropolisPos;
}) {
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const needsEndpoint = layer === "agent";
  const endpointTrim = endpoint.trim();
  const endpointValid =
    !needsEndpoint ||
    endpointTrim.startsWith("ws://") ||
    endpointTrim.startsWith("wss://");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    if (needsEndpoint && !endpointValid) {
      setError(
        "Runtime endpoint must start with ws:// or wss://. See docs/external-daemon-quickstart.md.",
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const adapterType = layer === "agent" ? "aliaskit_vm" : "claude_local";
      const role = layer === "agent" ? "engineer" : "general";
      const adapterConfig: Record<string, unknown> = {};
      if (needsEndpoint) {
        adapterConfig.externalEndpoint = endpointTrim;
        adapterConfig.runtimeEndpoint = endpointTrim;
      }
      const body: Record<string, unknown> = {
        name: trimmed,
        role,
        title: null,
        reportsTo: parentAgentId,
        adapterType,
        adapterConfig,
        runtimeConfig: {},
        budgetMonthlyCents: 5000,
        metadata: {
          zootropolis: {
            layer,
            displayName: trimmed,
            ...(initialPos ? { pos: initialPos } : {}),
          },
        },
      };
      await agentsApi.create(companyId, body);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.agents.list(companyId),
      });
      setName("");
      setEndpoint("");
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
      className="flex flex-col gap-1.5 rounded-md border border-border bg-popover p-2"
    >
      <Input
        type="text"
        autoFocus
        placeholder={`${layer} name`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={submitting}
        className="h-7 text-xs"
      />
      {needsEndpoint && (
        <>
          <Input
            type="text"
            placeholder="ws://your-host:7100/"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            disabled={submitting}
            aria-invalid={endpointTrim.length > 0 && !endpointValid}
            className="h-7 font-mono text-xs"
          />
          <div className="text-[10px] italic text-muted-foreground">
            Agent daemon WebSocket URL. See <code>docs/external-daemon-quickstart.md</code>.
          </div>
        </>
      )}
      {error && (
        <div className="text-[10px] text-destructive">{error}</div>
      )}
      <div className="flex items-center gap-1.5">
        <Button
          type="submit"
          variant="default"
          size="xs"
          disabled={
            submitting ||
            name.trim().length === 0 ||
            (needsEndpoint && (endpointTrim.length === 0 || !endpointValid))
          }
        >
          {submitting ? (
            <>
              <Loader2 size={10} className="animate-spin" />
              Creating…
            </>
          ) : (
            submitLabel
          )}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
