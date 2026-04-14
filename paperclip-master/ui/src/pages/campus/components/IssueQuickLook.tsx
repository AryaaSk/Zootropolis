import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Agent, Issue, IssueComment } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { agentsApi } from "../../../api/agents";
import { issuesApi } from "../../../api/issues";
import { queryKeys } from "../../../lib/queryKeys";
import { createIssueDetailPath } from "../../../lib/issueDetailBreadcrumb";
import { palette } from "../palette";

interface IssueQuickLookProps {
  id: string;
  companyId: string;
  onBack: () => void;
}

/**
 * IssueQuickLook — slim read-only view of a single issue, rendered as the
 * drawer body when the user clicks an IssueRow in ContainerInspector.
 *
 * Shows: title, status/priority badges, assignee name, parent-lineage chain
 * (if any), and latest ≤3 comments truncated to ~200 chars each. A back
 * arrow restores the layer-overview drawer; an "Open in full →" link drops
 * the user into the full IssueDetail page.
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
      <div
        className="flex items-center gap-2 border-b px-3 py-2"
        style={{ borderColor: `${palette.ink}33` }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to container overview"
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
          style={{ color: palette.ink, backgroundColor: `${palette.ink}10` }}
        >
          <ArrowLeft size={12} />
          Back
        </button>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: palette.deepBlue }}
        >
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
  // Lineage is derived from issue.ancestors if the server supplied it;
  // otherwise we just show the immediate parent id so the chain is visible.
  type LineageEntry = { id: string; title: string | null; identifier: string | null };
  const lineage: LineageEntry[] = issue.ancestors && issue.ancestors.length > 0
    ? issue.ancestors.map((a) => ({ id: a.id, title: a.title, identifier: a.identifier }))
    : issue.parentId
      ? [{ id: issue.parentId, title: null, identifier: null }]
      : [];

  const identifier = issue.identifier ?? issue.id.slice(0, 8);

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-wide"
          style={{ color: `${palette.ink}88` }}
        >
          {identifier}
        </div>
        <div className="mt-0.5 text-sm font-semibold leading-snug"
          style={{ color: palette.ink }}
        >
          {issue.title}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge label={issue.status} tone="status" />
        <Badge label={issue.priority} tone="priority" />
        <span className="text-[11px]" style={{ color: `${palette.ink}99` }}>
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
                <li key={ancestor.id}
                  className="font-mono text-[10px]"
                  style={{ color: `${palette.ink}aa` }}
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
          <div className="text-[11px] italic" style={{ color: `${palette.ink}88` }}>
            loading…
          </div>
        ) : comments.length === 0 ? (
          <div className="text-[11px] italic" style={{ color: `${palette.ink}88` }}>
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
                  className="rounded border p-1.5 text-[11px]"
                  style={{
                    borderColor: `${palette.ink}22`,
                    backgroundColor: `${palette.bone}aa`,
                    color: palette.ink,
                  }}
                >
                  <div className="mb-0.5 font-mono text-[9px] uppercase tracking-wide"
                    style={{ color: `${palette.ink}77` }}
                  >
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
        className="inline-flex items-center gap-1 self-start rounded border px-2 py-1 text-[11px] font-medium no-underline"
        style={{
          borderColor: palette.ink,
          backgroundColor: palette.cream,
          color: palette.ink,
        }}
      >
        Open in full
        <ExternalLink size={11} />
      </Link>
    </div>
  );
}

function Badge({ label, tone }: { label: string; tone: "status" | "priority" }) {
  return (
    <span
      className="rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide"
      style={{
        backgroundColor: tone === "status" ? `${palette.deepBlue}22` : `${palette.terracotta}22`,
        color: tone === "status" ? palette.deepBlue : palette.terracotta,
      }}
    >
      {label}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="pb-1 text-[10px] font-semibold uppercase tracking-wide"
      style={{ color: palette.deepBlue }}
    >
      {children}
    </div>
  );
}

function LoadingBody() {
  return (
    <div
      className="flex items-center gap-2 px-3 py-3 text-xs"
      style={{ color: `${palette.ink}99` }}
    >
      <span
        aria-hidden
        className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-t-transparent"
        style={{
          borderColor: `${palette.deepBlue} transparent ${palette.deepBlue} ${palette.deepBlue}`,
        }}
      />
      loading issue…
    </div>
  );
}

function ErrorBody({ message }: { message: string }) {
  return (
    <div className="px-3 py-3 text-xs" style={{ color: palette.clay }}>
      {message}
    </div>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
