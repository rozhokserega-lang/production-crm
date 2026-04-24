import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWarehouseTableData } from "./useWarehouseTableData";

describe("useWarehouseTableData", () => {
  const defaultDeps = {
    view: "warehouse",
    query: "",
    warehouseRows: [],
    leftoversRows: [],
    leftoversHistoryRows: [],
    consumeHistoryRows: [],
    pilkaDoneHistoryRows: [],
  };

  it("returns empty arrays for non-warehouse view", () => {
    const deps = { ...defaultDeps, view: "shipment" };
    const { result } = renderHook(() => useWarehouseTableData(deps));
    expect(result.current.warehouseTableRows).toEqual([]);
    expect(result.current.leftoversTableRows).toEqual([]);
    expect(result.current.consumeHistoryTableRows).toEqual([]);
  });

  it("builds warehouse table rows with normalization", () => {
    const deps = {
      ...defaultDeps,
      warehouseRows: [
        { material: "Egger White", qty_sheets: 100, size_label: "1500x1000", sheet_width_mm: 1500, sheet_height_mm: 1000, updated_at: "2026-04-24" },
      ],
    };
    const { result } = renderHook(() => useWarehouseTableData(deps));
    expect(result.current.warehouseTableRows).toHaveLength(1);
    expect(result.current.warehouseTableRows[0].material).toBe("Egger White");
    expect(result.current.warehouseTableRows[0].qtySheets).toBe(100);
  });

  it("filters warehouse rows by query", () => {
    const deps = {
      ...defaultDeps,
      warehouseRows: [
        { material: "Egger White", qty_sheets: 100 },
        { material: "Egger Black", qty_sheets: 50 },
      ],
      query: "white",
    };
    const { result } = renderHook(() => useWarehouseTableData(deps));
    expect(result.current.warehouseTableRows).toHaveLength(1);
    expect(result.current.warehouseTableRows[0].material).toBe("Egger White");
  });

  it("sorts warehouse rows by material (Russian locale)", () => {
    const deps = {
      ...defaultDeps,
      warehouseRows: [
        { material: "Белый", qty_sheets: 10 },
        { material: "Акрил", qty_sheets: 20 },
      ],
    };
    const { result } = renderHook(() => useWarehouseTableData(deps));
    expect(result.current.warehouseTableRows[0].material).toBe("Акрил");
    expect(result.current.warehouseTableRows[1].material).toBe("Белый");
  });

  it("builds leftovers table rows", () => {
    const deps = {
      ...defaultDeps,
      leftoversRows: [
        { orderId: "A-1", item: "Стол", material: "Egger", sheetsNeeded: 5, leftoverFormat: "300x400", leftoversQty: 2, createdAt: "2026-04-24" },
      ],
    };
    const { result } = renderHook(() => useWarehouseTableData(deps));
    expect(result.current.leftoversTableRows).toHaveLength(1);
    expect(result.current.leftoversTableRows[0].orderId).toBe("A-1");
  });

  it("filters leftovers by query", () => {
    const deps = {
      ...defaultDeps,
      leftoversRows: [
        { orderId: "A-1", item: "Стол", material: "Egger White", leftoverFormat: "300x400", leftoversQty: 2 },
        { orderId: "A-2", item: "Стул", material: "Egger Black", leftoverFormat: "500x600", leftoversQty: 3 },
      ],
      query: "white",
    };
    const { result } = renderHook(() => useWarehouseTableData(deps));
    expect(result.current.leftoversTableRows).toHaveLength(1);
  });

  it("builds consume history with consume, leftover, and pilka_done rows", () => {
    const deps = {
      ...defaultDeps,
      consumeHistoryRows: [
        { move_id: "m1", created_at: "2026-04-24T10:00:00Z", order_id: "A-1", material: "Egger White", qty_sheets: 5, comment: "Test" },
      ],
      leftoversHistoryRows: [],
      pilkaDoneHistoryRows: [],
    };
    const { result } = renderHook(() => useWarehouseTableData(deps));
    expect(result.current.consumeHistoryTableRows).toHaveLength(1);
    expect(result.current.consumeHistoryTableRows[0].rowType).toBe("consume");
  });

  it("includes pilka_done rows when consume is missing", () => {
    const deps = {
      ...defaultDeps,
      consumeHistoryRows: [],
      leftoversHistoryRows: [],
      pilkaDoneHistoryRows: [
        { id: "p1", created_at: "2026-04-24T10:00:00Z", entity_id: "A-1", details: { material: "Egger White" } },
      ],
    };
    const { result } = renderHook(() => useWarehouseTableData(deps));
    const pilkaRows = result.current.consumeHistoryTableRows.filter((r) => r.rowType === "pilka_done");
    expect(pilkaRows).toHaveLength(1);
    expect(pilkaRows[0].comment).toBe("Без списания");
  });

  it("excludes pilka_done rows when consume exists for same order", () => {
    const deps = {
      ...defaultDeps,
      consumeHistoryRows: [
        { move_id: "m1", created_at: "2026-04-24T10:00:00Z", order_id: "A-1", material: "Egger", qty_sheets: 5 },
      ],
      leftoversHistoryRows: [],
      pilkaDoneHistoryRows: [
        { id: "p1", created_at: "2026-04-24T09:00:00Z", entity_id: "A-1", details: { material: "Egger" } },
      ],
    };
    const { result } = renderHook(() => useWarehouseTableData(deps));
    const pilkaRows = result.current.consumeHistoryTableRows.filter((r) => r.rowType === "pilka_done");
    expect(pilkaRows).toHaveLength(0);
  });

  it("sorts consume history by createdAt descending", () => {
    const deps = {
      ...defaultDeps,
      consumeHistoryRows: [
        { move_id: "m1", created_at: "2026-04-24T10:00:00Z", order_id: "A-1", material: "Egger", qty_sheets: 5 },
        { move_id: "m2", created_at: "2026-04-24T12:00:00Z", order_id: "A-2", material: "Egger", qty_sheets: 3 },
      ],
      leftoversHistoryRows: [],
      pilkaDoneHistoryRows: [],
    };
    const { result } = renderHook(() => useWarehouseTableData(deps));
    expect(result.current.consumeHistoryTableRows[0].moveId).toBe("m2");
    expect(result.current.consumeHistoryTableRows[1].moveId).toBe("m1");
  });
});
