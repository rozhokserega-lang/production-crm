import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useShipmentSelectionStats } from "./useShipmentSelectionStats.ts";

describe("useShipmentSelectionStats", () => {
  const defaultDeps = {
    selectedShipments: [],
    shipmentTableRows: [],
    shipmentTableRowsWithStockStatus: [],
    shipmentMaterialBalance: {},
    shipmentPlanDeficits: [],
  };

  it("returns empty summary for no selections", () => {
    const { result } = renderHook(() => useShipmentSelectionStats(defaultDeps));
    expect(result.current.selectedShipmentSummary.total).toBe(0);
    expect(result.current.selectedShipmentSummary.totalQty).toBe(0);
    expect(result.current.selectedShipmentSummary.totalWeight).toBe(0);
    expect(result.current.selectedShipmentSummary.totalVolume).toBe(0);
    expect(result.current.sendableSelectedCount).toBe(0);
  });

  it("calculates summary for selected shipments", () => {
    const deps = {
      ...defaultDeps,
      selectedShipments: [
        { qty: 10, weight: 5, volume: 2 },
        { qty: 20, weight: 8, volume: 3 },
      ],
    };
    const { result } = renderHook(() => useShipmentSelectionStats(deps));
    expect(result.current.selectedShipmentSummary.total).toBe(2);
    expect(result.current.selectedShipmentSummary.totalQty).toBe(30);
    expect(result.current.selectedShipmentSummary.totalWeight).toBe(13);
    expect(result.current.selectedShipmentSummary.totalVolume).toBe(5);
  });

  it("counts sendable items", () => {
    const deps = {
      ...defaultDeps,
      selectedShipments: [
        { qty: 10, sendable: true },
        { qty: 20, sendable: false },
        { qty: 30, sendable: true },
      ],
    };
    const { result } = renderHook(() => useShipmentSelectionStats(deps));
    expect(result.current.sendableSelectedCount).toBe(2);
  });

  it("detects material deficits", () => {
    const deps = {
      ...defaultDeps,
      selectedShipments: [
        { item: "Стол", qty: 10 },
      ],
      shipmentMaterialBalance: { "стол": 5 },
    };
    const { result } = renderHook(() => useShipmentSelectionStats(deps));
    const check = result.current.selectedShipmentStockCheck as Record<string, unknown>[];
    expect(check).toHaveLength(1);
    expect((check[0] as Record<string, unknown>).stockBalance).toBe(5);
    expect((check[0] as Record<string, unknown>).hasStock).toBe(false);
  });

  it("returns sufficient stock when balance >= qty", () => {
    const deps = {
      ...defaultDeps,
      selectedShipments: [
        { item: "Стол", qty: 5 },
      ],
      shipmentMaterialBalance: { "стол": 10 },
    };
    const { result } = renderHook(() => useShipmentSelectionStats(deps));
    const check = result.current.selectedShipmentStockCheck as Record<string, unknown>[];
    expect((check[0] as Record<string, unknown>).hasStock).toBe(true);
  });

  it("calculates strap sheet requirements", () => {
    const deps = {
      ...defaultDeps,
      selectedShipments: [
        { type: "strap", item: "100x200", qty: 100, weight: 50 },
      ],
    };
    const { result } = renderHook(() => useShipmentSelectionStats(deps));
    const strap = result.current.strapCalculation as Record<string, unknown>[];
    expect(strap).toHaveLength(1);
    expect((strap[0] as Record<string, unknown>).itemName).toBe("100x200");
  });

  it("handles empty strap items", () => {
    const { result } = renderHook(() => useShipmentSelectionStats(defaultDeps));
    const strap = result.current.strapCalculation as Record<string, unknown>[];
    expect(strap).toEqual([]);
  });

  it("handles missing material as empty stock balance", () => {
    const deps = {
      ...defaultDeps,
      selectedShipments: [
        { item: "Unknown", qty: 10 },
      ],
    };
    const { result } = renderHook(() => useShipmentSelectionStats(deps));
    const check = result.current.selectedShipmentStockCheck as Record<string, unknown>[];
    expect((check[0] as Record<string, unknown>).stockBalance).toBe(0);
  });
});
