import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWarehouseActions } from "./useWarehouseActions";

describe("useWarehouseActions", () => {
  it("calls setError when rows are empty", () => {
    const setError = vi.fn();
    const { result } = renderHook(() =>
      useWarehouseActions({ warehouseOrderPlanRows: [], setError })
    );

    result.current.printWarehouseOrderPlanPdf();

    expect(setError).toHaveBeenCalledWith(
      "Дефицита материалов нет — заказывать нечего."
    );
  });

  it("calls setError when popup is blocked", () => {
    const setError = vi.fn();
    vi.spyOn(window, "open").mockReturnValueOnce(null);

    const { result } = renderHook(() =>
      useWarehouseActions({
        warehouseOrderPlanRows: [
          { material: "ЛДСП", needed: 10, available: 4, toOrder: 6 },
        ],
        setError,
      })
    );

    result.current.printWarehouseOrderPlanPdf();

    expect(setError).toHaveBeenCalledWith(
      "Не удалось открыть окно печати. Разреши pop-up для сайта."
    );
  });

  it("opens popup and calls print when rows are present", () => {
    const setError = vi.fn();
    const mockPopup = {
      document: { write: vi.fn(), close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn(),
    };
    vi.spyOn(window, "open").mockReturnValueOnce(mockPopup);

    const { result } = renderHook(() =>
      useWarehouseActions({
        warehouseOrderPlanRows: [
          { material: "ЛДСП", needed: 10, available: 4, toOrder: 6 },
        ],
        setError,
      })
    );

    result.current.printWarehouseOrderPlanPdf();

    expect(mockPopup.document.write).toHaveBeenCalledTimes(1);
    expect(mockPopup.print).toHaveBeenCalledTimes(1);
    expect(setError).not.toHaveBeenCalled();
  });
});
