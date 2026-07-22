import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { exportAugustPlanXlsx, outPath } from "./export-august-plan-xlsx.mjs";

describe("export august plan xlsx", () => {
  it("writes detailed materials workbook", async () => {
    const { report } = await exportAugustPlanXlsx();
    expect(existsSync(outPath)).toBe(true);
    expect(report.totals.totalSheets).toBeGreaterThan(0);
    expect(report.positions.length).toBe(report.totals.planRows);
  }, 120000);
});
