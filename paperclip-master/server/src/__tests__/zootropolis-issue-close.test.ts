import { describe, expect, it } from "vitest";
import { readZootropolisCloseMarker } from "@paperclipai/shared";

describe("readZootropolisCloseMarker", () => {
  it("parses a well-formed close marker", () => {
    const marker = readZootropolisCloseMarker({
      zootropolis: {
        action: "close",
        status: "done",
        summary: "Octopuses have three hearts.",
        artifact: "## Result\n\nOctopuses have three hearts and blue blood.",
      },
    });
    expect(marker).toEqual({
      action: "close",
      status: "done",
      summary: "Octopuses have three hearts.",
      artifact: "## Result\n\nOctopuses have three hearts and blue blood.",
    });
  });

  it("defaults status to 'done' when omitted", () => {
    const marker = readZootropolisCloseMarker({
      zootropolis: { action: "close", artifact: "shipped" },
    });
    expect(marker?.status).toBe("done");
  });

  it("respects 'cancelled' status when explicitly set", () => {
    const marker = readZootropolisCloseMarker({
      zootropolis: { action: "close", status: "cancelled" },
    });
    expect(marker?.status).toBe("cancelled");
  });

  it("returns null when zootropolis field is absent (vanilla agent output)", () => {
    expect(readZootropolisCloseMarker({ summary: "just a comment" })).toBeNull();
  });

  it("returns null when action is not 'close'", () => {
    expect(
      readZootropolisCloseMarker({ zootropolis: { action: "open" } }),
    ).toBeNull();
  });

  it("returns null on non-object input (string, array, null)", () => {
    expect(readZootropolisCloseMarker("not an object")).toBeNull();
    expect(readZootropolisCloseMarker([])).toBeNull();
    expect(readZootropolisCloseMarker(null)).toBeNull();
    expect(readZootropolisCloseMarker(undefined)).toBeNull();
  });

  it("ignores blank summary/artifact (treats as undefined)", () => {
    const marker = readZootropolisCloseMarker({
      zootropolis: { action: "close", summary: "   ", artifact: "" },
    });
    expect(marker?.summary).toBeUndefined();
    expect(marker?.artifact).toBeUndefined();
  });

  it("ignores malformed status (falls back to 'done')", () => {
    const marker = readZootropolisCloseMarker({
      zootropolis: { action: "close", status: "in_progress" as unknown as "done" },
    });
    expect(marker?.status).toBe("done");
  });

  it("ignores extra unknown fields without erroring", () => {
    const marker = readZootropolisCloseMarker({
      zootropolis: {
        action: "close",
        status: "done",
        summary: "ok",
        artifact: "x",
        // @ts-expect-error — testing that unknown fields don't crash the parser
        futureField: { nested: true },
      },
    });
    expect(marker).not.toBeNull();
    expect(marker?.summary).toBe("ok");
  });
});
