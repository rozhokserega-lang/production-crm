import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useShipmentTableData } from "./useShipmentTableData";

describe("useShipmentTableData", () => {
  const defaultDeps = {
    view: "shipment",
    shipmentRenderSections: [],
    shipmentOrderMaps: { byRowWeek: new Map(), byItemWeek: new Map() },
    visibleCellsForItem: () => [],
    getShipmentStageKey: () => "awaiting",
    stageBg: () => "#ffffff",
    stageLabel: () => "Ожидаю заказ",
    normalizeFurnitureKey: (key) => String(key || "").toLowerCase().trim(),
    hiddenShipmentGroups: {},
  };

  it("returns empty rows for non-shipment view", () => {
    const deps = { ...defaultDeps, view: "workshop" };
    const { result } = renderHook(() => useShipmentTableData(deps));
    expect(result.current.shipmentTableRows).toEqual([]);
  });

  it("builds flat rows from shipment render sections", () => {
    const deps = {
      ...defaultDeps,
      shipmentRenderSections: [
        {
          name: "Кухни",
          items: [
            {
              item: "Стол Компас",
              sourceRowId: "1",
              row: "1",
              material: "Egger",
              cells: [
                { col: "A", week: "2026-W17", qty: 10, sheetsNeeded: 5, bg: "#ffffff" },
              ],
            },
          ],
        },
      ],
      visibleCellsForItem: (it) => it.cells || [],
      getShipmentStageKey: () => "awaiting",
    };
    const { result } = renderHook(() => useShipmentTableData(deps));
    expect(result.current.shipmentTableRows).toHaveLength(1);
    expect(result.current.shipmentTableRows[0].section).toBe("Кухни");
    expect(result.current.shipmentTableRows[0].qty).toBe(10);
    expect(result.current.shipmentTableRows[0].sheets).toBe(5);
  });

  it("calculates material balance for awaiting rows", () => {
    const deps = {
      ...defaultDeps,
      shipmentRenderSections: [
        {
          name: "Кухни",
          items: [
            {
              item: "Стол",
              sourceRowId: "1",
              row: "1",
              material: "Egger White",
              cells: [
                { col: "A", week: "2026-W17", qty: 10, sheetsNeeded: 5, bg: "#ffffff" },
              ],
            },
          ],
        },
      ],
      visibleCellsForItem: (it) => it.cells || [],
      getShipmentStageKey: () => "awaiting",
    };
    const { result } = renderHook(() => useShipmentTableData(deps));
    expect(result.current.shipmentMaterialBalance.size).toBe(1);
    const balance = result.current.shipmentMaterialBalance.get("egger white");
    expect(balance.needed).toBe(5);
  });

  it("filters out non-awaiting rows from material balance", () => {
    const deps = {
      ...defaultDeps,
      shipmentRenderSections: [
        {
          name: "Кухни",
          items: [
            {
              item: "Стол",
              sourceRowId: "1",
              row: "1",
              material: "Egger White",
              cells: [
                { col: "A", week: "2026-W17", qty: 10, sheetsNeeded: 5, bg: "#ffffff" },
              ],
            },
          ],
        },
      ],
      visibleCellsForItem: (it) => it.cells || [],
      getShipmentStageKey: () => "shipped",
    };
    const { result } = renderHook(() => useShipmentTableData(deps));
    expect(result.current.shipmentMaterialBalance.size).toBe(0);
  });

  it("adds stock status to rows", () => {
    const deps = {
      ...defaultDeps,
      shipmentRenderSections: [
        {
          name: "Кухни",
          items: [
            {
              item: "Стол",
              sourceRowId: "1",
              row: "1",
              material: "Egger White",
              cells: [
                { col: "A", week: "2026-W17", qty: 10, sheetsNeeded: 5, availableSheets: 3, bg: "#ffffff" },
              ],
            },
          ],
        },
      ],
      visibleCellsForItem: (it) => it.cells || [],
      getShipmentStageKey: () => "awaiting",
    };
    const { result } = renderHook(() => useShipmentTableData(deps));
    const row = result.current.shipmentTableRowsWithStockStatus[0];
    expect(row.materialDeficit).toBeGreaterThan(0);
    expect(row.materialHasDeficit).toBe(true);
  });

  it("extracts group names from rows", () => {
    const deps = {
      ...defaultDeps,
      shipmentRenderSections: [
        {
          name: "Кухни",
          items: [
            {
              item: "Стол",
              sourceRowId: "1",
              row: "1",
              material: "Egger",
              cells: [{ col: "A", week: "2026-W17", qty: 10, sheetsNeeded: 5, bg: "#ffffff" }],
            },
          ],
        },
        {
          name: "Спальни",
          items: [
            {
              item: "Кровать",
              sourceRowId: "2",
              row: "2",
              material: "Egger",
              cells: [{ col: "A", week: "2026-W17", qty: 5, sheetsNeeded: 3, bg: "#ffffff" }],
            },
          ],
        },
      ],
      visibleCellsForItem: (it) => it.cells || [],
      getShipmentStageKey: () => "awaiting",
    };
    const { result } = renderHook(() => useShipmentTableData(deps));
    expect(result.current.shipmentTableGroupNames).toContain("Кухни");
    expect(result.current.shipmentTableGroupNames).toContain("Спальни");
  });

  it("filters rows by hidden groups", () => {
    const deps = {
      ...defaultDeps,
      shipmentRenderSections: [
        {
          name: "Кухни",
          items: [
            {
              item: "Стол",
              sourceRowId: "1",
              row: "1",
              material: "Egger",
              cells: [{ col: "A", week: "2026-W17", qty: 10, sheetsNeeded: 5, bg: "#ffffff" }],
            },
          ],
        },
      ],
      visibleCellsForItem: (it) => it.cells || [],
      getShipmentStageKey: () => "awaiting",
      hiddenShipmentGroups: { Кухни: true },
    };
    const { result } = renderHook(() => useShipmentTableData(deps));
    expect(result.current.visibleShipmentTableRows).toHaveLength(0);
  });

  it("calculates plan deficits", () => {
    const deps = {
      ...defaultDeps,
      shipmentRenderSections: [
        {
          name: "Кухни",
          items: [
            {
              item: "Стол",
              sourceRowId: "1",
              row: "1",
              material: "Egger White",
              cells: [
                { col: "A", week: "2026-W17", qty: 10, sheetsNeeded: 5, availableSheets: 2, bg: "#ffffff" },
              ],
            },
          ],
        },
      ],
      visibleCellsForItem: (it) => it.cells || [],
      getShipmentStageKey: () => "awaiting",
    };
    const { result } = renderHook(() => useShipmentTableData(deps));
    expect(result.current.shipmentPlanDeficits).toHaveLength(1);
    expect(result.current.shipmentPlanDeficits[0].deficit).toBe(3);
  });
});
