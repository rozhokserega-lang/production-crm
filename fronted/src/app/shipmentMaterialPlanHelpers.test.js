import { describe, expect, it } from "vitest";
import {
  allocateMaterialStockCoverage,
  annotateRowsWithMaterialCoverage,
  buildShipmentMaterialPlan,
  findShipmentMaterialPlanEntry,
  materialPlanTotals,
} from "./shipmentMaterialPlanHelpers";
import { normalizeFurnitureKey } from "../utils/furnitureUtils";
import { buildMaterialCard } from "./materialCardHelpers";

function makeBalance(entries) {
  return new Map(entries.map(([key, value]) => [key, value]));
}

describe("allocateMaterialStockCoverage", () => {
  it("covers earliest/largest rows first within available stock", () => {
    const coverage = allocateMaterialStockCoverage(
      [
        { key: "a", week: "84", sheets: 13 },
        { key: "b", week: "84", sheets: 13 },
        { key: "c", week: "84", sheets: 13 },
      ],
      30,
    );
    expect(coverage.get("a")).toEqual({ enough: true, shortage: 0 });
    expect(coverage.get("b")).toEqual({ enough: true, shortage: 0 });
    expect(coverage.get("c")).toEqual({ enough: false, shortage: 9 });
  });
});

describe("annotateRowsWithMaterialCoverage", () => {
  it("marks some awaiting rows green when material has partial stock", () => {
    const rows = [
      { key: "1", stageKey: "awaiting", material: "Бетон", week: "84", sheets: 13 },
      { key: "2", stageKey: "awaiting", material: "Бетон", week: "85", sheets: 13 },
      { key: "3", stageKey: "awaiting", material: "Бетон", week: "86", sheets: 13 },
      { key: "4", stageKey: "awaiting", material: "Герион", week: "84", sheets: 8 },
    ];
    const balance = makeBalance([
      ["бетон", { material: "Бетон", needed: 39, available: 30 }],
      ["герион", { material: "Герион", needed: 8, available: 40 }],
    ]);
    const annotated = annotateRowsWithMaterialCoverage(rows, balance, normalizeFurnitureKey);

    expect(annotated.find((r) => r.key === "1").materialEnoughForRow).toBe(true);
    expect(annotated.find((r) => r.key === "2").materialEnoughForRow).toBe(true);
    expect(annotated.find((r) => r.key === "3").materialEnoughForRow).toBe(false);
    expect(annotated.find((r) => r.key === "3").materialRowShortage).toBe(9);
    expect(annotated.find((r) => r.key === "4").materialEnoughForRow).toBe(true);
    expect(annotated.find((r) => r.key === "1").materialHasDeficit).toBe(true);
  });
});

describe("buildShipmentMaterialPlan", () => {
  it("keeps demand visible when stock is enough", () => {
    const rows = [
      {
        stageKey: "awaiting",
        material: "Ночное небо",
        key: "a1",
        orderId: "101",
        section: "TB Siena 1",
        item: "Тумба под ТВ Siena 1. Ночное небо-Герион",
        productArticle: "GXtvsS1BSkyGe",
        week: "79",
        qty: 10,
        sheets: 5,
        sourceRow: "r1",
        sourceCol: "c1",
      },
    ];
    const balance = makeBalance([["ночное небо", { material: "Ночное небо", needed: 5, available: 34 }]]);
    const plan = buildShipmentMaterialPlan(rows, balance, normalizeFurnitureKey);

    expect(plan).toHaveLength(1);
    expect(plan[0].needed).toBe(5);
    expect(plan[0].available).toBe(34);
    expect(plan[0].deficit).toBe(0);
    expect(plan[0].weeks[0].rows).toHaveLength(1);
    expect(materialPlanTotals(plan).coveredMaterials).toBe(1);
    expect(materialPlanTotals(plan).deficitMaterials).toBe(0);
  });

  it("groups materials by normalized key", () => {
    const rows = [
      {
        stageKey: "awaiting",
        material: "Сонома / Бардолино",
        key: "a1",
        item: "Стол 1",
        week: "21",
        qty: 4,
        sheets: 2,
      },
      {
        stageKey: "awaiting",
        material: "сонома бардолино",
        key: "a2",
        item: "Стол 2",
        week: "22",
        qty: 6,
        sheets: 3,
      },
    ];
    const balance = makeBalance([["сонома бардолино", { material: "Сонома / Бардолино", needed: 5, available: 20 }]]);
    const plan = buildShipmentMaterialPlan(rows, balance, normalizeFurnitureKey);

    expect(plan).toHaveLength(1);
    expect(plan[0].needed).toBe(5);
    expect(plan[0].weeks).toHaveLength(2);
  });

  it("ignores rows not in awaiting stage", () => {
    const rows = [
      {
        stageKey: "in_work",
        material: "Интра",
        key: "a1",
        item: "Стол",
        week: "21",
        qty: 4,
        sheets: 2,
      },
    ];
    const balance = makeBalance([["интра", { material: "Интра", needed: 2, available: 1 }]]);
    const plan = buildShipmentMaterialPlan(rows, balance, normalizeFurnitureKey);
    expect(plan).toHaveLength(0);
  });
});

describe("material card integration", () => {
  it("finds covered demand when stock label differs by punctuation", () => {
    const planRows = buildShipmentMaterialPlan(
      [
        {
          stageKey: "awaiting",
          material: "Сонома / Бардолино",
          key: "a1",
          item: "Стол",
          week: "21",
          qty: 4,
          sheets: 2,
        },
      ],
      makeBalance([["сонома бардолино", { material: "Сонома / Бардолино", needed: 2, available: 20 }]]),
      normalizeFurnitureKey,
    );

    const entry = findShipmentMaterialPlanEntry(planRows, "сонома бардолино", normalizeFurnitureKey);
    expect(entry?.needed).toBe(2);

    const card = buildMaterialCard(
      "сонома бардолино",
      {
        warehouseTableRows: [{ material: "сонома бардолино", qtySheets: 20 }],
        warehouseMaterialPlanRows: planRows.map((row) => ({
          ...row,
          toOrder: row.deficit,
        })),
        warehouseOrderPlanRows: [],
      },
      { normalizeMaterialKey: normalizeFurnitureKey },
    );

    expect(card.needed).toBe(2);
    expect(card.requiredRows).toHaveLength(1);
    expect(card.toOrder).toBe(0);
  });
});
