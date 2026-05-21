import { describe, expect, it } from "vitest";
import { ceilWholeSheets, sheetsFromTemplateKits } from "./appUtils";
import {
  buildMaterialYieldsFromVariants,
  parseMaterialYields,
  resolveKitsPerSheetFromTemplate,
  resolveOutputPerSheetFromTemplate,
  resolveSheetNeedsByMaterials,
} from "./furnitureMaterialYield";

describe("furnitureMaterialYield", () => {
  it("parses per-material yields", () => {
    const tpl = {
      kits_per_sheet: 6,
      material_yields: [
        { material: "Дуб вотан", kits_per_sheet: 6 },
        { material: "Белый", kits_per_sheet: 0.4 },
      ],
    };
    expect(parseMaterialYields(tpl)).toHaveLength(2);
    expect(resolveKitsPerSheetFromTemplate(tpl, "Белый")).toBe(0.4);
    expect(resolveKitsPerSheetFromTemplate(tpl, "Дуб вотан")).toBe(6);
    expect(resolveOutputPerSheetFromTemplate(tpl, "Белый")).toBe(2.5);
  });

  it("falls back to legacy kits_per_sheet when material not in yields", () => {
    const tpl = { kits_per_sheet: 8, material_yields: [] };
    expect(resolveKitsPerSheetFromTemplate(tpl, "Любой")).toBe(8);
  });

  it("ceilWholeSheets rounds fractional sheets up", () => {
    expect(ceilWholeSheets(1.2)).toBe(2);
    expect(ceilWholeSheets(1)).toBe(1);
    expect(ceilWholeSheets(0.4)).toBe(1);
  });

  it("sheetsFromTemplateKits returns whole sheets (0.4 per kit)", () => {
    expect(sheetsFromTemplateKits(0.4, 3)).toBe(2);
    expect(sheetsFromTemplateKits(6, 20)).toBe(4);
  });

  it("resolveSheetNeedsByMaterials returns all decor rows for multi-color template", () => {
    const tpl = {
      material_yields: [
        { material: "сонома / бардолино", kits_per_sheet: 0.5 },
        { material: "Графит", kits_per_sheet: 0.3 },
        { material: "солнечный", kits_per_sheet: 0.3 },
      ],
    };
    const templates = [{ product_name: "Стол Color Block", material_yields: tpl.material_yields }];
    const needs = resolveSheetNeedsByMaterials(templates, "Стол Color Block", 5, "сонома / бардолино");
    expect(needs).toHaveLength(3);
    expect(needs.find((x) => x.material === "сонома / бардолино")?.sheets).toBe(3);
    expect(needs.find((x) => x.material === "Графит")?.sheets).toBe(2);
    expect(needs.reduce((s, x) => s + x.sheets, 0)).toBe(7);
  });

  it("builds yields from variant rows", () => {
    const yields = buildMaterialYieldsFromVariants(
      [
        { color: "A", kitsPerSheet: "6" },
        { color: "B", kitsPerSheet: "0,4" },
      ],
      (v) => Number(String(v).replace(",", ".")) || 0,
    );
    expect(yields).toEqual([
      { material: "A", kits_per_sheet: 6 },
      { material: "B", kits_per_sheet: 0.4 },
    ]);
  });
});
