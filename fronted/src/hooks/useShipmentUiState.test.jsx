import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useShipmentUiState } from "./useShipmentUiState";

const defaultPrefs = {
  weekFilter: "all",
  showAwaiting: true,
  showOnPilka: true,
  showOnKromka: true,
  showOnPras: true,
  showReadyAssembly: true,
  showAwaitShipment: true,
  showShipped: false,
  shipmentSort: "default",
  collapsedSections: {},
};

describe("useShipmentUiState", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("initializes with default preferences", () => {
    const { result } = renderHook(() => useShipmentUiState(defaultPrefs));
    expect(result.current.selectedShipments).toEqual([]);
    expect(result.current.planPreviews).toEqual([]);
    expect(result.current.weekFilter).toBe("all");
    expect(result.current.showAwaiting).toBe(true);
    expect(result.current.showShipped).toBe(false);
    expect(result.current.shipmentViewMode).toBe("table");
  });

  it("setSelectedShipments updates selection", () => {
    const { result } = renderHook(() => useShipmentUiState(defaultPrefs));
    const items = [{ id: 1, qty: 5 }];
    act(() => {
      result.current.setSelectedShipments(items);
    });
    expect(result.current.selectedShipments).toEqual(items);
  });

  it("setWeekFilter updates week filter", () => {
    const { result } = renderHook(() => useShipmentUiState(defaultPrefs));
    act(() => {
      result.current.setWeekFilter("2026-W17");
    });
    expect(result.current.weekFilter).toBe("2026-W17");
  });

  it("resetShipmentFilters restores defaults", () => {
    const { result } = renderHook(() => useShipmentUiState(defaultPrefs));
    act(() => {
      result.current.setWeekFilter("2026-W17");
      result.current.setShowShipped(true);
    });
    expect(result.current.weekFilter).toBe("2026-W17");
    expect(result.current.showShipped).toBe(true);
    act(() => {
      result.current.resetShipmentFilters();
    });
    expect(result.current.weekFilter).toBe("all");
    expect(result.current.showShipped).toBe(false);
  });

  it("isSectionCollapsed returns false for non-collapsed section", () => {
    const { result } = renderHook(() => useShipmentUiState(defaultPrefs));
    expect(result.current.isSectionCollapsed("Section A")).toBe(false);
  });

  it("toggleSectionCollapsed toggles section state", () => {
    const { result } = renderHook(() => useShipmentUiState(defaultPrefs));
    act(() => {
      result.current.toggleSectionCollapsed("Section A");
    });
    expect(result.current.isSectionCollapsed("Section A")).toBe(true);
    act(() => {
      result.current.toggleSectionCollapsed("Section A");
    });
    expect(result.current.isSectionCollapsed("Section A")).toBe(false);
  });

  it("setHoverTip updates hover tip state", () => {
    const { result } = renderHook(() => useShipmentUiState(defaultPrefs));
    act(() => {
      result.current.setHoverTip({ visible: true, text: "Tooltip", x: 100, y: 200 });
    });
    expect(result.current.hoverTip.visible).toBe(true);
    expect(result.current.hoverTip.text).toBe("Tooltip");
  });

  it("persists preferences to localStorage", () => {
    const { result } = renderHook(() => useShipmentUiState(defaultPrefs));
    act(() => {
      result.current.setWeekFilter("2026-W17");
      result.current.setShipmentSort("week_asc");
    });
    const stored = JSON.parse(localStorage.getItem("shipmentUiPrefs") || "{}");
    expect(stored.weekFilter).toBe("2026-W17");
    expect(stored.shipmentSort).toBe("week_asc");
  });

  it("restores preferences from localStorage on mount", () => {
    localStorage.setItem(
      "shipmentUiPrefs",
      JSON.stringify({ weekFilter: "2026-W18", showShipped: true }),
    );
    const { result } = renderHook(() => useShipmentUiState(defaultPrefs));
    expect(result.current.weekFilter).toBe("2026-W18");
    expect(result.current.showShipped).toBe(true);
  });
});
