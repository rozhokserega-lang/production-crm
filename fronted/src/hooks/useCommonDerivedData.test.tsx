import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCommonDerivedData } from "./useCommonDerivedData.ts";

describe("useCommonDerivedData", () => {
  const baseRows = [
    { orderId: "A-1", name: "Order 1" },
    { orderId: "A-2", name: "Order 2" },
    { orderId: "B-1", name: "Order 3" },
  ];

  it("returns filtered and orderDrawerLines for any view", () => {
    const setOrderDrawerLines = vi.fn();
    const { result } = renderHook(() =>
      useCommonDerivedData({
        view: "workshop",
        filtered: baseRows,
        orderDrawerLines: [],
        setOrderDrawerLines,
      }),
    );
    expect(result.current.filtered).toEqual(baseRows);
    expect(result.current.orderDrawerLines).toEqual([]);
    expect(result.current.setOrderDrawerLines).toBe(setOrderDrawerLines);
  });

  it("returns shipment filtered for shipment view", () => {
    const shipmentFiltered = [{ orderId: "S-1" }];
    const setOrderDrawerLines = vi.fn();
    const { result } = renderHook(() =>
      useCommonDerivedData({
        view: "shipment",
        filtered: shipmentFiltered,
        orderDrawerLines: [],
        setOrderDrawerLines,
      }),
    );
    expect(result.current.filtered).toEqual(shipmentFiltered);
  });

  it("passes through orderDrawerLines", () => {
    const drawerLines = [{ orderId: "A-1", name: "Order 1" }];
    const setOrderDrawerLines = vi.fn();
    const { result } = renderHook(() =>
      useCommonDerivedData({
        view: "workshop",
        filtered: baseRows,
        orderDrawerLines: drawerLines,
        setOrderDrawerLines,
      }),
    );
    expect(result.current.orderDrawerLines).toEqual(drawerLines);
  });
});
