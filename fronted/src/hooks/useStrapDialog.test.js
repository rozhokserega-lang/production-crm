import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useStrapDialog } from "./useStrapDialog";
import { OrderService } from "../services/orderService";

vi.mock("../services/orderService", () => ({
  OrderService: {
    createShipmentPlanCell: vi.fn(),
  },
}));

vi.mock("../app/shipmentDialogHelpers", () => ({
  buildStrapDialogInit: vi.fn(() => ({
    defaultProduct: "Сиена",
    defaultWeek: "24",
    draft: { "396_305": 5 },
  })),
  buildStrapPlanCellPayload: vi.fn((row) => ({ payload: true, ...row })),
  buildStrapPlanRows: vi.fn(() => [{ code: "396_305", qty: 5 }]),
}));

vi.mock("../app/errorCatalogHelpers", () => ({
  toUserError: vi.fn((e) => e?.message || "Ошибка"),
}));

vi.mock("../app/orderHelpers", () => ({
  embedStrapTargetProduct: vi.fn((item, product) => `${item} {{STRAP_FOR:${product}}}`),
}));

function makeProps(overrides = {}) {
  return {
    canOperateProduction: true,
    denyActionByRole: vi.fn(),
    setError: vi.fn(),
    setActionLoading: vi.fn(),
    setStrapDialogOpen: vi.fn(),
    setStrapTargetProduct: vi.fn(),
    setStrapPlanWeek: vi.fn(),
    setStrapDraft: vi.fn(),
    setStrapItems: vi.fn(),
    strapItems: [],
    strapProductNames: ["Сиена", "Авелла"],
    weekFilter: "24",
    weeks: ["23", "24", "25"],
    strapOptionsByProduct: {},
    strapTargetProduct: "Сиена",
    strapPlanWeek: "24",
    strapDraft: { "396_305": 5 },
    strapOptionsForSelectedProduct: [],
    resolveStrapMaterialByProduct: vi.fn(() => "Материал"),
    strapNameToOrderItem: vi.fn((s) => s),
    normalizeStrapProductKey: vi.fn((s) => s),
    syncPlanCellToGoogleSheet: vi.fn(),
    load: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("useStrapDialog – openStrapDialog", () => {
  it("denies action when not canOperateProduction", () => {
    const props = makeProps({ canOperateProduction: false });
    const { result } = renderHook(() => useStrapDialog(props));

    act(() => {
      result.current.openStrapDialog();
    });

    expect(props.denyActionByRole).toHaveBeenCalledWith(
      "Недостаточно прав для добавления обвязки."
    );
  });

  it("opens dialog and sets initial state", () => {
    const props = makeProps();
    const { result } = renderHook(() => useStrapDialog(props));

    act(() => {
      result.current.openStrapDialog();
    });

    expect(props.setStrapTargetProduct).toHaveBeenCalledWith("Сиена");
    expect(props.setStrapPlanWeek).toHaveBeenCalledWith("24");
    expect(props.setStrapDraft).toHaveBeenCalledWith({ "396_305": 5 });
    expect(props.setStrapDialogOpen).toHaveBeenCalledWith(true);
  });
});

describe("useStrapDialog – saveStrapDialog", () => {
  it("denies action when not canOperateProduction", async () => {
    const props = makeProps({ canOperateProduction: false });
    const { result } = renderHook(() => useStrapDialog(props));

    await act(async () => {
      await result.current.saveStrapDialog();
    });

    expect(props.denyActionByRole).toHaveBeenCalledWith(
      "Недостаточно прав для изменения плана."
    );
  });

  it("closes dialog when no rows", async () => {
    const { buildStrapPlanRows } = await import("../app/shipmentDialogHelpers");
    buildStrapPlanRows.mockReturnValueOnce([]);
    const props = makeProps();
    const { result } = renderHook(() => useStrapDialog(props));

    await act(async () => {
      await result.current.saveStrapDialog();
    });

    expect(props.setStrapItems).toHaveBeenCalledWith([]);
    expect(props.setStrapDialogOpen).toHaveBeenCalledWith(false);
  });

  it("sets error when week is empty", async () => {
    const props = makeProps({ strapPlanWeek: "" });
    const { result } = renderHook(() => useStrapDialog(props));

    await act(async () => {
      await result.current.saveStrapDialog();
    });

    expect(props.setError).toHaveBeenCalledWith("Укажите неделю плана для обвязки.");
  });

  it("creates plan cells and loads on success", async () => {
    OrderService.createShipmentPlanCell.mockResolvedValueOnce({ ok: true });
    const props = makeProps();
    const { result } = renderHook(() => useStrapDialog(props));

    await act(async () => {
      await result.current.saveStrapDialog();
    });

    expect(OrderService.createShipmentPlanCell).toHaveBeenCalled();
    expect(props.setStrapItems).toHaveBeenCalledWith([]);
    expect(props.setStrapDialogOpen).toHaveBeenCalledWith(false);
    expect(props.load).toHaveBeenCalled();
  });

  it("sets error on failure", async () => {
    OrderService.createShipmentPlanCell.mockRejectedValueOnce(new Error("Save failed"));
    const props = makeProps();
    const { result } = renderHook(() => useStrapDialog(props));

    await act(async () => {
      await result.current.saveStrapDialog();
    });

    expect(props.setError).toHaveBeenCalledWith("Save failed");
  });

  it("clears loading state after completion", async () => {
    OrderService.createShipmentPlanCell.mockResolvedValueOnce({ ok: true });
    const props = makeProps();
    const { result } = renderHook(() => useStrapDialog(props));

    await act(async () => {
      await result.current.saveStrapDialog();
    });

    expect(props.setActionLoading).toHaveBeenCalledWith("");
  });
});
