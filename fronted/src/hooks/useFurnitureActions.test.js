import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFurnitureActions } from "./useFurnitureActions";
import { OrderService } from "../services/orderService";

vi.mock("../services/orderService", () => ({
  OrderService: {
    createShipmentPlanCell: vi.fn(),
    setMetalStock: vi.fn(),
  },
}));

vi.mock("../app/metalImportHelpers", () => ({
  parseMetalImportRows: vi.fn(() => [
    { metalArticle: "ST-001", metalName: "Сталь", qtyAvailable: 50 },
  ]),
  getMetalImportNoValidRowsError: vi.fn(() => "Нет строк"),
  formatMetalImportError: vi.fn((msg) => `Ошибка импорта: ${msg}`),
}));

function makeProps(overrides = {}) {
  return {
    canOperateProduction: true,
    denyActionByRole: vi.fn(),
    setActionLoading: vi.fn(),
    setError: vi.fn(),
    load: vi.fn().mockResolvedValue(undefined),
    sectionArticleRows: [],
    syncPlanCellToGoogleSheet: vi.fn().mockResolvedValue(undefined),
    loadMetalStock: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("useFurnitureActions – createShelfPlanOrder", () => {
  it("denies action when not canOperateProduction", async () => {
    const props = makeProps({ canOperateProduction: false });
    const { result } = renderHook(() => useFurnitureActions(props));

    await act(async () => {
      await result.current.createShelfPlanOrder({
        week: "18",
        item: "Полка",
        material: "ЛДСП",
        qty: 5,
      });
    });

    expect(props.denyActionByRole).toHaveBeenCalledWith(
      "Недостаточно прав для изменения плана."
    );
    expect(OrderService.createShipmentPlanCell).not.toHaveBeenCalled();
  });

  it("sets error when week is missing", async () => {
    const props = makeProps();
    const { result } = renderHook(() => useFurnitureActions(props));

    await act(async () => {
      await result.current.createShelfPlanOrder({
        item: "Полка",
        material: "ЛДСП",
        qty: 5,
      });
    });

    expect(props.setError).toHaveBeenCalledWith("Укажите номер плана.");
  });

  it("sets error when qty is zero", async () => {
    const props = makeProps();
    const { result } = renderHook(() => useFurnitureActions(props));

    await act(async () => {
      await result.current.createShelfPlanOrder({
        week: "18",
        item: "Полка",
        material: "ЛДСП",
        qty: 0,
      });
    });

    expect(props.setError).toHaveBeenCalledWith(
      "Заполните поля заказа полок: изделие, материал и количество."
    );
  });

  it("calls createShipmentPlanCell with correct section and load on success", async () => {
    OrderService.createShipmentPlanCell.mockResolvedValueOnce({ ok: true });
    const props = makeProps();
    const { result } = renderHook(() => useFurnitureActions(props));

    await act(async () => {
      await result.current.createShelfPlanOrder({
        week: "18",
        item: "Полка",
        material: "ЛДСП",
        qty: 3,
        article: "PL-01",
        qrQty: 0,
      });
    });

    expect(OrderService.createShipmentPlanCell).toHaveBeenCalledWith(
      expect.objectContaining({ sectionName: "Система хранения" })
    );
    expect(props.load).toHaveBeenCalledTimes(1);
  });
});

describe("useFurnitureActions – createFurniturePlanOrder", () => {
  it("calls createShipmentPlanCell with Основная мебель section", async () => {
    OrderService.createShipmentPlanCell.mockResolvedValueOnce({ ok: true });
    const props = makeProps();
    const { result } = renderHook(() => useFurnitureActions(props));

    await act(async () => {
      await result.current.createFurniturePlanOrder({
        week: "20",
        item: "Стол",
        material: "Дуб",
        qty: 2,
        article: "T-10",
      });
    });

    expect(OrderService.createShipmentPlanCell).toHaveBeenCalledWith(
      expect.objectContaining({ sectionName: "Основная мебель" })
    );
  });
});

describe("useFurnitureActions – importMetalFromExcelFile", () => {
  it("denies action when not canOperateProduction", async () => {
    const props = makeProps({ canOperateProduction: false });
    const { result } = renderHook(() => useFurnitureActions(props));

    await act(async () => {
      await result.current.importMetalFromExcelFile(new File([""], "test.xlsx"));
    });

    expect(props.denyActionByRole).toHaveBeenCalledWith(
      "Недостаточно прав для импорта остатков металла."
    );
  });

  it("does nothing when file is null", async () => {
    const props = makeProps();
    const { result } = renderHook(() => useFurnitureActions(props));

    await act(async () => {
      await result.current.importMetalFromExcelFile(null);
    });

    expect(props.setActionLoading).not.toHaveBeenCalled();
  });
});
