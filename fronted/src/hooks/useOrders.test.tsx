import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOrders } from "./useOrders.ts";

describe("useOrders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets orders from rows when view is not shipment", () => {
    const rows = [{ orderId: "A-1" }, { orderId: "A-2" }];
    const { result } = renderHook(() => useOrders({ rows, view: "workshop" }));

    expect(result.current.orders).toEqual(rows);
  });

  it("keeps orders empty when view is shipment", () => {
    const rows = [{ orderId: "A-1" }, { orderId: "A-2" }];
    const { result } = renderHook(() => useOrders({ rows, view: "shipment" }));

    expect(result.current.orders).toEqual([]);
  });

  it("updates orders when rows change", () => {
    const { result, rerender } = renderHook(
      ({ rows, view }) => useOrders({ rows, view }),
      { initialProps: { rows: [{ orderId: "A-1" }], view: "workshop" } }
    );

    expect(result.current.orders).toEqual([{ orderId: "A-1" }]);

    const newRows = [{ orderId: "B-1" }, { orderId: "B-2" }];
    rerender({ rows: newRows, view: "workshop" });

    expect(result.current.orders).toEqual(newRows);
  });

  it("does not update orders when view changes to shipment", () => {
    const rows = [{ orderId: "A-1" }];
    const { result, rerender } = renderHook(
      ({ rows, view }) => useOrders({ rows, view }),
      { initialProps: { rows, view: "workshop" } }
    );

    expect(result.current.orders).toEqual(rows);

    rerender({ rows, view: "shipment" });

    expect(result.current.orders).toEqual([]);
  });

  it("setOrders updates orders state", () => {
    const rows = [{ orderId: "A-1" }];
    const { result } = renderHook(() => useOrders({ rows, view: "workshop" }));

    act(() => {
      result.current.setOrders([{ orderId: "C-1" }]);
    });

    expect(result.current.orders).toEqual([{ orderId: "C-1" }]);
  });

  it("handles undefined rows gracefully", () => {
    const { result } = renderHook(() =>
      useOrders({ rows: undefined as unknown as unknown[], view: "workshop" })
    );

    expect(result.current.orders).toEqual([]);
  });
});
