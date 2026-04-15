import { describe, expect, it } from "vitest";
import { createIssueSchema, updateIssueSchema, SETTABLE_ISSUE_STATUSES } from "@paperclipai/shared";

/**
 * Phase V — `backlog` is no longer a settable status. Issues are born `todo`
 * and never return to backlog. The validator + service guards together
 * ensure the API rejects every code path that would write a backlog row.
 *
 * The service-level guard is exercised by integration tests; this file
 * covers the validator (which is what the HTTP routes run before any DB
 * touch) and the SETTABLE_ISSUE_STATUSES contract.
 */
describe("Phase V: backlog is dead", () => {
  it("SETTABLE_ISSUE_STATUSES does not include backlog", () => {
    expect(SETTABLE_ISSUE_STATUSES).not.toContain("backlog");
  });

  it("SETTABLE_ISSUE_STATUSES contains the canonical lifecycle", () => {
    expect(SETTABLE_ISSUE_STATUSES).toEqual([
      "todo",
      "in_progress",
      "in_review",
      "done",
      "blocked",
      "cancelled",
    ]);
  });

  describe("createIssueSchema", () => {
    it("rejects status: 'backlog'", () => {
      const result = createIssueSchema.safeParse({
        title: "test",
        status: "backlog",
      });
      expect(result.success).toBe(false);
    });

    it("defaults missing status to 'todo' (was 'backlog' pre-Phase V)", () => {
      const result = createIssueSchema.safeParse({ title: "test" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe("todo");
      }
    });

    it("accepts every settable status", () => {
      for (const status of SETTABLE_ISSUE_STATUSES) {
        const result = createIssueSchema.safeParse({ title: "test", status });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.status).toBe(status);
      }
    });
  });

  describe("updateIssueSchema", () => {
    it("rejects status: 'backlog'", () => {
      const result = updateIssueSchema.safeParse({ status: "backlog" });
      expect(result.success).toBe(false);
    });

    it("accepts every settable status", () => {
      for (const status of SETTABLE_ISSUE_STATUSES) {
        const result = updateIssueSchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });

    it("does not require a status (partial updates)", () => {
      const result = updateIssueSchema.safeParse({ title: "renamed" });
      expect(result.success).toBe(true);
    });
  });
});
