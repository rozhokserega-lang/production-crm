import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFilters, useShipmentFilters } from "./useFilters";

describe("useFilters", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("initializes with default filter values", () => {
    const { result } = renderHook(() => useFilters());
    expect(result.current.filters).toEqual({
      weekFilter: "all",
      query: "",
      statusFilter: "all",
      showBlueCells: false,
      showYellowCells: false,
    });
    expect(result.current.activeFiltersCount).toBe(0);
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it("merges initialFilters with defaults", () => {
    const { result } = renderHook(() => useFilters({ weekFilter: "2026-W17", query: "test" }));
    expect(result.current.filters.weekFilter).toBe("2026-W17");
    expect(result.current.filters.query).toBe("test");
    expect(result.current.filters.statusFilter).toBe("all");
  });

  it("updateFilter changes a single filter value", () => {
    const { result } = renderHook(() => useFilters());
    act(() => {
      result.current.updateFilter("query", "search-term");
    });
    expect(result.current.filters.query).toBe("search-term");
    expect(result.current.filters.weekFilter).toBe("all");
  });

  it("resetFilters restores defaults", () => {
    const { result } = renderHook(() => useFilters());
    act(() => {
      result.current.updateFilter("query", "search-term");
      result.current.updateFilter("weekFilter", "2026-W17");
    });
    expect(result.current.filters.query).toBe("search-term");
    act(() => {
      result.current.resetFilters();
    });
    expect(result.current.filters.query).toBe("");
    expect(result.current.filters.weekFilter).toBe("all");
  });

  it("activeFiltersCount counts non-default filters", () => {
    const { result } = renderHook(() => useFilters());
    expect(result.current.activeFiltersCount).toBe(0);
    act(() => {
      result.current.updateFilter("query", "search");
    });
    expect(result.current.activeFiltersCount).toBe(1);
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("does not count weekFilter='all' as active", () => {
    const { result } = renderHook(() => useFilters());
    act(() => {
      result.current.updateFilter("weekFilter", "all");
    });
    expect(result.current.activeFiltersCount).toBe(0);
  });

  it("counts weekFilter non-'all' as active", () => {
    const { result } = renderHook(() => useFilters());
    act(() => {
      result.current.updateFilter("weekFilter", "2026-W17");
    });
    expect(result.current.activeFiltersCount).toBe(1);
  });

  it("counts showBlueCells as active when true", () => {
    const { result } = renderHook(() => useFilters());
    act(() => {
      result.current.updateFilter("showBlueCells", true);
    });
    expect(result.current.activeFiltersCount).toBe(1);
  });
});

describe("useShipmentFilters", () => {
  it("initializes with board view mode and empty hidden groups", () => {
    const { result } = renderHook(() => useShipmentFilters());
    expect(result.current.shipmentViewMode).toBe("board");
    expect(result.current.hiddenShipmentGroups.size).toBe(0);
  });

  it("toggleGroupVisibility adds group to hidden set", () => {
    const { result } = renderHook(() => useShipmentFilters());
    act(() => {
      result.current.toggleGroupVisibility("Группа А");
    });
    expect(result.current.hiddenShipmentGroups.has("Группа А")).toBe(true);
  });

  it("toggleGroupVisibility removes group on second toggle", () => {
    const { result } = renderHook(() => useShipmentFilters());
    act(() => {
      result.current.toggleGroupVisibility("Группа А");
    });
    expect(result.current.hiddenShipmentGroups.has("Группа А")).toBe(true);
    act(() => {
      result.current.toggleGroupVisibility("Группа А");
    });
    expect(result.current.hiddenShipmentGroups.has("Группа А")).toBe(false);
  });

  it("setShipmentViewMode changes view mode", () => {
    const { result } = renderHook(() => useShipmentFilters());
    act(() => {
      result.current.setShipmentViewMode("table");
    });
    expect(result.current.shipmentViewMode).toBe("table");
  });
});
