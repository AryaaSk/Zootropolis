import { useState } from "react";
import { Pause, Loader2 } from "lucide-react";
import { useParams } from "@/lib/router";
import { useQueryClient } from "@tanstack/react-query";
import { agentsApi } from "@/api/agents";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "../../../context/ToastContext";

/**
 * Phase V — emergency "pause entire company" button. Fans
 * `agentsApi.pause()` across every non-terminated agent in the company
 * (container + leaves alike). Client-side bulk — a proper server
 * endpoint (POST /companies/:id/pause) would be cleaner at scale, but
 * the fan-out handles typical campus sizes fine and avoids a
 * server-release cycle.
 */
export function PauseCompanyButton() {
  const { companyId } = useParams<{ companyId: string }>();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  if (!companyId) return null;

  const pauseAll = async () => {
    if (busy) return;
    const confirmed = window.confirm(
      "Pause every non-terminated agent in this company?",
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const agents = await agentsApi.list(companyId);
      const targets = agents.filter(
        (a) =>
          a.status !== "terminated" &&
          a.status !== "paused" &&
          a.status !== "pending_approval",
      );
      let ok = 0;
      let fail = 0;
      await Promise.all(
        targets.map(async (a) => {
          try {
            await agentsApi.pause(a.id, companyId);
            ok += 1;
          } catch {
            fail += 1;
          }
        }),
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.agents.list(companyId),
      });
      pushToast({
        title:
          fail === 0
            ? `Paused ${ok} agent${ok === 1 ? "" : "s"}`
            : `Paused ${ok}, failed ${fail}`,
        body:
          targets.length === 0
            ? "Nothing to pause — every agent was already paused or terminated."
            : undefined,
        tone: fail === 0 ? "success" : "warn",
      });
    } catch (err) {
      pushToast({
        title: "Pause company failed",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pointer-events-none absolute right-4 top-64 z-10">
      <button
        type="button"
        onClick={pauseAll}
        disabled={busy}
        aria-label="Pause every agent in this company"
        title="Pause every agent in this company"
        className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-1.5 text-sm font-medium text-foreground shadow-sm backdrop-blur-md transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : (
          <Pause className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span>{busy ? "Pausing…" : "Pause company"}</span>
      </button>
    </div>
  );
}
