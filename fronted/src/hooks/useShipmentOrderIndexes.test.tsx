import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useShipmentOrderIndexes } from "./useShipmentOrderIndexes";

describe("useShipmentOrderIndexes", () => {
  it("builds empty maps when no data provided", () => {
    const { result } = renderHook(() =>
      useShipmentOrderIndexes({ shipmentOrders: [], rows: [] }),
    );
    const byRowWeek = (result.current.shipmentOrderMaps as Record<string, Map<string, unknown>>).byRowWeek;
    const byItemWeek = (result.current.shipmentOrderMaps as Record<string, Map<string, unknown>>).byItemWeek;
    expect(byRowWeek.size).toBe(0);
    expect(byItemWeek.size).toBe(0);
    expect(result.current.orderIndexById.size).toBe(0);
  });

  it("indexes shipment orders by row+week and item+week", () => {
    const shipmentOrders = [
      { sourceRowId: "row1", week: "2026-W17", item: "Стол", qty: 5 },
      { sourceRowId: "row2", week: "2026-W18", item: "Стул", qty: 10 },
    ];
    const { result } = renderHook(() =>
      useShipmentOrderIndexes({ shipmentOrders, rows: [] }),
    );
    const maps = result.current.shipmentOrderMaps as Record<string, Map<string, unknown>>;
    expect(maps.byRowWeek.size).toBe(2);
    expect(maps.byItemWeek.size).toBe(2);
  });

  it("builds orderIndexById from both rows and shipmentOrders", () => {
    const rows = [{ orderId: "A-1", name: "Order A" }];
    const shipmentOrders = [{ orderId: "B-1", name: "Order B" }];
    const { result } = renderHook(() =>
      useShipmentOrderIndexes({ shipmentOrders, rows }),
    );
    expect(result.current.orderIndexById.size).toBe(2);
    expect((result.current.orderIndexById.get("A-1") as Record<string, unknown>).name).toBe("Order A");
    expect((result.current.orderIndexById.get("B-1") as Record<string, unknown>).name).toBe("Order B");
  });

  it("prefers newer shipment order when merging by row+week", () => {
    const shipmentOrders = [
      { sourceRowId: "row1", week: "2026-W17", qty: 5, updatedAt: "2026-04-24T10:00:00Z" },
      { sourceRowId: "row1", week: "2026-W17", qty: 8, updatedAt: "2026-04-24T11:00:00Z" },
    ];
    const { result } = renderHook(() =>
      useShipmentOrderIndexes({ shipmentOrders, rows: [] }),
    );
    const key = "row1|2026-W17";
    const maps = result.current.shipmentOrderMaps as Record<string, Map<string, unknown>>;
    expect((maps.byRowWeek.get(key) as Record<string, unknown>).qty).toBe(8);
  });

  it("handles snake_case field names in shipment orders", () => {
    const shipmentOrders = [
      { source_row_id: "row1", week: "2026-W17", item: "Стол" },
    ];
    const { result } = renderHook(() =>
      useShipmentOrderIndexes({ shipmentOrders, rows: [] }),
    );
    const maps = result.current.shipmentOrderMaps as Record<string, Map<string, unknown>>;
    expect(maps.byRowWeek.size).toBe(1);
  });

  it("skips orders without week", () => {
    const shipmentOrders = [
      { sourceRowId: "row1", item: "Стол" },
    ];
    const { result } = renderHook(() =>
      useShipmentOrderIndexes({ shipmentOrders, rows: [] }),
    );
    const maps = result.current.shipmentOrderMaps as Record<string, Map<string, unknown>>;
    expect(maps.byRowWeek.size).toBe(0);
  });

  it("deduplicates orderIndexById by orderId", () => {
    const rows = [{ orderId: "A-1", name: "From rows" }];
    const shipmentOrders = [{ orderId: "A-1", name: "From shipment" }];
    const { result } = renderHook(() =>
      useShipmentOrderIndexes({ shipmentOrders, rows }),
    );
    // First one wins (from rows)
    expect((result.current.orderIndexById.get("A-1") as Record<string, unknown>).name).toBe("From rows");
  });

  it("handles order_id (snake_case) in rows", () => {
    const rows = [{ order_id: "A-1", name: "Snake case" }];
    const { result } = renderHook(() =>
      useShipmentOrderIndexes({ shipmentOrders: [], rows }),
    );
    expect((result.current.orderIndexById.get("A-1") as Record<string, unknown>).name).toBe("Snake case");
  });
});
