import { describe, expect, it } from "vitest";
import {
  buildStrapDisplayDeps,
  resolveStrapTargetCaption,
  resolveStrapTargetProductForDisplay,
} from "./strapDisplayHelpers";

describe("strapDisplayHelpers", () => {
  const catalogRows = [
    {
      product_name: "Донини R",
      detail_name_pattern: "%обвязка%288_80%",
      is_active: true,
    },
  ];
  const deps = buildStrapDisplayDeps(catalogRows);

  it("resolves Donini R from bare strap code via catalog", () => {
    expect(resolveStrapTargetProductForDisplay({ item: "288_80", week: "обвязка" }, deps)).toBe("Донини R");
    expect(resolveStrapTargetCaption({ item: "288_80", week: "обвязка" }, deps)).toBe(
      "Обвязка для изделия: Донини R",
    );
  });

  it("resolves Donini R from bare code even without catalog", () => {
    expect(resolveStrapTargetProductForDisplay({ item: "502_80", week: "обвязка" }, {})).toBe("Донини R");
  });

  it("resolves Donini R for strap-plan order with material suffix", () => {
    expect(resolveStrapTargetProductForDisplay({ item: "502_80. Черный", week: "обвязка" }, {})).toBe("Донини R");
    expect(resolveStrapTargetCaption({ item: "502_80. Черный", week: "обвязка" }, {})).toBe(
      "Обвязка для изделия: Донини R",
    );
  });

  it("uses STRAP_FOR meta when present", () => {
    expect(
      resolveStrapTargetProductForDisplay(
        { item: "288_80 {{STRAP_FOR:Донини R}}", week: "обвязка" },
        {},
      ),
    ).toBe("Донини R");
  });

  it("returns empty for regular furniture order", () => {
    expect(
      resolveStrapTargetProductForDisplay(
        { item: "Donini R 750 мм. Бетон", week: "24" },
        deps,
      ),
    ).toBe("");
  });
});
