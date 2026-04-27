import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWarehouseOrderPlanRows } from "./useWarehouseOrderPlanRows.ts";

describe("useWarehouseOrderPlanRows", () => {
  const defaultDeps = {
    view: "warehouse",
    shipmentBoard: { sections: [] },
  };

  it("returns empty array when no data", () => {
    const { result } = renderHook(() => useWarehouseOrderPlanRows(defaultDeps));
    expect(result.current.warehouseOrderPlanRows).toEqual([]);
  });

  it("returns empty array for non-warehouse view", () => {
    const { result } = renderHook(() =>
      useWarehouseOrderPlanRows({ ...defaultDeps, view: "workshop" }),
    );
    expect(result.current.warehouseOrderPlanRows).toEqual([]);
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
                  { qty: 10 },
                ],
              },
            ],
          },
        ],
      },
    };
    const { result } = renderHook(() => useWarehouseOrderPlanRows(deps));
    expect(result.current.warehouseOrderPlanRows).toHaveLength(1);
    const row = result.current.warehouseOrderPlanRows[0] as Record<string, unknown>;
    expect(row.material).toBe("Egger White");
    expect(row.totalQty).toBe(10);
  });

  it("aggregates quantities by material", () => {
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
                  { qty: 10 },
                  { qty: 5 },
                ],
              },
            ],
          },
        ],
      },
    };
    const { result } = renderHook(() => useWarehouseOrderPlanRows(deps));
    expect(result.current.warehouseOrderPlanRows).toHaveLength(1);
    const row = result.current.warehouseOrderPlanRows[0] as Record<string, unknown>;
    expect(row.totalQty).toBe(15);
  });

  it("sorts by material name (Russian locale)", () => {
    const deps = {
      ...defaultDeps,
      shipmentBoard: {
        sections: [
          {
            name: "Разное",
            items: [
              {
                item: "Стол",
                material: "Белый",
                cells: [{ qty: 10 }],
              },
              {
                item: "Стул",
                material: "Акрил",
                cells: [{ qty: 3 }],
              },
            ],
          },
        ],
      },
    };
    const { result } = renderHook(() => useWarehouseOrderPlanRows(deps));
    const rows = result.current.warehouseOrderPlanRows as Record<string, unknown>[];
    expect(rows[0].material).toBe("Акрил");
    expect(rows[1].material).toBe("Белый");
  });

  it("handles missing material gracefully", () => {
    const deps = {
      ...defaultDeps,
      shipmentBoard: {
        sections: [
          {
            name: "Разное",
            items: [
              {
                item: "Стол",
                cells: [
                  { qty: 10 },
                ],
              },
            ],
          },
        ],
      },
    };
    const { result } = renderHook(() => useWarehouseOrderPlanRows(deps));
    expect(result.current.warehouseOrderPlanRows).toHaveLength(1);
  });
});
