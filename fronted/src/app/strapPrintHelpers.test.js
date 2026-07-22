import { describe, expect, it } from "vitest";
import {
  buildStrapLaunchPlanPreview,
  resolveStrapLaunchPrintInputs,
} from "./strapPrintHelpers";

describe("strapPrintHelpers", () => {
  it("builds strap launch print preview", () => {
    const preview = buildStrapLaunchPlanPreview({
      strapType: "558_80",
      color: "Черный",
      qty: 240,
      productName: "Донини",
      generatedAt: "22.07.2026 13:26",
    });
    expect(preview.firstName).toBe("558_80");
    expect(preview.colorName).toBe("Черный");
    expect(preview.planNumber).toBe("обвязка");
    expect(preview.qty).toBe(240);
    expect(preview.strapTargetProduct).toBe("Донини");
    expect(preview.rows).toEqual([{ part: "558_80", qty: "240" }]);
  });

  it("validates launch print inputs", () => {
    const launchDialog = {
      strapType: "558_80",
      color: "Черный",
      products: ["Донини"],
    };
    expect(
      resolveStrapLaunchPrintInputs({
        launchDialog,
        qtyInput: "240",
        materialInput: "",
        productInput: "",
        needsColorChoice: false,
      }),
    ).toMatchObject({ ok: true, qty: 240, productName: "Донини" });
    expect(
      resolveStrapLaunchPrintInputs({
        launchDialog,
        qtyInput: "",
        materialInput: "",
        productInput: "",
        needsColorChoice: false,
      }).ok,
    ).toBe(false);
  });
});
