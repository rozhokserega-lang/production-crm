import { describe, expect, it } from "vitest";
import {
  buildCreatePlanDialogInit,
  matchPlanCatalogRowSelectKey,
  planCatalogRowSelectKey,
  resolvePlanCatalogSelection,
} from "./shipmentDialogHelpers";

describe("planCatalogRowSelectKey", () => {
  it("uses uppercased article and normalized material when present", () => {
    expect(planCatalogRowSelectKey({ article: "ab-12", itemName: "X", material: "Y" })).toBe("AB-12|y");
  });

  it("falls back to item and material when article missing", () => {
    expect(planCatalogRowSelectKey({ article: "", itemName: "Стол", material: "Бук" })).toBe("Стол|||бук");
  });
});

describe("matchPlanCatalogRowSelectKey", () => {
  it("matches legacy select value that was only the article", () => {
    const row = { article: "SN-1", itemName: "X", material: "Юта" };
    expect(matchPlanCatalogRowSelectKey(row, "SN-1")).toBe(true);
    expect(matchPlanCatalogRowSelectKey(row, planCatalogRowSelectKey(row))).toBe(true);
  });
});

describe("resolvePlanCatalogSelection", () => {
  it("matches by article when material suffix in key differs from catalog", () => {
    const rows = [
      {
        section_name: "Donini 806",
        article: "GXKTDOBC",
        item_name: "Donini 806 мм. Бетон Чикаго светло-серый",
        material: "Бетон Чикаго светло-серый",
      },
    ];
    const sectionArticles = rows.map((x) => ({
      sectionName: "Donini 806",
      article: "GXKTDOBC",
      itemName: "Donini 806 мм. Бетон Чикаго светло-серый",
      material: "Бетон Чикаго светло-серый",
    }));
    const hit = resolvePlanCatalogSelection({
      planSection: "Donini 806",
      planArticle: "GXKTDOBC|бетон чикаго",
      planMaterial: "Бетон чикаго",
      sectionArticleRows: rows,
      sectionArticles,
    });
    expect(hit?.itemName).toContain("Donini 806");
  });
});

describe("buildCreatePlanDialogInit", () => {
  it("initializes plan article select value from first catalog row key (not raw item_name)", () => {
    const init = buildCreatePlanDialogInit({
      sectionOptions: ["Обувница"],
      weeks: ["70"],
      sectionArticleRows: [
        { section_name: "Обувница", article: "SN-1", item_name: "Обувница Siena 1", material: "Юта" },
        { section_name: "Обувница", article: "SN-2", item_name: "Обувница Siena 1", material: "Интра" },
      ],
      resolvePlanMaterial: (row) => String(row?.material || "").trim(),
    });
    expect(init.section).toBe("Обувница");
    expect(init.article).toBe("SN-1|юта");
    expect(init.material).toBe("Юта");
  });
});
