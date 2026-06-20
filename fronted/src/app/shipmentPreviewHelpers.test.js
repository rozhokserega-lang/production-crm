import { describe, expect, it, vi } from "vitest";
import { enrichPreviewFromFurniture } from "./shipmentPreviewHelpers";

const doniniTemplate = {
  productName: "Donini Grande 750",
  baseQty: 1,
  details: [
    { detailName: "Бок", perUnit: 2 },
    { detailName: "Низ", perUnit: 1 },
    { detailName: "Полка", perUnit: 3 },
  ],
};

function deps(overrides = {}) {
  return {
    furnitureTemplates: [doniniTemplate],
    furnitureLoading: false,
    furnitureError: "",
    normalizeFurnitureKey: (v) =>
      String(v || "")
        .toLowerCase()
        .replace(/[ё]/g, "е")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim(),
    resolveFurnitureTemplateForPreview: () => doniniTemplate,
    buildPreviewRowsFromFurnitureTemplate: (template, qty) =>
      template.details.map((d) => ({
        part: d.detailName,
        qty: String(Number(d.perUnit) * Number(qty)),
      })),
    ...overrides,
  };
}

describe("enrichPreviewFromFurniture", () => {
  it("разворачивает шаблон, даже если qty в placeholder-строке не совпадает с preview.qty", () => {
    const preview = {
      firstName: "Donini Grande 750 мм",
      detailedName: "Donini Grande 750 мм. Дуб Коми",
      qty: 16,
      rows: [{ part: "Donini Grande 750 мм. Дуб Коми", qty: 18 }],
    };

    const enriched = enrichPreviewFromFurniture(preview, deps());
    expect(enriched.rows).toHaveLength(3);
    expect(enriched.rows[0]).toMatchObject({ part: "Бок", qty: "32" });
    expect(enriched.rows[1]).toMatchObject({ part: "Низ", qty: "16" });
    expect(enriched.rows[2]).toMatchObject({ part: "Полка", qty: "48" });
  });

  it("не трогает реальный многострочный preview с бэкенда", () => {
    const preview = {
      firstName: "Donini Grande 750 мм",
      detailedName: "Donini Grande 750 мм. Дуб Коми",
      qty: 16,
      rows: [
        { part: "Бок", qty: "32" },
        { part: "Низ", qty: "16" },
      ],
    };

    const resolve = vi.fn();
    const enriched = enrichPreviewFromFurniture(preview, deps({ resolveFurnitureTemplateForPreview: resolve }));
    expect(enriched.rows).toHaveLength(2);
    expect(resolve).not.toHaveBeenCalled();
  });
});
