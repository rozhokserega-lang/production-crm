import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useShipmentTableData } from "./useShipmentTableData.ts";

describe("useShipmentTableData", () => {
  const defaultDeps = {
    view: "shipment",
    rows: [],
    shipmentBoard: { sections: [] },
    shipmentSort: "section",
    weekFilter: "all",
    showAwaiting: true,
    showOnPilka: true,
    showOnKromka: true,
    showOnPras: true,
    showReadyAssembly: true,
    showAwaitShipment: true,
    showShipped: true,
    hiddenShipmentGroups: {},
    shipmentOrderMaps: {},
  };

  it("returns empty rows for non-shipment view", () => {
    const deps = { ...defaultDeps, view: "workshop" };
    const { result } = renderHook(() => useShipmentTableData(deps));
    expect(result.current.shipmentTableRows).toEqual([]);
  });

  it("builds flat rows from shipment board sections", () => {
    const deps = {
      ...defaultDeps,
      shipmentBoard: {
        sections: [
          {
            name: "Кухни",
            items: [
              {
                item: "Стол Компас",
                material: "Egger",
                type: "furniture",
                cells: [
                  { col: "A", week: "2026-W17", qty: 10, sheetsNeeded: 5, bg: "#ffffff", orderId: "A-1" },
                ],
              },
            ],
          },
        ],
      },
    };
    const { result } = renderHook(() => useShipmentTableData(deps));
    expect(result.current.shipmentTableRows).toHaveLength(1);
    const row = result.current.shipmentTableRows[0] as Record<string, unknown>;
    expect(row.sectionName).toBe("Кухни");
    expect(row.qty).toBe(10);
  });

  it("calculates material balance", () => {
    const deps = {
      ...defaultDeps,
      shipmentBoard: {
        sections: [
          {
            name: "Кухни",
            items: [
              {
                item: "Стол",
                material: "Egger White",
                type: "furniture",
                cells: [
                  { col: "A", week: "2026-W17", qty: 10, sheetsNeeded: 5, bg: "#ffffff", orderId: "A-1" },
                ],
              },
            ],
          },
        ],
      },
    };
    const { result } = renderHook(() => useShipmentTableData(deps));
    expect(result.current.shipmentMaterialBalance["стол"]).toBe(10);
  });

  it("adds stock status to rows", () => {
    const deps = {
      ...defaultDeps,
      shipmentBoard: {
        sections: [
          {
            name: "Кухни",
            items: [
              {
                item: "Стол",
                material: "Egger White",
                type: "furniture",
                cells: [
                  { col: "A", week: "2026-W17", qty: 10, sheetsNeeded: 5, bg: "#ffffff", orderId: "A-1" },
                ],
              },
            ],
          },
        ],
      },
    };
    const { result } = renderHook(() => useShipmentTableData(deps));
    const row = result.current.shipmentTableRowsWithStockStatus[0] as Record<string, unknown>;
    expect(row.stockBalance).toBe(10);
    expect(row.hasStock).toBe(true);
  });

  it("extracts group names from rows", () => {
    const deps = {
      ...defaultDeps,
      shipmentBoard: {
        sections: [
          {
            name: "Кухни",
            items: [
              {
                item: "Стол",
                material: "Egger",
                type: "furniture",
                cells: [{ col: "A", week: "2026-W17", qty: 10, sheetsNeeded: 5, bg: "#ffffff", orderId: "A-1" }],
              },
            ],
          },
          {
            name: "Спальни",
            items: [
              {
                item: "Кровать",
                material: "Egger",
                type: "furniture",
                cells: [{ col: "A", week: "2026-W17", qty: 5, sheetsNeeded: 3, bg: "#ffffff", orderId: "A-2" }],
              },
            ],
          },
        ],
      },
    };
    const { result } = renderHook(() => useShipmentTableData(deps));
    expect(result.current.shipmentTableGroupNames).toContain("Кухни");
    expect(result.current.shipmentTableGroupNames).toContain("Спальни");
  });

  it("filters rows by hidden groups", () => {
    const deps = {
      ...defaultDeps,
      shipmentBoard: {
        sections: [
          {
            name: "Кухни",
            items: [
              {
                item: "Стол",
                material: "Egger",
                type: "furniture",
                cells: [{ col: "A", week: "2026-W17", qty: 10, sheetsNeeded: 5, bg: "#ffffff", orderId: "A-1" }],
              },
            ],
          },
        ],
      },
      hiddenShipmentGroups: { Кухни: true },
    };
    const { result } = renderHook(() => useShipmentTableData(deps));
    expect(result.current.visibleShipmentTableRows).toHaveLength(0);
  });

  it("calculates plan deficits", () => {
    const deps = {
      ...defaultDeps,
      shipmentBoard: {
        sections: [
          {
            name: "Кухни",
            items: [
              {
                item: "Стол",
                material: "Egger White",
                type: "furniture",
                cells: [
                  { col: "A", week: "2026-W17", qty: 10, sheetsNeeded: 5, bg: "#ffffff", orderId: "A-1" },
                ],
              },
            ],
          },
        ],
      },
    };
    const { result } = renderHook(() => useShipmentTableData(deps));
    // All rows have stock balance >= qty, so no deficits
    expect(result.current.shipmentPlanDeficits).toHaveLength(0);
  });

  it("filters rows by week", () => {
    const deps = {
      ...defaultDeps,
      weekFilter: "2026-W18",
      shipmentBoard: {
        sections: [
          {
            name: "Кухни",
            items: [
              {
                item: "Стол",
                material: "Egger",
                type: "furniture",
                cells: [
                  { col: "A", week: "2026-W17", qty: 10, sheetsNeeded: 5, bg: "#ffffff", orderId: "A-1" },
                ],
              },
            ],
          },
        ],
      },
    };
    const { result } = renderHook(() => useShipmentTableData(deps));
    expect(result.current.shipmentTableRows).toHaveLength(0);
  });
});
