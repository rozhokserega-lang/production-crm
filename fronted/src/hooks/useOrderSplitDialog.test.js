import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOrderSplitDialog } from "./useOrderSplitDialog";
import { OrderService } from "../services/orderService";

vi.mock("../services/orderService", () => ({
  OrderService: {
    splitWorkshopOrder: vi.fn(),
  },
}));

function makeProps(overrides = {}) {
  return {
    mutationLoad: vi.fn().mockResolvedValue(undefined),
    setError: vi.fn(),
    canManageOrders: true,
    denyActionByRole: vi.fn(),
    ...overrides,
  };
}

function currentMeta(result) {
  return result.current.orderSplitDialog.meta;
}

describe("useOrderSplitDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("открывает диалог с мета-данными заказа", () => {
    const props = makeProps();
    const { result } = renderHook(() => useOrderSplitDialog(props));

    act(() => {
      result.current.openOrderSplitDialog("SP-12345678", {
        qty: 10,
        week: "43",
        item: "Стол Donini 750",
        material: "Белый",
      });
    });

    expect(result.current.orderSplitDialog.open).toBe(true);
    expect(currentMeta(result)).toMatchObject({
      orderId: "SP-12345678",
      qty: 10,
      week: "43",
      item: "Стол Donini 750",
      material: "Белый",
    });
    expect(props.setError).not.toHaveBeenCalled();
  });

  it("не открывает диалог при количестве меньше 2", () => {
    const props = makeProps();
    const { result } = renderHook(() => useOrderSplitDialog(props));

    act(() => {
      result.current.openOrderSplitDialog("SP-1", { qty: 1, week: "43", item: "X" });
    });

    expect(result.current.orderSplitDialog.open).toBe(false);
    expect(props.setError).toHaveBeenCalled();
  });

  it("отказывает по роли при подтверждении", async () => {
    const props = makeProps({ canManageOrders: false });
    const { result } = renderHook(() => useOrderSplitDialog(props));

    act(() => {
      result.current.openOrderSplitDialog("SP-1", { qty: 10, week: "43", item: "X" });
    });
    await act(async () => {
      await result.current.orderSplitDialog.confirm({ qtyKeep: 6, targetWeek: "44", qtyMove: 4 });
    });

    expect(props.denyActionByRole).toHaveBeenCalled();
    expect(OrderService.splitWorkshopOrder).not.toHaveBeenCalled();
    expect(result.current.orderSplitDialog.open).toBe(true);
  });

  it("делит заказ и закрывает диалог при успехе", async () => {
    const props = makeProps();
    OrderService.splitWorkshopOrder.mockResolvedValueOnce({ ok: true });
    const { result } = renderHook(() => useOrderSplitDialog(props));

    act(() => {
      result.current.openOrderSplitDialog("SP-1", { qty: 10, week: "43", item: "X" });
    });
    await act(async () => {
      await result.current.orderSplitDialog.confirm({ qtyKeep: 6, targetWeek: "44", qtyMove: 4 });
    });

    expect(OrderService.splitWorkshopOrder).toHaveBeenCalledWith("SP-1", {
      qtyKeep: 6,
      targetWeek: "44",
      qtyMove: 4,
    });
    expect(props.mutationLoad).toHaveBeenCalled();
    expect(result.current.orderSplitDialog.open).toBe(false);
  });

  it("показывает ошибку и не закрывает диалог при провале", async () => {
    const props = makeProps();
    OrderService.splitWorkshopOrder.mockRejectedValueOnce(new Error("Сумма частей (11) должна равняться количеству в заказе (10)"));
    const { result } = renderHook(() => useOrderSplitDialog(props));

    act(() => {
      result.current.openOrderSplitDialog("SP-1", { qty: 10, week: "43", item: "X" });
    });
    await act(async () => {
      await result.current.orderSplitDialog.confirm({ qtyKeep: 6, targetWeek: "44", qtyMove: 4 });
    });

    expect(result.current.orderSplitDialog.open).toBe(true);
    expect(result.current.orderSplitDialog.error).toContain("Сумма частей");
    expect(props.setError).toHaveBeenCalled();
    expect(props.mutationLoad).not.toHaveBeenCalled();
  });

  it("не пускает части, не дающие в сумме количество заказа", async () => {
    const props = makeProps();
    const { result } = renderHook(() => useOrderSplitDialog(props));

    act(() => {
      result.current.openOrderSplitDialog("SP-1", { qty: 10, week: "43", item: "X" });
    });
    await act(async () => {
      await result.current.orderSplitDialog.confirm({ qtyKeep: 6, targetWeek: "44", qtyMove: 5 });
    });

    expect(OrderService.splitWorkshopOrder).not.toHaveBeenCalled();
    expect(result.current.orderSplitDialog.error).toContain("должна равняться количеству в заказе");
  });
});
