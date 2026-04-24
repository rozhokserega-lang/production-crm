import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLaborState } from "./useLaborState";

describe("useLaborState", () => {
  it("initializes with default values", () => {
    const { result } = renderHook(() => useLaborState("labor"));
    expect(result.current.laborSort).toBe("total_desc");
    expect(result.current.laborSubView).toBe("total");
    expect(result.current.laborRows).toEqual([]);
    expect(result.current.laborImportedRows).toEqual([]);
    expect(result.current.laborSaveSelected).toEqual({});
    expect(result.current.laborSavingByKey).toEqual({});
    expect(result.current.laborSavedByKey).toEqual({});
  });

  it("sets labor sort", () => {
    const { result } = renderHook(() => useLaborState("labor"));
    act(() => {
      result.current.setLaborSort("name_asc");
    });
    expect(result.current.laborSort).toBe("name_asc");
  });

  it("sets labor sub view", () => {
    const { result } = renderHook(() => useLaborState("labor"));
    act(() => {
      result.current.setLaborSubView("planner");
    });
    expect(result.current.laborSubView).toBe("planner");
  });

  it("sets labor rows", () => {
    const { result } = renderHook(() => useLaborState("labor"));
    const rows = [{ orderId: "A-1", labor: 120 }];
    act(() => {
      result.current.setLaborRows(rows);
    });
    expect(result.current.laborRows).toEqual(rows);
  });

  it("sets labor planner qty by group", () => {
    const { result } = renderHook(() => useLaborState("labor"));
    act(() => {
      result.current.setLaborPlannerQtyByGroup({ group1: 5 });
    });
    expect(result.current.laborPlannerQtyByGroup).toEqual({ group1: 5 });
  });

  it("resets laborSubView to 'total' when view is not 'labor'", () => {
    const { result } = renderHook(() => useLaborState("labor"));
    act(() => {
      result.current.setLaborSubView("planner");
    });
    expect(result.current.laborSubView).toBe("planner");
    // Re-render with different view
    const { result: result2 } = renderHook(() => useLaborState("shipment"));
    expect(result2.current.laborSubView).toBe("total");
  });

  it("sets labor imported rows", () => {
    const { result } = renderHook(() => useLaborState("labor"));
    const imported = [{ orderId: "A-1", labor: 60 }];
    act(() => {
      result.current.setLaborImportedRows(imported);
    });
    expect(result.current.laborImportedRows).toEqual(imported);
  });

  it("sets labor save selected", () => {
    const { result } = renderHook(() => useLaborState("labor"));
    act(() => {
      result.current.setLaborSaveSelected({ "A-1": true });
    });
    expect(result.current.laborSaveSelected).toEqual({ "A-1": true });
  });

  it("sets labor saving by key", () => {
    const { result } = renderHook(() => useLaborState("labor"));
    act(() => {
      result.current.setLaborSavingByKey({ "A-1": true });
    });
    expect(result.current.laborSavingByKey).toEqual({ "A-1": true });
  });

  it("sets labor saved by key", () => {
    const { result } = renderHook(() => useLaborState("labor"));
    act(() => {
      result.current.setLaborSavedByKey({ "A-1": true });
    });
    expect(result.current.laborSavedByKey).toEqual({ "A-1": true });
  });
});
