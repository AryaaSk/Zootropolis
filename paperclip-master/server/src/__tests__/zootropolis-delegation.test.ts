import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkDirectReportDelegation,
  isZootropolisDelegationStrict,
} from "../services/issues.ts";
import { ZOOTROPOLIS_PREAMBLE } from "../services/heartbeat.ts";

describe("checkDirectReportDelegation", () => {
  it("allows assigning to a direct report (no layer info — legacy path)", () => {
    const result = checkDirectReportDelegation({
      delegatorAgentId: "manager",
      assigneeAgent: { id: "leaf", reportsTo: "manager" },
    });
    expect(result.allowed).toBe(true);
  });

  it("allows room→leaf when both layers are provided and adjacent", () => {
    const result = checkDirectReportDelegation({
      delegatorAgentId: "room-1",
      delegatorLayer: "room",
      assigneeAgent: { id: "leaf-1", reportsTo: "room-1", layer: "agent" },
    });
    expect(result.allowed).toBe(true);
  });

  it("allows floor→room when both layers are provided and adjacent", () => {
    const result = checkDirectReportDelegation({
      delegatorAgentId: "floor-1",
      delegatorLayer: "floor",
      assigneeAgent: { id: "room-1", reportsTo: "floor-1", layer: "room" },
    });
    expect(result.allowed).toBe(true);
  });

  it("rejects floor→leaf even when reportsTo says floor (axiom violation)", () => {
    // The bug from the ZOO-8 retry: floor-1 created sub-issues directly for
    // leaves whose reportsTo pointed at the floor. Phase S layer-adjacency
    // catches this even when reportsTo would be satisfied.
    const result = checkDirectReportDelegation({
      delegatorAgentId: "floor-1",
      delegatorLayer: "floor",
      assigneeAgent: { id: "leaf-1", reportsTo: "floor-1", layer: "agent" },
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toMatch(/layer/i);
      expect(result.reason).toMatch(/room/);
    }
  });

  it("rejects leaf delegating (leaves cannot create sub-issues)", () => {
    const result = checkDirectReportDelegation({
      delegatorAgentId: "leaf-1",
      delegatorLayer: "agent",
      assigneeAgent: { id: "leaf-2", reportsTo: "leaf-1", layer: "agent" },
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toMatch(/leaves|cannot delegate/i);
  });

  it("rejects assigning to self", () => {
    const result = checkDirectReportDelegation({
      delegatorAgentId: "agent-x",
      assigneeAgent: { id: "agent-x", reportsTo: null },
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toMatch(/yourself/i);
  });

  it("rejects skip-layer delegation by reportsTo (grandchild)", () => {
    const result = checkDirectReportDelegation({
      delegatorAgentId: "building",
      assigneeAgent: { id: "leaf", reportsTo: "room" },
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toMatch(/direct report/i);
  });

  it("rejects assigning upward (child to parent)", () => {
    const result = checkDirectReportDelegation({
      delegatorAgentId: "leaf",
      assigneeAgent: { id: "manager", reportsTo: null },
    });
    expect(result.allowed).toBe(false);
  });

  it("rejects peer-to-peer (siblings under same parent)", () => {
    const result = checkDirectReportDelegation({
      delegatorAgentId: "leaf-a",
      assigneeAgent: { id: "leaf-b", reportsTo: "room" },
    });
    expect(result.allowed).toBe(false);
  });

  it("rejects cross-subtree assignment", () => {
    const result = checkDirectReportDelegation({
      delegatorAgentId: "building-1",
      assigneeAgent: { id: "leaf-in-building-2", reportsTo: "room-in-building-2" },
    });
    expect(result.allowed).toBe(false);
  });

  it("rejects when assignee has no parent (root)", () => {
    const result = checkDirectReportDelegation({
      delegatorAgentId: "anyone",
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

describe("ZOOTROPOLIS_PREAMBLE container delegation rubric", () => {
  const c = ZOOTROPOLIS_PREAMBLE.containersOnly;

  it("frames the manager's job as DECOMPOSE and DELEGATE", () => {
    expect(c).toHaveProperty("jobDescription");
    expect(c.jobDescription).toMatch(/DECOMPOSE/);
    expect(c.jobDescription).toMatch(/DELEGATE/);
  });

  it("leads with a blunt 99% delegation rule", () => {
    expect(c).toHaveProperty("mostImportantRule");
    expect(c.mostImportantRule).toMatch(/DELEGATE 99% OF TASKS/);
  });

  it("names the only two exceptions: synthesis and trivial Q&A", () => {
    expect(c.mostImportantRule).toMatch(/SYNTHESIS/);
    expect(c.mostImportantRule).toMatch(/TRIVIAL Q&A/i);
  });

  it("includes a layer rule spelling out the campus→building→floor→room→leaf chain", () => {
    expect(c).toHaveProperty("layerRule");
    expect(c.layerRule).toMatch(/campus/);
    expect(c.layerRule).toMatch(/building/);
    expect(c.layerRule).toMatch(/floor/);
    expect(c.layerRule).toMatch(/room/);
    expect(c.layerRule).toMatch(/agent|leaf/i);
    expect(c.layerRule).toMatch(/immediately below|exactly one/i);
  });

  it("explicitly lists research, docs, and spec-writing as work-to-delegate", () => {
    const corpus = [c.mostImportantRule, ...c.rules].join(" ").toLowerCase();
    for (const term of ["research", "spec", "docs", "coding"]) {
      expect(corpus).toContain(term);
    }
  });

  it("includes the spec-writing bad pattern (covers the ZOO-8 failure mode)", () => {
    const joined = c.rules.join(" ");
    expect(joined).toMatch(/spec/i);
    expect(joined).toMatch(/REJECTED/);
  });

  it("includes a skip-layer bad pattern (covers floor→leaf direct delegation)", () => {
    const joined = c.rules.join(" ");
    expect(joined).toMatch(/skip-layer/i);
    expect(joined).toMatch(/floor/i);
    expect(joined).toMatch(/leaf/i);
  });

  it("bumps preamble version to v5 for drain-mode", () => {
    expect(ZOOTROPOLIS_PREAMBLE.version).toBeGreaterThanOrEqual(5);
  });

  it("ships drain-mode rules for containers (not leaves)", () => {
    expect(c).toHaveProperty("drainMode");
    expect(c.drainMode.summary).toMatch(/DRAIN YOUR INBOX/);
    // Procedure must include the soft cap and the 409-skip rule.
    const proc = c.drainMode.procedure.join(" ");
    expect(proc).toMatch(/409/);
    expect(proc).toMatch(/cap|10/i);
    expect(proc).toMatch(/inbox-lite|inbox/i);
  });

  it("drain-mode rule explicitly excludes leaves", () => {
    expect(c.drainMode.leavesNote).toMatch(/leaf|leaves/i);
    expect(c.drainMode.leavesNote).toMatch(/one task per heartbeat/i);
    expect(c.drainMode.leavesNote).toMatch(/agent/);
  });

  it("drain-mode does not appear at the top level (containers-only scope)", () => {
    // Sanity check that drainMode is nested under containersOnly, not at the
    // root preamble — leaves must not see it.
    expect((ZOOTROPOLIS_PREAMBLE as Record<string, unknown>).drainMode).toBeUndefined();
  });

  it("ships a top-level ATTENTION directive that names the four legal actions", () => {
    expect(ZOOTROPOLIS_PREAMBLE).toHaveProperty("ATTENTION");
    const a = ZOOTROPOLIS_PREAMBLE.ATTENTION;
    expect(a).toMatch(/DECOMPOSE/);
    expect(a).toMatch(/DELEGATE/);
    expect(a).toMatch(/SYNTHESISE/);
    expect(a).toMatch(/trivial/i);
  });

  it("enumerates exactly four legal container actions (no fifth thing)", () => {
    expect(c).toHaveProperty("legalActionsExhaustive");
    expect(c.legalActionsExhaustive).toHaveLength(4);
    const joined = c.legalActionsExhaustive.join(" ");
    expect(joined).toMatch(/DECOMPOSE/);
    expect(joined).toMatch(/DELEGATE/);
    expect(joined).toMatch(/SYNTHESISE/);
    expect(joined).toMatch(/TRIVIALLY ANSWER/);
  });

  it("includes a skill-override clause that names Paperclip's \"do the work\"", () => {
    expect(c).toHaveProperty("skillOverride");
    expect(c.skillOverride).toMatch(/Paperclip/);
    expect(c.skillOverride).toMatch(/do the work/i);
    expect(c.skillOverride).toMatch(/precedence|overrides?/i);
  });

  it("calls out spec/research/code as illegal container actions", () => {
    expect(c).toHaveProperty("illegalActionsExamples");
    const joined = c.illegalActionsExamples.join(" ").toLowerCase();
    for (const term of ["spec", "research", "code", "delegate"]) {
      expect(joined).toContain(term);
    }
  });
});
