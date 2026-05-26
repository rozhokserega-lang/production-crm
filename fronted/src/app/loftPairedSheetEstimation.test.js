import { describe, expect, it } from "vitest";
import {
  applyLoftPairedSheetAdjustment,
  estimateLoftPairedSheets,
  LOFT_PAIRED_SETS_PER_SHEET,
  LOFT_PAIRED_SETS_PER_SHEET_SMALL,
  resolveLoftSheetRules,
  resolveLoftVariant,
  verifyLoftCombinedLayout,
} from "./loftPairedSheetEstimation";
import { estimateSheetsFromTemplateDetails } from "./planSheetEstimation";
import { normalizeFurnitureKey } from "../utils/furnitureUtils";

const loftTemplates = [
  {
    product_name: "ТВ тумба",
    details: [
      { perUnit: 1, detailName: "Крышка (1100_356)" },
      { perUnit: 2, detailName: "Бока (316_167)" },
      { perUnit: 2, detailName: "Полка (1100_316)" },
    ],
  },
  {
    product_name: "ТВ тумба 1500",
    details: [
      { perUnit: 1, detailName: "Крышка (1500_356)" },
      { perUnit: 2, detailName: "Бока (316_167)" },
      { perUnit: 2, detailName: "Полка (1500_316)" },
    ],
  },
];

describe("loftPairedSheetEstimation", () => {
  it("detects simulator rules for large and small sheets", () => {
    const largeRules = resolveLoftSheetRules(loftTemplates, 2800, 2070);
    const smallRules = resolveLoftSheetRules(loftTemplates, 2750, 1830);

    expect(largeRules.pairedKits).toBe(2);
    expect(largeRules.standalone.regular).toBe(4);
    expect(largeRules.standalone["1500"]).toBe(2);
    expect(smallRules.pairedKits).toBe(LOFT_PAIRED_SETS_PER_SHEET_SMALL);
    expect(smallRules.standalone.regular).toBe(3);
    expect(smallRules.standalone["1500"]).toBe(1);
    expect(verifyLoftCombinedLayout(loftTemplates)).toBe(true);
  });

  it("detects regular and 1500 loft variants", () => {
    expect(resolveLoftVariant("ТВ Лофт", "Тумба под ТВ Лофт. Дуб Вотан")).toBe("regular");
    expect(resolveLoftVariant("ТВ Лофт 1500", "Тумба под ТВ Лофт. Дуб Вотан")).toBe("1500");
    expect(resolveLoftVariant("ТВ Лофт 180", "Тумба под ТВ Лoft 180. Дуб Вотan")).toBeNull();
  });

  it("uses one sheet per two matched pairs on large format", () => {
    expect(estimateLoftPairedSheets(36, 2)).toBe(18);
    expect(estimateLoftPairedSheets(2, 2)).toBe(1);
  });

  it("adjusts matched loft rows for large-format material in the same week", () => {
    const rows = [
      {
        key: "r1",
        section: "ТВ Лофт",
        item: "Тумба под ТВ Лофт. Дуб Вотан",
        material: "Дуб вотан",
        week: "77",
        qty: 36,
        sheets: 9,
        productArticle: "GXtvsLoftVo",
      },
      {
        key: "r2",
        section: "ТВ Лофт 1500",
        item: "Тумба под ТВ Лофт. Дуб Вотан",
        material: "Дуб вотан",
        week: "77",
        qty: 36,
        sheets: 18,
        productArticle: "GXtvsLoftGVo",
      },
    ];

    const adjusted = applyLoftPairedSheetAdjustment(rows, {
      templates: loftTemplates,
      normalizeKey: normalizeFurnitureKey,
    });

    expect(adjusted[0].sheets).toBe(9);
    expect(adjusted[1].sheets).toBe(9);
    expect(adjusted[0].sheets + adjusted[1].sheets).toBe(18);
    expect(adjusted[0].loftPaired).toBe(true);
  });

  it("pairs loft rows across different plan weeks for the same material", () => {
    const rows = [
      {
        key: "r1",
        section: "ТВ Лофт 1500",
        item: "Тумба под ТВ Лофт. Дуб Вотан",
        material: "Дуб вотан",
        week: "80",
        qty: 36,
        sheets: 18,
        productArticle: "GXtvsLoftGVo",
      },
      {
        key: "r2",
        section: "ТВ Лофт",
        item: "Тумба под ТВ Лофт. Дуб Вотан",
        material: "Дуб вотан",
        week: "82",
        qty: 24,
        sheets: 6,
        productArticle: "GXtvsLoftVo",
      },
    ];

    const adjusted = applyLoftPairedSheetAdjustment(rows, {
      templates: loftTemplates,
      normalizeKey: normalizeFurnitureKey,
    });

    expect(adjusted[0].sheets + adjusted[1].sheets).toBe(18);
    expect(adjusted[1].sheets).toBe(6);
    expect(adjusted[0].sheets).toBe(12);
  });

  it("uses fractional paired rate on small format", () => {
    expect(estimateLoftPairedSheets(10, LOFT_PAIRED_SETS_PER_SHEET_SMALL)).toBe(7);
    expect(estimateLoftPairedSheets(24, LOFT_PAIRED_SETS_PER_SHEET_SMALL)).toBe(16);
    expect(estimateLoftPairedSheets(36, LOFT_PAIRED_SETS_PER_SHEET_SMALL)).toBe(24);
  });

  it("pairs small-format loft rows with 1.5 pairs per sheet", () => {
    const rows = [
      {
        key: "r1",
        section: "ТВ Лофт",
        item: "Тумба под ТВ Лофт. Интра",
        material: "Интра",
        week: "77",
        qty: 24,
        sheets: 8,
      },
      {
        key: "r2",
        section: "ТВ Лофт 1500",
        item: "Тумба под ТВ Лофт. Интра",
        material: "Интра",
        week: "80",
        qty: 24,
        sheets: 12,
      },
    ];

    const adjusted = applyLoftPairedSheetAdjustment(rows, {
      templates: loftTemplates,
      normalizeKey: normalizeFurnitureKey,
    });

    expect(adjusted[0].sheets + adjusted[1].sheets).toBe(16);
    expect(adjusted[0].loftPaired).toBe(true);
    expect(adjusted[1].loftPaired).toBe(true);
  });

  it("does not pair unknown sheet formats", () => {
    const rows = [
      {
        key: "r1",
        section: "ТВ Лофт",
        item: "Тумба под ТВ Лофт. Интра",
        material: "Неизвестный материал",
        week: "77",
        qty: 36,
        sheets: 12,
      },
      {
        key: "r2",
        section: "ТВ Лофт 1500",
        item: "Тумба под ТВ Лофт. Интра",
        material: "Неизвестный материал",
        week: "77",
        qty: 36,
        sheets: 18,
      },
    ];

    const adjusted = applyLoftPairedSheetAdjustment(rows, {
      templates: loftTemplates,
      normalizeKey: normalizeFurnitureKey,
    });

    expect(adjusted[0].sheets).toBe(12);
    expect(adjusted[1].sheets).toBe(18);
  });
});
