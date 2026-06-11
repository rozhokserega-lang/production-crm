import { describe, expect, it } from "vitest";
import {
  embedStrapTargetProduct,
  extractStrapTargetProduct,
  stripPlanItemMeta,
} from "./orderHelpers";

describe("strap target product meta", () => {
  it("embeds and extracts product for strap plan item", () => {
    const raw = embedStrapTargetProduct("558_80", "Донини");
    expect(raw).toContain("558_80");
    expect(extractStrapTargetProduct(raw)).toBe("Донини");
    expect(stripPlanItemMeta(raw)).toBe("558_80");
  });
});
