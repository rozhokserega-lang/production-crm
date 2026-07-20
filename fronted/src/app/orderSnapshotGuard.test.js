import { describe, expect, it } from "vitest";
import { reconcileOrderSnapshot } from "./orderSnapshotGuard";

describe("reconcileOrderSnapshot", () => {
  const current = [{ orderId: "SP-1" }];

  it("keeps rendered orders when a background snapshot is unexpectedly empty", () => {
    expect(reconcileOrderSnapshot(current, [], { preserveOnEmpty: true })).toBe(current);
  });

  it("applies an empty foreground snapshot", () => {
    expect(reconcileOrderSnapshot(current, [])).toEqual([]);
  });

  it("applies a non-empty background snapshot", () => {
    const incoming = [{ orderId: "SP-2" }];
    expect(reconcileOrderSnapshot(current, incoming, { preserveOnEmpty: true })).toBe(incoming);
  });
});
