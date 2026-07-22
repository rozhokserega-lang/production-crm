import { describe, expect, it } from "vitest";
import { buildAugustPlanMaterialReport } from "./augustPlanMaterialCalc.js";

describe("august 2026 plan materials", () => {
  it("calculates LDSP sheets and strap demand from CRM rules", async () => {
    const report = await buildAugustPlanMaterialReport();

    console.log("\n=== ПЛАН АВГУСТ — МАТЕРИАЛЫ (ЛДСП) ===");
    report.materials.forEach((row) => console.log(`${row.material}: ${row.sheets} листов`));
    console.log(`\nИТОГО листов: ${report.totals.totalSheets}`);
    console.log("\n=== ОБВЯЗКА (планки) ===");
    report.straps.forEach((row) => console.log(`${row.label}: ${row.needed} шт`));
    console.log(`\nПозиций без расчёта листов: ${report.totals.missingCount}`);

    expect(report.totals.totalSheets).toBeGreaterThan(0);
    expect(report.materials.length).toBeGreaterThan(0);
  }, 120000);
});
