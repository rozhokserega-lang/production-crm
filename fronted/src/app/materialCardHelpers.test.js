import { describe, expect, it } from "vitest";
import { buildMaterialCard } from "./materialCardHelpers";

describe("buildMaterialCard", () => {
  it("joins stock, demand, blockers and consumption history by material", () => {
    const card = buildMaterialCard(
      "Дуб",
      {
        warehouseTableRows: [
          { material: "Дуб", qtySheets: 4, sizeLabel: "2800x2070", updatedAt: "2026-05-10T10:00:00Z" },
          { material: "дуб", qtySheets: 2, sizeLabel: "2440x1220", updatedAt: "2026-05-11T10:00:00Z" },
        ],
        warehouseOrderPlanRows: [
          {
            material: "Дуб",
            needed: 9,
            available: 6,
            toOrder: 3,
            firstWeek: "21",
            blockedCount: 1,
            weeks: [
              {
                week: "21",
                needed: 7,
                deficit: 1,
                rows: [{ orderId: "100", item: "Стол", week: "21", sheets: 7 }],
              },
            ],
            blockerRows: [{ orderId: "100", item: "Стол", week: "21", sheets: 7, shortage: 1 }],
          },
        ],
        warehouseMaterialPlanRows: [
          {
            material: "Дуб",
            needed: 9,
            available: 6,
            toOrder: 3,
            firstWeek: "21",
            weeks: [
              {
                week: "21",
                needed: 7,
                deficit: 1,
                rows: [{ orderId: "100", item: "Стол", week: "21", sheets: 7 }],
              },
            ],
          },
          {
            material: "Ясень",
            needed: 5,
            available: 20,
            toOrder: 0,
            firstWeek: "22",
            weeks: [
              {
                week: "22",
                needed: 5,
                deficit: 0,
                rows: [{ orderId: "101", item: "Полка", week: "22", sheets: 5 }],
              },
            ],
          },
        ],
        consumeHistoryTableRows: [
          { rowType: "consume", material: "Дуб", qtySheets: 3, createdAt: "2026-05-10T10:00:00Z" },
          { rowType: "consume", material: "Ясень", qtySheets: 9, createdAt: "2026-05-10T10:00:00Z" },
        ],
        leftoversTableRows: [
          { material: "Дуб", leftoversQty: 1, leftoverFormat: "500x600", createdAt: "2026-05-10T11:00:00Z" },
        ],
      },
      { now: new Date("2026-05-21T10:00:00Z") },
    );

    expect(card.stockTotal).toBe(6);
    expect(card.toOrder).toBe(3);
    expect(card.requiredRows).toHaveLength(1);
    expect(card.blockerRows).toHaveLength(1);
    expect(card.historyRows).toHaveLength(1);
    expect(card.leftoverRows).toHaveLength(1);
    expect(card.consumedLast30Days).toBe(3);
    expect(card.daysLeft).toBe(60);
  });

  it("shows plan demand even when stock is enough", () => {
    const card = buildMaterialCard("Ясень", {
      warehouseTableRows: [{ material: "Ясень", qtySheets: 20 }],
      warehouseMaterialPlanRows: [
        {
          material: "Ясень",
          needed: 5,
          available: 20,
          toOrder: 0,
          weeks: [
            {
              week: "22",
              needed: 5,
              deficit: 0,
              rows: [{ orderId: "101", item: "Полка", week: "22", sheets: 5 }],
            },
          ],
        },
      ],
      warehouseOrderPlanRows: [],
    });

    expect(card.needed).toBe(5);
    expect(card.toOrder).toBe(0);
    expect(card.requiredRows).toHaveLength(1);
  });
});
