import { describe, expect, it } from "vitest";
import {
  estimateSheetsFromTemplateDetails,
  findPlanFurnitureTemplate,
  resolveDeskOutputPerSheet,
  resolveFurnitureTemplateKey,
  resolvePlanItemSheets,
  resolveShelfSheetsFromCatalog,
} from "./planSheetEstimation";
import { DEFAULT_GX_SHELF_CATALOG } from "./shelfCatalogHelpers";

const templates = [
  {
    product_name: "Siena",
    kits_per_sheet: 0,
    details: [
      { perUnit: 2, detailName: "Крышки (800_350)" },
      { perUnit: 2, detailName: "Дно (784_321_900)" },
      { perUnit: 4, detailName: "Фасад (396_305)" },
    ],
  },
  {
    product_name: "Тумба под ТВ Siena 2 150. Интра - Серый",
    kits_per_sheet: 0.4,
    details: [],
  },
  {
    product_name: "Flamingo круглый",
    kits_per_sheet: 0,
    details: [
      { perUnit: 1, detailName: "Крышка (480_480)" },
      { perUnit: 1, detailName: "Дно (480_320)" },
    ],
  },
];

describe("planSheetEstimation", () => {
  it("maps Siena plan items to Siena template", () => {
    expect(resolveFurnitureTemplateKey("Тумба под ТВ Siena 1. Интра - Эра")).toBe("Siena");
    expect(findPlanFurnitureTemplate(templates, "Тумба под ТВ Siena 1. Интра - Эра")?.product_name).toBe("Siena");
  });

  it("estimates sheets from template details", () => {
    expect(estimateSheetsFromTemplateDetails(templates[0].details, 10)).toBeGreaterThan(0);
  });

  it("resolves Pino X like Donini by material size", () => {
    expect(resolveDeskOutputPerSheet("", "Стол кухонный Pino X Дуб Вотан", "Дуб Вотан")).toBe(6);
    expect(resolveDeskOutputPerSheet("", "Стол кухонный Pino X Бетон", "Бетон")).toBe(4);
  });

  it("resolves shelf catalog sheets", () => {
    const entry = DEFAULT_GX_SHELF_CATALOG.find((x) => x.primary.code === "GXss1-600WOS");
    const map = { "GXSS1-600WOS": entry };
    expect(resolveShelfSheetsFromCatalog("GXss1-600WOS", 20, map)).toBeGreaterThan(0);
  });

  it("resolves full plan item for Siena and Pino X", () => {
    const siena = resolvePlanItemSheets({
      itemName: "Тумба под ТВ Siena 1. Интра - Эра",
      materialName: "Интра",
      qty: 20,
      templates,
    });
    expect(siena.sheets).toBeGreaterThan(0);

    const pino = resolvePlanItemSheets({
      itemName: "Стол кухонный Pino X Дуб Вотан, черные ножки",
      materialName: "Дуб Вотан",
      qty: 36,
      templates,
    });
    expect(pino.sheets).toBe(6);
  });
});
