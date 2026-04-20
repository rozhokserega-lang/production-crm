import { renderHook, waitFor, act } from "@testing-library/react";
import { useOrders } from "./useOrders";
import { OrderService } from "../services/orderService";

vi.mock("../services/orderService", () => ({
  OrderService: {
    getAllOrders: vi.fn(),
    getOrdersByStage: vi.fn(),
  },
}));

describe("useOrders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("auto-loads orders on mount when autoLoad is enabled", async () => {
    const rows = [{ orderId: "A-1" }, { orderId: "A-2" }];
    OrderService.getAllOrders.mockResolvedValue(rows);

    const { result } = renderHook(() => useOrders({ autoLoad: true }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.rows).toEqual(rows);
      expect(result.current.error).toBeNull();
    });
    expect(OrderService.getAllOrders).toHaveBeenCalledTimes(1);
  });

  it("falls back to empty rows when API returns non-array payload", async () => {
    OrderService.getAllOrders.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useOrders({ autoLoad: true }));

    await waitFor(() => {
      expect(result.current.rows).toEqual([]);
      expect(result.current.error).toBeNull();
    });
  });

  it("sets error when stage load fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    OrderService.getOrdersByStage.mockRejectedValue(new Error("Stage failed"));

    const { result } = renderHook(() => useOrders({ autoLoad: false }));

    await act(async () => {
      await result.current.loadOrdersByStage("pilka");
    });

    expect(result.current.rows).toEqual([]);
    expect(result.current.error).toBe("Stage failed");
    expect(result.current.loading).toBe(false);
    consoleErrorSpy.mockRestore();
  });
});
