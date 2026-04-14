import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkDirectReportDelegation,
  isZootropolisDelegationStrict,
} from "../services/issues.ts";

describe("checkDirectReportDelegation", () => {
  it("allows assigning to a direct report", () => {
    const result = checkDirectReportDelegation({
      creatorAgentId: "manager",
      assigneeAgent: { id: "leaf", reportsTo: "manager" },
    });
    expect(result.allowed).toBe(true);
  });

  it("rejects assigning to self", () => {
    const result = checkDirectReportDelegation({
      creatorAgentId: "agent-x",
      assigneeAgent: { id: "agent-x", reportsTo: null },
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toMatch(/yourself/i);
  });

  it("rejects skip-layer delegation (grandchild)", () => {
    // building-owner trying to assign directly to a leaf two layers below
    const result = checkDirectReportDelegation({
      creatorAgentId: "building",
      assigneeAgent: { id: "leaf", reportsTo: "room" },
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toMatch(/direct report/i);
  });

  it("rejects assigning upward (child to parent)", () => {
    // child trying to assign work to its own manager — that would be "up the
    // chain," which goes through the manager creating its own issue, not the
    // child assigning one.
    const result = checkDirectReportDelegation({
      creatorAgentId: "leaf",
      assigneeAgent: { id: "manager", reportsTo: null },
    });
    expect(result.allowed).toBe(false);
  });

  it("rejects peer-to-peer (siblings under same parent)", () => {
    const result = checkDirectReportDelegation({
      creatorAgentId: "leaf-a",
      assigneeAgent: { id: "leaf-b", reportsTo: "room" },
    });
    expect(result.allowed).toBe(false);
  });

  it("rejects cross-subtree assignment", () => {
    const result = checkDirectReportDelegation({
      creatorAgentId: "building-1",
      assigneeAgent: { id: "leaf-in-building-2", reportsTo: "room-in-building-2" },
    });
    expect(result.allowed).toBe(false);
  });

  it("rejects when assignee has no parent (root)", () => {
    const result = checkDirectReportDelegation({
      creatorAgentId: "anyone",
      assigneeAgent: { id: "root", reportsTo: null },
    });
    expect(result.allowed).toBe(false);
  });
});

describe("isZootropolisDelegationStrict", () => {
  const previousValue = process.env.ZOOTROPOLIS_DELEGATION_STRICT;

  beforeEach(() => {
    delete process.env.ZOOTROPOLIS_DELEGATION_STRICT;
  });

  afterEach(() => {
    if (previousValue === undefined) {
      delete process.env.ZOOTROPOLIS_DELEGATION_STRICT;
    } else {
      process.env.ZOOTROPOLIS_DELEGATION_STRICT = previousValue;
    }
  });

  it("defaults to false when unset", () => {
    expect(isZootropolisDelegationStrict()).toBe(false);
  });

  it("is true for 'true'", () => {
    process.env.ZOOTROPOLIS_DELEGATION_STRICT = "true";
    expect(isZootropolisDelegationStrict()).toBe(true);
  });

  it("is true for '1'", () => {
    process.env.ZOOTROPOLIS_DELEGATION_STRICT = "1";
    expect(isZootropolisDelegationStrict()).toBe(true);
  });

  it("is case-insensitive", () => {
    process.env.ZOOTROPOLIS_DELEGATION_STRICT = "TRUE";
    expect(isZootropolisDelegationStrict()).toBe(true);
  });

  it("rejects 'false', 'no', empty", () => {
    for (const v of ["false", "no", "0", ""]) {
      process.env.ZOOTROPOLIS_DELEGATION_STRICT = v;
      expect(isZootropolisDelegationStrict()).toBe(false);
    }
  });
});
