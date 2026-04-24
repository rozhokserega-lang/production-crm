import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCommonDerivedData } from "./useCommonDerivedData";

describe("useCommonDerivedData", () => {
  const baseRows = [
    { orderId: "A-1", name: "Order 1" },
    { orderId: "A-2", name: "Order 2" },
    { orderId: "B-1", name: "Order 3" },
  ];

  it("returns baseOrderFiltered for non-shipment/labor/sheetMirror views", () => {
    const { result } = renderHook(() =>
      useCommonDerivedData({
        view: "workshop",
        shipmentFiltered: [],
        laborFiltered: [],
        sheetMirrorFiltered: [],
        baseOrderFiltered: baseRows,
        rows: baseRows,
        orderDrawerId: "",
      }),
    );
    expect(result.current.filtered).toEqual(baseRows);
  });

  it("returns shipmentFiltered for shipment view", () => {
    const shipmentFiltered = [{ orderId: "S-1" }];
    const { result } = renderHook(() =>
      useCommonDerivedData({
        view: "shipment",
        shipmentFiltered,
        laborFiltered: [],
        sheetMirrorFiltered: [],
        baseOrderFiltered: baseRows,
        rows: baseRows,
        orderDrawerId: "",
      }),
    );
    expect(result.current.filtered).toEqual(shipmentFiltered);
  });

  it("returns laborFiltered for labor view", () => {
    const laborFiltered = [{ orderId: "L-1" }];
    const { result } = renderHook(() =>
      useCommonDerivedData({
        view: "labor",
        shipmentFiltered: [],
        laborFiltered,
        sheetMirrorFiltered: [],
        baseOrderFiltered: baseRows,
        rows: baseRows,
        orderDrawerId: "",
      }),
    );
    expect(result.current.filtered).toEqual(laborFiltered);
  });

  it("returns sheetMirrorFiltered for sheetMirror view", () => {
    const sheetMirrorFiltered = [{ orderId: "M-1" }];
    const { result } = renderHook(() =>
      useCommonDerivedData({
        view: "sheetMirror",
        shipmentFiltered: [],
        laborFiltered: [],
        sheetMirrorFiltered,
        baseOrderFiltered: baseRows,
        rows: baseRows,
        orderDrawerId: "",
      }),
    );
    expect(result.current.filtered).toEqual(sheetMirrorFiltered);
  });

  it("returns empty orderDrawerLines when orderDrawerId is empty", () => {
    const { result } = renderHook(() =>
      useCommonDerivedData({
        view: "workshop",
        shipmentFiltered: [],
        laborFiltered: [],
        sheetMirrorFiltered: [],
        baseOrderFiltered: baseRows,
        rows: baseRows,
        orderDrawerId: "",
      }),
    );
    expect(result.current.orderDrawerLines).toEqual([]);
  });

  it("filters orderDrawerLines by orderDrawerId", () => {
    const { result } = renderHook(() =>
      useCommonDerivedData({
        view: "workshop",
        shipmentFiltered: [],
        laborFiltered: [],
        sheetMirrorFiltered: [],
        baseOrderFiltered: baseRows,
        rows: baseRows,
        orderDrawerId: "A-1",
      }),
    );
    expect(result.current.orderDrawerLines).toHaveLength(1);
    expect(result.current.orderDrawerLines[0].orderId).toBe("A-1");
  });

  it("returns multiple orderDrawerLines when multiple rows match", () => {
    const rows = [
      { orderId: "A-1", name: "Order 1" },
      { orderId: "A-1", name: "Order 1 duplicate" },
    ];
    const { result } = renderHook(() =>
      useCommonDerivedData({
        view: "workshop",
        shipmentFiltered: [],
        laborFiltered: [],
        sheetMirrorFiltered: [],
        baseOrderFiltered: rows,
        rows,
        orderDrawerId: "A-1",
      }),
    );
    expect(result.current.orderDrawerLines).toHaveLength(2);
  });

  it("handles order_id (snake_case) in rows", () => {
    const rows = [{ order_id: "B-1", name: "Order B" }];
    const { result } = renderHook(() =>
      useCommonDerivedData({
        view: "workshop",
        shipmentFiltered: [],
        laborFiltered: [],
        sheetMirrorFiltered: [],
        baseOrderFiltered: rows,
        rows,
        orderDrawerId: "B-1",
      }),
    );
    expect(result.current.orderDrawerLines).toHaveLength(1);
  });
});
