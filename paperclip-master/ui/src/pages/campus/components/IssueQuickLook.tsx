import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";
import type { Agent, Issue, IssueComment } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { agentsApi } from "../../../api/agents";
import { issuesApi } from "../../../api/issues";
import { queryKeys } from "../../../lib/queryKeys";
import { createIssueDetailPath } from "../../../lib/issueDetailBreadcrumb";

interface IssueQuickLookProps {
  id: string;
  companyId: string;
  onBack: () => void;
}

/**
 * IssueQuickLook — slim read-only view of a single issue, rendered as the
 * drawer body when the user clicks an IssueRow in ContainerInspector.
 *
 * Phase U: restyled to match Paperclip's dark surface tokens. Comments use
 * bg-muted/40 cards instead of cream, status/priority use real shadcn Badge.
 */
export function IssueQuickLook({ id, companyId, onBack }: IssueQuickLookProps) {
  const issueQuery = useQuery({
    queryKey: queryKeys.issues.detail(id),
    queryFn: () => issuesApi.get(id),
  });
  const commentsQuery = useQuery({
    queryKey: queryKeys.issues.comments(id),
    queryFn: () => issuesApi.listComments(id, { order: "desc", limit: 3 }),
  });
  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const agentsById = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agentsQuery.data ?? []) map.set(a.id, a);
    return map;
  }, [agentsQuery.data]);

  return (
    <div className="flex h-full flex-col">
      {/* Back bar */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onBack}
          aria-label="Back to container overview"
        >
          <ArrowLeft size={12} />
          Back
        </Button>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Issue
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {issueQuery.isLoading ? (
          <LoadingBody />
        ) : issueQuery.isError || !issueQuery.data ? (
          <ErrorBody
            message={
              issueQuery.error instanceof Error
                ? issueQuery.error.message
                : "Could not load issue."
            }
          />
        ) : (
          <IssueBody
            issue={issueQuery.data}
            comments={commentsQuery.data ?? []}
            commentsLoading={commentsQuery.isLoading}
            agentsById={agentsById}
          />
        )}
      </div>
    </div>
  );
}

function IssueBody({
  issue,
  comments,
  commentsLoading,
  agentsById,
}: {
  issue: Issue;
  comments: IssueComment[];
  commentsLoading: boolean;
  agentsById: Map<string, Agent>;
}) {
  const assigneeName = issue.assigneeAgentId
    ? agentsById.get(issue.assigneeAgentId)?.name ?? issue.assigneeAgentId.slice(0, 8)
    : issue.assigneeUserId
      ? "user"
      : "unassigned";
  type LineageEntry = { id: string; title: string | null; identifier: string | null };
  const lineage: LineageEntry[] = issue.ancestors && issue.ancestors.length > 0
    ? issue.ancestors.map((a) => ({ id: a.id, title: a.title, identifier: a.identifier }))
    : issue.parentId
      ? [{ id: issue.parentId, title: null, identifier: null }]
      : [];

  const identifier = issue.identifier ?? issue.id.slice(0, 8);

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {identifier}
        </div>
        <div className="mt-1 text-sm font-semibold leading-snug text-foreground">
          {issue.title}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="font-mono text-[9px] uppercase tracking-wide">
          {issue.status}
        </Badge>
        <Badge variant="outline" className="font-mono text-[9px] uppercase tracking-wide">
          {issue.priority}
        </Badge>
        <span className="text-[11px] text-muted-foreground">
          → {assigneeName}
        </span>
      </div>

      {lineage.length > 0 && (
        <section>
          <SectionLabel>Lineage</SectionLabel>
          <ol className="flex flex-col gap-0.5 pl-0">
            {lineage.map((ancestor, idx) => {
              const ancestorLabel =
                ancestor.title || ancestor.identifier || ancestor.id.slice(0, 8);
              return (
                <li
                  key={ancestor.id}
                  className="font-mono text-[10px] text-muted-foreground"
                >
                  {"·".repeat(idx)}↳ {ancestorLabel}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section>
        <SectionLabel>Latest comments</SectionLabel>
        {commentsLoading ? (
          <div className="text-[11px] italic text-muted-foreground">loading…</div>
        ) : comments.length === 0 ? (
          <div className="text-[11px] italic text-muted-foreground">
            No comments yet.
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {comments.slice(0, 3).map((c) => {
              const author = c.authorAgentId
                ? agentsById.get(c.authorAgentId)?.name ?? c.authorAgentId.slice(0, 8)
                : c.authorUserId
                  ? "user"
                  : "system";
              return (
                <li
                  key={c.id}
                  className="rounded-md border border-border bg-muted/40 p-2 text-[11px] text-foreground"
                >
                  <div className="mb-1 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                    {author}
                  </div>
                  <div className="whitespace-pre-wrap leading-snug">
                    {truncate(c.body, 200)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Link
        to={createIssueDetailPath(issue.identifier ?? issue.id)}
        disableIssueQuicklook
        className="self-start no-underline"
      >
        <Button type="button" variant="outline" size="xs">
          Open in full
          <ExternalLink size={11} />
        </Button>
      </Link>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

function LoadingBody() {
  return (
    <div className="flex items-center gap-2 px-4 py-4 text-xs text-muted-foreground">
      <Loader2 size={12} className="animate-spin" />
      loading issue…
    </div>
  );
}

function ErrorBody({ message }: { message: string }) {
  return (
    <div className="px-4 py-4 text-xs text-destructive">{message}</div>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
