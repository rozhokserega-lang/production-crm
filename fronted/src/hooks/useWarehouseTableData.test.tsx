import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWarehouseTableData } from "./useWarehouseTableData.ts";

describe("useWarehouseTableData", () => {
  const defaultDeps = {
    view: "warehouse",
    rows: [],
    warehouseStock: [],
    warehouseLeftovers: [],
    warehouseConsumeHistory: [],
    query: "",
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
      warehouseStock: [
        { material: "Egger White", qty: 100, updated_at: "2026-04-24" },
      ],
    };
    const { result } = renderHook(() => useWarehouseTableData(deps));
    expect(result.current.warehouseTableRows).toHaveLength(1);
    const row = result.current.warehouseTableRows[0] as Record<string, unknown>;
    expect(row.material).toBe("Egger White");
    expect(row.qty).toBe(100);
  });

  it("filters warehouse rows by query", () => {
    const deps = {
      ...defaultDeps,
      warehouseStock: [
        { material: "Egger White", qty: 100 },
        { material: "Egger Black", qty: 50 },
      ],
      query: "white",
    };
    const { result } = renderHook(() => useWarehouseTableData(deps));
    expect(result.current.warehouseTableRows).toHaveLength(1);
    const row = result.current.warehouseTableRows[0] as Record<string, unknown>;
    expect(row.material).toBe("Egger White");
  });

  it("builds leftovers table rows", () => {
    const deps = {
      ...defaultDeps,
      warehouseLeftovers: [
        { orderId: "A-1", material: "Egger", qty: 2, updatedAt: "2026-04-24" },
      ],
    };
    const { result } = renderHook(() => useWarehouseTableData(deps));
    expect(result.current.leftoversTableRows).toHaveLength(1);
    const row = result.current.leftoversTableRows[0] as Record<string, unknown>;
    expect(row.material).toBe("Egger");
  });

  it("filters leftovers by query", () => {
    const deps = {
      ...defaultDeps,
      warehouseLeftovers: [
        { orderId: "A-1", material: "Egger White", qty: 2 },
        { orderId: "A-2", material: "Egger Black", qty: 3 },
      ],
      query: "white",
    };
    const { result } = renderHook(() => useWarehouseTableData(deps));
    expect(result.current.leftoversTableRows).toHaveLength(1);
  });

  it("builds consume history rows", () => {
    const deps = {
      ...defaultDeps,
      warehouseConsumeHistory: [
        { move_id: "m1", created_at: "2026-04-24T10:00:00Z", order_id: "A-1", material: "Egger White", qty: 5, comment: "Test" },
      ],
    };
    const { result } = renderHook(() => useWarehouseTableData(deps));
    expect(result.current.consumeHistoryTableRows).toHaveLength(1);
    const row = result.current.consumeHistoryTableRows[0] as Record<string, unknown>;
    expect(row.material).toBe("Egger White");
  });

  it("filters consume history by query", () => {
    const deps = {
      ...defaultDeps,
      warehouseConsumeHistory: [
        { move_id: "m1", created_at: "2026-04-24T10:00:00Z", order_id: "A-1", material: "Egger White", qty: 5 },
        { move_id: "m2", created_at: "2026-04-24T12:00:00Z", order_id: "A-2", material: "Egger Black", qty: 3 },
      ],
      query: "A-1",
    };
    const { result } = renderHook(() => useWarehouseTableData(deps));
    expect(result.current.consumeHistoryTableRows).toHaveLength(1);
  });
});
