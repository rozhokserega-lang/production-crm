import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWarehouseOrderPlanRows } from "./useWarehouseOrderPlanRows";

describe("useWarehouseOrderPlanRows", () => {
  const defaultDeps = {
    shipmentBoard: { sections: [] },
    materialsStockRows: [],
    getMaterialLabel: (item, material) => String(material || item || "Материал не указан"),
    normalizeFurnitureKey: (key) => String(key || "").toLowerCase().trim(),
  };

  it("returns empty array when no data", () => {
    const { result } = renderHook(() => useWarehouseOrderPlanRows(defaultDeps));
    expect(result.current).toEqual([]);
  });

  it("calculates material needs from shipment board", () => {
    const deps = {
      ...defaultDeps,
      shipmentBoard: {
        sections: [
          {
            name: "Кухни",
            items: [
              {
                item: "Стол Компас",
                material: "Egger White",
                cells: [
                  { qty: 10, sheetsNeeded: 5, canSendToWork: true, inWork: false },
                ],
              },
            ],
          },
        ],
      },
    };
    const { result } = renderHook(() => useWarehouseOrderPlanRows(deps));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].material).toBe("Egger White");
    expect(result.current[0].needed).toBe(5);
  });

  it("excludes items already in work", () => {
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
                cells: [
                  { qty: 10, sheetsNeeded: 5, canSendToWork: true, inWork: true },
                ],
              },
            ],
          },
        ],
      },
    };
    const { result } = renderHook(() => useWarehouseOrderPlanRows(deps));
    expect(result.current).toEqual([]);
  });

  it("excludes items that cannot be sent to work", () => {
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
                cells: [
                  { qty: 10, sheetsNeeded: 5, canSendToWork: false, inWork: false },
                ],
              },
            ],
          },
        ],
      },
    };
    const { result } = renderHook(() => useWarehouseOrderPlanRows(deps));
    expect(result.current).toEqual([]);
  });

  it("calculates sheetsNeeded from outputPerSheet when sheetsRaw is 0", () => {
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
                cells: [
                  { qty: 25, sheetsNeeded: 0, outputPerSheet: 10, canSendToWork: true, inWork: false },
                ],
              },
            ],
          },
        ],
      },
    };
    const { result } = renderHook(() => useWarehouseOrderPlanRows(deps));
    expect(result.current[0].needed).toBe(3); // ceil(25/10)
  });

  it("subtracts available stock from needed", () => {
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
                cells: [
                  { qty: 10, sheetsNeeded: 10, canSendToWork: true, inWork: false },
                ],
              },
            ],
          },
        ],
      },
      materialsStockRows: [
        { material: "Egger White", qty_sheets: 4 },
      ],
    };
    const { result } = renderHook(() => useWarehouseOrderPlanRows(deps));
    expect(result.current[0].toOrder).toBe(6); // 10 - 4
  });

  it("filters out materials with zero toOrder", () => {
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
                cells: [
                  { qty: 10, sheetsNeeded: 5, canSendToWork: true, inWork: false },
                ],
              },
            ],
          },
        ],
      },
      materialsStockRows: [
        { material: "Egger White", qty_sheets: 10 },
      ],
    };
    const { result } = renderHook(() => useWarehouseOrderPlanRows(deps));
    expect(result.current).toEqual([]);
  });

  it("sorts by toOrder descending then material name", () => {
    const deps = {
      ...defaultDeps,
      shipmentBoard: {
        sections: [
          {
            name: "Разное",
            items: [
              {
                item: "Стол",
                material: "Акрил",
                cells: [
                  { qty: 10, sheetsNeeded: 3, canSendToWork: true, inWork: false },
                ],
              },
              {
                item: "Стул",
                material: "Белый",
                cells: [
                  { qty: 10, sheetsNeeded: 10, canSendToWork: true, inWork: false },
                ],
              },
            ],
          },
        ],
      },
    };
    const { result } = renderHook(() => useWarehouseOrderPlanRows(deps));
    expect(result.current[0].material).toBe("Белый"); // 10 needed, higher toOrder
    expect(result.current[1].material).toBe("Акрил"); // 3 needed
  });

  it("handles missing material label gracefully", () => {
    const deps = {
      ...defaultDeps,
      getMaterialLabel: () => "Материал не указан",
      shipmentBoard: {
        sections: [
          {
            name: "Разное",
            items: [
              {
                item: "Стол",
                cells: [
                  { qty: 10, sheetsNeeded: 5, canSendToWork: true, inWork: false },
                ],
              },
            ],
          },
        ],
      },
    };
    const { result } = renderHook(() => useWarehouseOrderPlanRows(deps));
    expect(result.current[0].material).toBe("Материал не указан");
  });
});
