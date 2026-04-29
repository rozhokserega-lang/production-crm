import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useShipmentActions } from "./useShipmentActions";
import { OrderService } from "../services/orderService";

vi.mock("../services/orderService", () => ({
  OrderService: {
    sendShipmentToWork: vi.fn(),
    deleteShipmentPlanCell: vi.fn(),
    enqueueMetalWorkOrder: vi.fn(),
    getShipmentTable: vi.fn(),
    previewPlanFromShipment: vi.fn(),
  },
}));

vi.mock("../app/shipmentActionHelpers", () => ({
  buildShipmentCellAttempts: vi.fn((s) => [s]),
  runShipmentCellActionWithFallback: vi.fn(({ actionFn, attempts }) =>
    actionFn(attempts[0])
  ),
}));

vi.mock("../app/shipmentExportHelpers", () => ({
  buildShipmentExportRows: vi.fn(() => ({ rows: [["Артикул"]], missingItems: [] })),
  getShipmentExportNoArticlesError: vi.fn(() => "Нет артикулов"),
  formatShipmentExportPartialError: vi.fn((n) => `${n} позиций без артикулов`),
  parseImportPlanRows: vi.fn(() => []),
  getImportPlanNoValidRowsError: vi.fn(() => "Нет строк"),
  loadImportCatalogRows: vi.fn(async () => []),
  buildImportArticleMap: vi.fn(() => new Map()),
  applyImportPlanRows: vi.fn(async () => ({ imported: 0, missing: [], marked: 0 })),
  formatImportShipmentPartialError: vi.fn(() => ""),
  formatShipmentImportError: vi.fn((msg) => msg),
}));

vi.mock("../app/rowHelpers", () => ({
  isShipmentCellMissingError: vi.fn(() => false),
}));

vi.mock("../app/appUtils", () => ({
  formatDateTimeForPrint: vi.fn(() => "01.01.2026 12:00"),
  buildPreviewRowsFromFurnitureTemplate: vi.fn(() => []),
}));

vi.mock("../app/shipmentDialogHelpers", () => ({
  buildStrapPreviewPlans: vi.fn(() => []),
}));

vi.mock("../app/shipmentPreviewHelpers", () => ({
  buildShipmentPreviewPlans: vi.fn(async () => ({ plans: [], failedCount: 0 })),
  enrichPreviewFromFurniture: vi.fn((p) => p),
  enrichPreviewWithStrapProduct: vi.fn((p) => p),
}));

function makeProps(overrides = {}) {
  return {
    canOperateProduction: true,
    canManageOrders: true,
    denyActionByRole: vi.fn(),
    selectedShipments: [],
    setSelectedShipments: vi.fn(),
    setPlanPreviews: vi.fn(),
    setActionLoading: vi.fn(),
    setError: vi.fn(),
    load: vi.fn().mockResolvedValue(undefined),
    view: "shipment",
    loadMetalQueue: vi.fn().mockResolvedValue(undefined),
    selectedShipmentMetal: { rows: [] },
    sectionArticleRows: [],
    articleLookupByItemKey: new Map(),
    furnitureTemplates: [],
    furnitureLoading: false,
    furnitureError: "",
    resolveFurnitureTemplateForPreviewByArticle: vi.fn(),
    strapProductBySizeToken: new Map(),
    strapProductsByArticleCode: new Map(),
    strapTargetProduct: "",
    ...overrides,
  };
}

describe("useShipmentActions – sendSelectedShipmentToWork", () => {
  it("denies action when not canOperateProduction", async () => {
    const props = makeProps({
      canOperateProduction: false,
      selectedShipments: [{ row: "r1", col: "c1", canSendToWork: true }],
    });
    const { result } = renderHook(() => useShipmentActions(props));

    await act(async () => {
      await result.current.sendSelectedShipmentToWork();
    });

    expect(props.denyActionByRole).toHaveBeenCalledWith(
      "Недостаточно прав для отправки заказов в работу."
    );
  });

  it("sets error when no sendable items", async () => {
    const props = makeProps({
      selectedShipments: [{ row: "r1", col: "c1", canSendToWork: false }],
    });
    const { result } = renderHook(() => useShipmentActions(props));

    await act(async () => {
      await result.current.sendSelectedShipmentToWork();
    });

    expect(props.setError).toHaveBeenCalledWith(
      "Среди выбранных ячеек нет доступных для отправки в работу."
    );
  });

  it("calls sendShipmentToWork and load on success", async () => {
    OrderService.sendShipmentToWork.mockResolvedValueOnce({ ok: true });
    const props = makeProps({
      selectedShipments: [{ row: "r1", col: "c1", canSendToWork: true }],
    });
    const { result } = renderHook(() => useShipmentActions(props));

    await act(async () => {
      await result.current.sendSelectedShipmentToWork();
    });

    expect(OrderService.sendShipmentToWork).toHaveBeenCalledWith("r1", "c1");
    expect(props.load).toHaveBeenCalledTimes(1);
    expect(props.setPlanPreviews).toHaveBeenCalledWith([]);
    expect(props.setSelectedShipments).toHaveBeenCalledWith([]);
  });
});

describe("useShipmentActions – deleteSelectedShipmentPlan", () => {
  it("denies action when not canManageOrders", async () => {
    const props = makeProps({
      canManageOrders: false,
      selectedShipments: [{ row: "r1", col: "c1", canSendToWork: true }],
    });
    const { result } = renderHook(() => useShipmentActions(props));

    await act(async () => {
      await result.current.deleteSelectedShipmentPlan();
    });

    expect(props.denyActionByRole).toHaveBeenCalledWith(
      "Недостаточно прав для удаления позиций из плана."
    );
  });

  it("aborts when user cancels confirm", async () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    const props = makeProps({
      selectedShipments: [{ row: "r1", col: "c1", canSendToWork: true }],
    });
    const { result } = renderHook(() => useShipmentActions(props));

    await act(async () => {
      await result.current.deleteSelectedShipmentPlan();
    });

    expect(OrderService.deleteShipmentPlanCell).not.toHaveBeenCalled();
  });

  it("calls deleteShipmentPlanCell and load when confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    OrderService.deleteShipmentPlanCell.mockResolvedValueOnce({ ok: true });
    const props = makeProps({
      selectedShipments: [{ row: "r1", col: "c1", canSendToWork: true }],
    });
    const { result } = renderHook(() => useShipmentActions(props));

    await act(async () => {
      await result.current.deleteSelectedShipmentPlan();
    });

    expect(OrderService.deleteShipmentPlanCell).toHaveBeenCalledTimes(1);
    expect(props.load).toHaveBeenCalledTimes(1);
  });
});

describe("useShipmentActions – toggleShipmentSelection", () => {
  it("adds item when not yet selected", () => {
    const setSelectedShipments = vi.fn();
    const props = makeProps({ setSelectedShipments });
    const { result } = renderHook(() => useShipmentActions(props));

    result.current.toggleShipmentSelection({ row: "r1", col: "c1" });

    const updater = setSelectedShipments.mock.calls[0][0];
    expect(updater([])).toEqual([{ row: "r1", col: "c1" }]);
  });

  it("removes item when already selected", () => {
    const setSelectedShipments = vi.fn();
    const props = makeProps({ setSelectedShipments });
    const { result } = renderHook(() => useShipmentActions(props));

    result.current.toggleShipmentSelection({ row: "r1", col: "c1" });

    const updater = setSelectedShipments.mock.calls[0][0];
    expect(
      updater([{ row: "r1", col: "c1" }, { row: "r2", col: "c2" }])
    ).toEqual([{ row: "r2", col: "c2" }]);
  });
});

describe("useShipmentActions – exportSelectedShipmentToExcel", () => {
  it("does nothing when no items selected", () => {
    const props = makeProps({ selectedShipments: [] });
    const { result } = renderHook(() => useShipmentActions(props));

    result.current.exportSelectedShipmentToExcel();

    expect(props.setError).not.toHaveBeenCalled();
  });

  it("sets error when user cancels prompt", () => {
    vi.spyOn(window, "prompt").mockReturnValueOnce(null);
    const props = makeProps({
      selectedShipments: [{ row: "r1", col: "c1", week: "18" }],
    });
    const { result } = renderHook(() => useShipmentActions(props));

    result.current.exportSelectedShipmentToExcel();

    expect(props.setError).not.toHaveBeenCalled();
  });

  it("sets error when plan number is empty", () => {
    vi.spyOn(window, "prompt").mockReturnValueOnce("  ");
    const props = makeProps({
      selectedShipments: [{ row: "r1", col: "c1", week: "18" }],
    });
    const { result } = renderHook(() => useShipmentActions(props));

    result.current.exportSelectedShipmentToExcel();

    expect(props.setError).toHaveBeenCalledWith("Укажите номер плана.");
  });
});
