import { describe, expect, it } from "vitest";
import {
  buildLaborOrdersRows,
  estimateLaborForItem,
  estimateLaborForLines,
} from "./laborNormCalculator";

describe("laborNormCalculator", () => {
  const norms = [{
    groupName: "Stabile",
    pilkaMin: 45,
    kromkaMin: 30,
    prasMin: 15,
    assemblyMin: 0,
    qtyUnit: 1,
  }];

  it("prefers norm over fact for per-qty rates", () => {
    const table = [{
      orderId: "SP-1",
      item: "Stabile. Дуб",
      qty: 2,
      pilkaMin: 100,
      kromkaMin: 80,
      prasMin: 40,
      assemblyMin: 0,
      totalMin: 220,
    }];
    const rows = buildLaborOrdersRows(table, norms);
    const stabile = rows.find((r) => r.group === "Stabile");
    expect(stabile.source).toBe("norm");
    expect(stabile.laborPerQtyMin).toBe(90);
  });

  it("estimates labor for item and qty", () => {
    const ordersRows = buildLaborOrdersRows([], norms);
    const est = estimateLaborForItem({ item: "Stabile. Дуб Вотан", qty: 3 }, ordersRows);
    expect(est.group).toBe("Stabile");
    expect(est.totalMin).toBe(270);
    expect(est.source).toBe("norm");
  });

  it("aggregates multiple lines", () => {
    const ordersRows = buildLaborOrdersRows([], norms);
    const result = estimateLaborForLines([
      { item: "Stabile. Дуб", qty: 2 },
      { item: "Stabile. Орех", qty: 1 },
    ], ordersRows);
    expect(result.totals.totalMin).toBe(270);
    expect(result.lines).toHaveLength(2);
  });
});
