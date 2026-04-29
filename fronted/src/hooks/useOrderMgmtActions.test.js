import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useOrderMgmtActions } from "./useOrderMgmtActions";
import { OrderService } from "../services/orderService";

vi.mock("../services/orderService", () => ({
  OrderService: {
    setOrderAdminComment: vi.fn(),
    deleteOrder: vi.fn(),
    deleteShipmentPlanCell: vi.fn(),
    updateOrderStage: vi.fn(),
  },
}));

function makeProps(overrides = {}) {
  return {
    canAdminSettings: true,
    canManageOrders: true,
    denyActionByRole: vi.fn(),
    setActionLoading: vi.fn(),
    setError: vi.fn(),
    load: vi.fn().mockResolvedValue(undefined),
    orderDrawerId: "42",
    rowsRef: { current: [] },
    ...overrides,
  };
}

describe("useOrderMgmtActions – saveOrderAdminComment", () => {
  it("does nothing when id is empty", async () => {
    const props = makeProps({ orderDrawerId: "" });
    const { result } = renderHook(() => useOrderMgmtActions(props));

    await act(async () => {
      await result.current.saveOrderAdminComment("hello");
    });

    expect(OrderService.setOrderAdminComment).not.toHaveBeenCalled();
  });

  it("does nothing when not canAdminSettings", async () => {
    const props = makeProps({ canAdminSettings: false });
    const { result } = renderHook(() => useOrderMgmtActions(props));

    await act(async () => {
      await result.current.saveOrderAdminComment("hello");
    });

    expect(OrderService.setOrderAdminComment).not.toHaveBeenCalled();
  });

  it("calls setOrderAdminComment and load on success", async () => {
    OrderService.setOrderAdminComment.mockResolvedValueOnce({ ok: true });
    const props = makeProps();
    const { result } = renderHook(() => useOrderMgmtActions(props));

    await act(async () => {
      await result.current.saveOrderAdminComment("Новый комментарий");
    });

    expect(OrderService.setOrderAdminComment).toHaveBeenCalledWith(
      "42",
      "Новый комментарий"
    );
    expect(props.load).toHaveBeenCalledTimes(1);
    expect(props.setError).toHaveBeenCalledWith("");
  });

  it("calls setError when API throws", async () => {
    OrderService.setOrderAdminComment.mockRejectedValueOnce(
      new Error("Network error")
    );
    const props = makeProps();
    const { result } = renderHook(() => useOrderMgmtActions(props));

    await act(async () => {
      await result.current.saveOrderAdminComment("text");
    });

    expect(props.setError).toHaveBeenLastCalledWith(expect.stringContaining("Network error"));
  });
});

describe("useOrderMgmtActions – deleteStatsOrder", () => {
  it("denies action when not canManageOrders", async () => {
    const props = makeProps({ canManageOrders: false });
    const { result } = renderHook(() => useOrderMgmtActions(props));

    await act(async () => {
      await result.current.deleteStatsOrder({ orderId: "99" });
    });

    expect(props.denyActionByRole).toHaveBeenCalledWith(
      "Недостаточно прав для удаления заказов."
    );
    expect(OrderService.deleteOrder).not.toHaveBeenCalled();
  });

  it("sets error when orderId is missing", async () => {
    const props = makeProps();
    const { result } = renderHook(() => useOrderMgmtActions(props));

    await act(async () => {
      await result.current.deleteStatsOrder({});
    });

    expect(props.setError).toHaveBeenCalledWith(
      "Для этого заказа не найден orderId."
    );
  });

  it("aborts when user cancels confirm dialog", async () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    const props = makeProps();
    const { result } = renderHook(() => useOrderMgmtActions(props));

    await act(async () => {
      await result.current.deleteStatsOrder({ orderId: "10" });
    });

    expect(OrderService.deleteOrder).not.toHaveBeenCalled();
  });

  it("calls deleteOrder and load when confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    OrderService.deleteOrder.mockResolvedValueOnce({ ok: true });
    const props = makeProps();
    const { result } = renderHook(() => useOrderMgmtActions(props));

    await act(async () => {
      await result.current.deleteStatsOrder({ orderId: "55" });
    });

    expect(OrderService.deleteOrder).toHaveBeenCalledWith("55");
    expect(props.load).toHaveBeenCalledTimes(1);
  });
});

describe("useOrderMgmtActions – overrideOrderStageFromDrawer", () => {
  it("denies action when not canAdminSettings", async () => {
    const props = makeProps({ canAdminSettings: false });
    const { result } = renderHook(() => useOrderMgmtActions(props));

    await act(async () => {
      await result.current.overrideOrderStageFromDrawer("1", "pilka", "in_work");
    });

    expect(props.denyActionByRole).toHaveBeenCalledWith(
      "Только администратор может вручную менять этап из канбана."
    );
  });

  it("sets error for unknown stage/status combination", async () => {
    const props = makeProps();
    const { result } = renderHook(() => useOrderMgmtActions(props));

    await act(async () => {
      await result.current.overrideOrderStageFromDrawer("1", "unknown", "xyz");
    });

    expect(props.setError).toHaveBeenCalledWith(
      "Некорректная комбинация этапа и статуса."
    );
  });

  it("calls updateOrderStage with correct RPC name", async () => {
    OrderService.updateOrderStage.mockResolvedValueOnce({ ok: true });
    const props = makeProps();
    const { result } = renderHook(() => useOrderMgmtActions(props));

    await act(async () => {
      await result.current.overrideOrderStageFromDrawer("7", "kromka", "done");
    });

    expect(OrderService.updateOrderStage).toHaveBeenCalledWith(
      "7",
      "webSetKromkaDone"
    );
    expect(props.load).toHaveBeenCalledTimes(1);
  });
});
