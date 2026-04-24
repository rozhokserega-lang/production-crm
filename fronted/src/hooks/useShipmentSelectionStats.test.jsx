import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useShipmentSelectionStats } from "./useShipmentSelectionStats";

describe("useShipmentSelectionStats", () => {
  const defaultDeps = {
    selectedShipments: [],
    strapItems: [],
    normalizeFurnitureKey: (key) => String(key || "").toLowerCase().trim(),
    parseStrapSize: (name) => {
      const m = String(name || "").match(/(\d+)\s*[xх]\s*(\d+)/i);
      return m ? { width: Number(m[1]), length: Number(m[2]) } : null;
    },
    strapSheetWidth: 1500,
    strapSheetHeight: 1000,
  };

  it("returns empty summary for no selections", () => {
    const { result } = renderHook(() => useShipmentSelectionStats(defaultDeps));
    expect(result.current.selectedShipmentSummary.items).toEqual([]);
    expect(result.current.selectedShipmentSummary.selectedCount).toBe(0);
    expect(result.current.selectedShipmentSummary.totalSheets).toBe(0);
    expect(result.current.sendableSelectedCount).toBe(0);
  });

  it("calculates summary for selected shipments", () => {
    const deps = {
      ...defaultDeps,
      selectedShipments: [
        { qty: 10, sheetsNeeded: 5, material: "Egger White" },
        { qty: 20, sheetsNeeded: 8, material: "Egger Black" },
      ],
    };
    const { result } = renderHook(() => useShipmentSelectionStats(deps));
    expect(result.current.selectedShipmentSummary.selectedCount).toBe(2);
    expect(result.current.selectedShipmentSummary.totalSheets).toBe(13);
    expect(result.current.selectedShipmentSummary.materials).toHaveLength(2);
  });

  it("calculates sheetsNeeded from outputPerSheet when sheetsRaw is 0", () => {
    const deps = {
      ...defaultDeps,
      selectedShipments: [
        { qty: 25, sheetsNeeded: 0, outputPerSheet: 10, material: "Egger White" },
      ],
    };
    const { result } = renderHook(() => useShipmentSelectionStats(deps));
    expect(result.current.selectedShipmentSummary.totalSheets).toBe(3); // ceil(25/10)
  });

  it("groups materials and sorts by Russian locale", () => {
    const deps = {
      ...defaultDeps,
      selectedShipments: [
        { qty: 10, sheetsNeeded: 5, material: "Белый" },
        { qty: 10, sheetsNeeded: 3, material: "Акрил" },
      ],
    };
    const { result } = renderHook(() => useShipmentSelectionStats(deps));
    expect(result.current.selectedShipmentSummary.materials[0].material).toBe("Акрил");
    expect(result.current.selectedShipmentSummary.materials[1].material).toBe("Белый");
  });

  it("counts sendable items", () => {
    const deps = {
      ...defaultDeps,
      selectedShipments: [
        { qty: 10, canSendToWork: true },
        { qty: 20, canSendToWork: false },
        { qty: 30, canSendToWork: true },
      ],
    };
    const { result } = renderHook(() => useShipmentSelectionStats(deps));
    expect(result.current.sendableSelectedCount).toBe(2);
  });

  it("detects material deficits", () => {
    const deps = {
      ...defaultDeps,
      selectedShipments: [
        { qty: 10, sheetsNeeded: 10, material: "Egger White", availableSheets: 5, row: "1", col: "A" },
      ],
    };
    const { result } = renderHook(() => useShipmentSelectionStats(deps));
    expect(result.current.selectedShipmentStockCheck.deficits).toHaveLength(1);
    expect(result.current.selectedShipmentStockCheck.deficits[0].deficit).toBe(5);
  });

  it("returns empty deficits when stock is sufficient", () => {
    const deps = {
      ...defaultDeps,
      selectedShipments: [
        { qty: 10, sheetsNeeded: 5, material: "Egger White", availableSheets: 10, row: "1", col: "A" },
      ],
    };
    const { result } = renderHook(() => useShipmentSelectionStats(deps));
    expect(result.current.selectedShipmentStockCheck.deficits).toHaveLength(0);
  });

  it("calculates strap sheet requirements", () => {
    const deps = {
      ...defaultDeps,
      strapItems: [
        { name: "100x200", qty: 100 },
      ],
    };
    const { result } = renderHook(() => useShipmentSelectionStats(deps));
    expect(result.current.strapCalculation.lines).toHaveLength(1);
    expect(result.current.strapCalculation.totalSheets).toBeGreaterThan(0);
  });

  it("marks invalid strap sizes", () => {
    const deps = {
      ...defaultDeps,
      strapItems: [
        { name: "2000x3000", qty: 10 }, // larger than sheet
      ],
    };
    const { result } = renderHook(() => useShipmentSelectionStats(deps));
    expect(result.current.strapCalculation.lines[0].invalid).toBe(true);
  });

  it("handles empty strap items", () => {
    const { result } = renderHook(() => useShipmentSelectionStats(defaultDeps));
    expect(result.current.strapCalculation.lines).toEqual([]);
    expect(result.current.strapCalculation.totalSheets).toBe(0);
  });

  it("handles missing material as 'Материал не указан'", () => {
    const deps = {
      ...defaultDeps,
      selectedShipments: [
        { qty: 10, sheetsNeeded: 5 },
      ],
    };
    const { result } = renderHook(() => useShipmentSelectionStats(deps));
    expect(result.current.selectedShipmentSummary.materials[0].material).toBe("Материал не указан");
  });
});
