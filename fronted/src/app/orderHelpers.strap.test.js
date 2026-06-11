import { describe, expect, it } from "vitest";
import {
  embedStrapTargetProduct,
  extractStrapTargetProduct,
  formatStrapPlanTargetCaption,
  resolveStrapTargetProductFromShipmentRow,
  stripPlanItemMeta,
} from "./orderHelpers";

describe("strap target product meta", () => {
  it("embeds and extracts product for strap plan item", () => {
    const raw = embedStrapTargetProduct("558_80", "Донини");
    expect(raw).toContain("558_80");
    expect(extractStrapTargetProduct(raw)).toBe("Донини");
    expect(stripPlanItemMeta(raw)).toBe("558_80");
  });

  it("prefers sourceItem meta over formatted table label", () => {
    const raw = embedStrapTargetProduct("1158_56", "Авелла Лайт");
    expect(
      resolveStrapTargetProductFromShipmentRow({
        item: "Обвязка (1158_56)",
        sourceItem: raw,
      }),
    ).toBe("Авелла Лайт");
  });

  it("formats strap caption for print sheets", () => {
    expect(formatStrapPlanTargetCaption("Донини", "обвязка")).toBe("Обвязка для изделия: Донини");
    expect(formatStrapPlanTargetCaption("Авелла", "обвязка")).toBe("Фасады для Сиена");
  });
});
