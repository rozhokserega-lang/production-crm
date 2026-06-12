import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useStageActions } from "./useStageActions";
import { OrderService } from "../services/orderService";

vi.mock("../services/orderService", () => ({
  OrderService: {
    updateOrderStage: vi.fn(),
    completeReplacementForWorkshopOrder: vi.fn(),
    consumeStrapStock: vi.fn(),
  },
}));

vi.mock("../app/appUtils", () => ({
  hasOptimisticActionRule: vi.fn((action) => action !== "webSetPilkaDone"),
  applyOptimisticOrderRow: vi.fn((row) => ({ ...row, optimistic: true })),
  resolveSectionNameForOrder: vi.fn(() => "Секция 1"),
}));

vi.mock("../app/runActionHelpers", () => ({
  buildNotifyPayload: vi.fn(() => ({ orderId: "1", meta: {} })),
  buildStageSyncPayload: vi.fn(() => ({ sync: true })),
}));

vi.mock("../app/orderHelpers", () => ({
  getMaterialLabel: vi.fn(() => "Материал"),
  stripPlanItemMeta: vi.fn((s) => s),
}));

vi.mock("../app/workshopStrapNeeds", () => ({
  getResolvedWorkshopStrapNeeds: vi.fn(() => []),
  isWorkshopStrapOrderItem: vi.fn(() => false),
  orderCountsTowardStrapDemand: vi.fn(() => false),
  strapConsumeColorForOrder: vi.fn(() => "Белый"),
}));

vi.mock("../app/errorCatalogHelpers", () => ({
  toUserError: vi.fn((e) => e?.message || "Ошибка"),
}));

function makeProps(overrides = {}) {
  return {
    canOperateProduction: true,
    denyActionByRole: vi.fn(),
    setError: vi.fn(),
    setRows: vi.fn(),
    setShipmentOrders: vi.fn(),
    setPendingStageActionKeys: vi.fn(),
    orderIndexById: new Map(),
    shipmentBoard: { sections: [] },
    load: vi.fn().mockResolvedValue(undefined),
    syncPlanCellToGoogleSheet: vi.fn(),
    notifyAssemblyReadyTelegram: vi.fn(),
    notifyFinalStageTelegram: vi.fn(),
    openPilkaDoneConsumeDialog: vi.fn(),
    openPilkaDoneConsumeDialogOnError: vi.fn(),
    openPrasDoneStrapDialog: vi.fn(),
    workshopStrapDeps: null,
    refreshStrapStock: vi.fn(),
    ...overrides,
  };
}

describe("useStageActions – runAction", () => {
  it("denies action when not canOperateProduction", async () => {
    const props = makeProps({ canOperateProduction: false });
    const { result } = renderHook(() => useStageActions(props));

    await act(async () => {
      await result.current.runAction("webSetPilkaInWork", "order1");
    });

    expect(props.denyActionByRole).toHaveBeenCalledWith(
      "Недостаточно прав для изменения этапов производства."
    );
  });

  it("calls updateOrderStage on success", async () => {
    OrderService.updateOrderStage.mockResolvedValueOnce({ ok: true });
    const props = makeProps();
    const { result } = renderHook(() => useStageActions(props));

    await act(async () => {
      await result.current.runAction("webSetPilkaInWork", "order1", { executor: "Слава" });
    });

    expect(OrderService.updateOrderStage).toHaveBeenCalledWith("order1", "webSetPilkaInWork", { executor: "Слава" });
    expect(props.load).toHaveBeenCalled();
  });

  it("sets error on failure", async () => {
    OrderService.updateOrderStage.mockRejectedValueOnce(new Error("RPC failed"));
    const props = makeProps();
    const { result } = renderHook(() => useStageActions(props));

    await act(async () => {
      await result.current.runAction("webSetPilkaInWork", "order1");
    });

    expect(props.setError).toHaveBeenCalledWith("RPC failed");
  });

  it("calls openPilkaDoneConsumeDialog for webSetPilkaDone", async () => {
    OrderService.updateOrderStage.mockResolvedValueOnce({ ok: true });
    const props = makeProps();
    const { result } = renderHook(() => useStageActions(props));

    await act(async () => {
      await result.current.runAction("webSetPilkaDone", "order1");
    });

    expect(props.openPilkaDoneConsumeDialog).toHaveBeenCalledWith("order1", {});
  });

  it("calls notifyAssemblyReadyTelegram for webSetPrasDone with notifyOnAssembly", async () => {
    OrderService.updateOrderStage.mockResolvedValueOnce({ ok: true });
    const props = makeProps();
    const { result } = renderHook(() => useStageActions(props));

    await act(async () => {
      await result.current.runAction("webSetPrasDone", "order1", {}, { notifyOnAssembly: true });
    });

    expect(props.notifyAssemblyReadyTelegram).toHaveBeenCalled();
  });

  it("calls openPrasDoneStrapDialog for webSetPrasDone with isStrapOrder", async () => {
    OrderService.updateOrderStage.mockResolvedValueOnce({ ok: true });
    const props = makeProps();
    const { result } = renderHook(() => useStageActions(props));

    await act(async () => {
      await result.current.runAction("webSetPrasDone", "order1", {}, { isStrapOrder: true });
    });

    expect(props.openPrasDoneStrapDialog).toHaveBeenCalledWith("order1", { isStrapOrder: true, mode: "done" });
  });

  it("calls notifyFinalStageTelegram for webSetWarehouseKitReady", async () => {
    OrderService.updateOrderStage.mockResolvedValueOnce({ ok: true });
    const props = makeProps();
    const { result } = renderHook(() => useStageActions(props));

    await act(async () => {
      await result.current.runAction("webSetWarehouseKitReady", "order1", {}, { notifyOnFinalStage: true });
    });

    expect(props.notifyFinalStageTelegram).toHaveBeenCalled();
  });

  it("reverts optimistic updates on error", async () => {
    OrderService.updateOrderStage.mockRejectedValueOnce(new Error("fail"));
    const setRows = vi.fn();
    const props = makeProps({ setRows });
    const { result } = renderHook(() => useStageActions(props));

    await act(async () => {
      await result.current.runAction("webSetKromkaInWork", "order1");
    });

    expect(setRows).toHaveBeenCalled();
  });

  it("removes pending key after completion", async () => {
    OrderService.updateOrderStage.mockResolvedValueOnce({ ok: true });
    const setPendingStageActionKeys = vi.fn();
    const props = makeProps({ setPendingStageActionKeys });
    const { result } = renderHook(() => useStageActions(props));

    await act(async () => {
      await result.current.runAction("webSetPilkaInWork", "order1");
    });

    expect(setPendingStageActionKeys).toHaveBeenCalled();
  });
});
