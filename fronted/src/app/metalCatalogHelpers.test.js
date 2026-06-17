import { describe, expect, it } from "vitest";
import {
  groupCatalogRowsByCategory,
  normalizeCatalogCategory,
} from "./metalCatalogHelpers";

describe("metalCatalogHelpers", () => {
  it("normalizes empty category label", () => {
    expect(normalizeCatalogCategory("")).toBe("Без категории");
    expect(normalizeCatalogCategory("  Ножки ")).toBe("Ножки");
  });

  it("groups rows by category and hides hidden categories", () => {
    const rows = [
      { article: "A1", category: "Ножки" },
      { article: "A2", category: "Ножки" },
      { article: "B1", category: "Столы ТВ" },
    ];
    const categories = [
      { name: "Ножки", isHidden: false, sortOrder: 1 },
      { name: "Столы ТВ", isHidden: true, sortOrder: 2 },
    ];
    const visible = groupCatalogRowsByCategory(rows, categories, { showHidden: false });
    expect(visible).toHaveLength(1);
    expect(visible[0].name).toBe("Ножки");
    expect(visible[0].rows).toHaveLength(2);

    const all = groupCatalogRowsByCategory(rows, categories, { showHidden: true });
    expect(all).toHaveLength(2);
  });
});
