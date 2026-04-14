import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  activityLog,
  agents,
  companies,
  createDb,
  issueComments,
  issueInboxArchives,
  issueRelations,
  issues,
  projectWorkspaces,
  projects,
  executionWorkspaces,
  instanceSettings,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { issueService } from "../services/issues.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

async function ensureIssueRelationsTable(db: ReturnType<typeof createDb>) {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "issue_relations" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "company_id" uuid NOT NULL,
      "issue_id" uuid NOT NULL,
      "related_issue_id" uuid NOT NULL,
      "type" text NOT NULL,
      "created_by_agent_id" uuid,
      "created_by_user_id" text,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    );
  `));
}

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres Zootropolis filter tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("issueService.list createdByAgentId filter (Zootropolis E1)", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof issueService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-zootropolis-filters-");
    db = createDb(tempDb.connectionString);
    svc = issueService(db);
    await ensureIssueRelationsTable(db);
  }, 20_000);

  afterEach(async () => {
    await db.delete(issueComments);
    await db.delete(issueRelations);
    await db.delete(issueInboxArchives);
    await db.delete(activityLog);
    await db.delete(issues);
    await db.delete(executionWorkspaces);
    await db.delete(projectWorkspaces);
    await db.delete(projects);
    await db.delete(agents);
    await db.delete(instanceSettings);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("returns only issues created by the given agent", async () => {
    const companyId = randomUUID();
    const parentAgentId = randomUUID();
    const childAgentId = randomUUID();
    const otherAgentId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Zootropolis",
      issuePrefix: `Z${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(agents).values([
      {
        id: parentAgentId,
        companyId,
        name: "ParentRoom",
        role: "general",
        status: "active",
        adapterType: "claude_local",
        adapterConfig: {},
        runtimeConfig: {},
        permissions: {},
      },
      {
        id: childAgentId,
        companyId,
        name: "ChildAgent",
        role: "engineer",
        status: "active",
        adapterType: "claude_local",
        adapterConfig: {},
        runtimeConfig: {},
        permissions: {},
      },
      {
        id: otherAgentId,
        companyId,
        name: "OtherAgent",
        role: "engineer",
        status: "active",
        adapterType: "claude_local",
        adapterConfig: {},
        runtimeConfig: {},
        permissions: {},
      },
    ]);

    // Parent delegates two issues downward to the child.
    const delegatedA = randomUUID();
    const delegatedB = randomUUID();
    // Unrelated issue created by another agent — must be excluded.
    const otherCreated = randomUUID();
    // Issue ASSIGNED to parent (from above) — different creator; must be
    // excluded from createdByAgentId filter.
    const receivedFromAbove = randomUUID();

    await db.insert(issues).values([
      {
        id: delegatedA,
        companyId,
        title: "Delegated A",
        status: "todo",
        priority: "medium",
        createdByAgentId: parentAgentId,
        assigneeAgentId: childAgentId,
      },
      {
        id: delegatedB,
        companyId,
        title: "Delegated B",
        status: "todo",
        priority: "medium",
        createdByAgentId: parentAgentId,
        assigneeAgentId: childAgentId,
      },
      {
        id: otherCreated,
        companyId,
        title: "Other created",
        status: "todo",
        priority: "medium",
        createdByAgentId: otherAgentId,
        assigneeAgentId: otherAgentId,
      },
      {
        id: receivedFromAbove,
        companyId,
        title: "Received from above",
        status: "todo",
        priority: "medium",
        createdByAgentId: otherAgentId,
        assigneeAgentId: parentAgentId,
      },
    ]);

    const result = await svc.list(companyId, { createdByAgentId: parentAgentId });
    const ids = new Set(result.map((issue) => issue.id));

    expect(ids).toEqual(new Set([delegatedA, delegatedB]));
    expect(ids.has(otherCreated)).toBe(false);
    expect(ids.has(receivedFromAbove)).toBe(false);
  });

  it("composes createdByAgentId with assigneeAgentId via AND", async () => {
    const companyId = randomUUID();
    const parentAgentId = randomUUID();
    const childA = randomUUID();
    const childB = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Zootropolis",
      issuePrefix: `Z${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(agents).values([
      {
        id: parentAgentId,
        companyId,
        name: "ParentRoom",
        role: "general",
        status: "active",
        adapterType: "claude_local",
        adapterConfig: {},
        runtimeConfig: {},
        permissions: {},
      },
      {
        id: childA,
        companyId,
        name: "ChildA",
        role: "engineer",
        status: "active",
        adapterType: "claude_local",
        adapterConfig: {},
        runtimeConfig: {},
        permissions: {},
      },
      {
        id: childB,
        companyId,
        name: "ChildB",
        role: "engineer",
        status: "active",
        adapterType: "claude_local",
        adapterConfig: {},
        runtimeConfig: {},
        permissions: {},
      },
    ]);

    const toChildA = randomUUID();
    const toChildB = randomUUID();

    await db.insert(issues).values([
      {
        id: toChildA,
        companyId,
        title: "Parent -> A",
        status: "todo",
        priority: "medium",
        createdByAgentId: parentAgentId,
        assigneeAgentId: childA,
      },
      {
        id: toChildB,
        companyId,
        title: "Parent -> B",
        status: "todo",
        priority: "medium",
        createdByAgentId: parentAgentId,
        assigneeAgentId: childB,
      },
    ]);

    const result = await svc.list(companyId, {
      createdByAgentId: parentAgentId,
      assigneeAgentId: childA,
    });

    expect(result.map((issue) => issue.id)).toEqual([toChildA]);
  });
});
