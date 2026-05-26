import { describe, expect, it } from "vitest";
import {
  buildShipmentMaterialPlan,
  findShipmentMaterialPlanEntry,
  materialPlanTotals,
} from "./shipmentMaterialPlanHelpers";
import { normalizeFurnitureKey } from "../utils/furnitureUtils";
import { buildMaterialCard } from "./materialCardHelpers";

function makeBalance(entries) {
  return new Map(entries.map(([key, value]) => [key, value]));
}

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
