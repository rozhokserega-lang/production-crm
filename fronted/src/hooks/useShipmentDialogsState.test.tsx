import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useShipmentDialogsState } from "./useShipmentDialogsState";

const defaultStrapOptions = ["Лента 12мм", "Лента 16мм", "Скобы"];

describe("useShipmentDialogsState", () => {
  it("initializes with all dialogs closed", () => {
    const { result } = renderHook(() => useShipmentDialogsState(defaultStrapOptions));
    expect(result.current.consumeDialogOpen).toBe(false);
    expect(result.current.strapDialogOpen).toBe(false);
    expect(result.current.planDialogOpen).toBe(false);
  });

  it("initializes strap draft with empty values for each option", () => {
    const { result } = renderHook(() => useShipmentDialogsState(defaultStrapOptions));
    expect(result.current.strapDraft).toEqual({
      "Лента 12мм": "",
      "Лента 16мм": "",
      "Скобы": "",
    });
  });

  it("opens and closes consume dialog", () => {
    const { result } = renderHook(() => useShipmentDialogsState(defaultStrapOptions));
    act(() => {
      result.current.setConsumeDialogOpen(true);
    });
    expect(result.current.consumeDialogOpen).toBe(true);
    act(() => {
      result.current.setConsumeDialogOpen(false);
    });
    expect(result.current.consumeDialogOpen).toBe(false);
  });

  it("sets consume dialog data", () => {
    const { result } = renderHook(() => useShipmentDialogsState(defaultStrapOptions));
    const data = { orderId: "A-1", material: "Egger" };
    act(() => {
      result.current.setConsumeDialogData(data);
    });
    expect(result.current.consumeDialogData).toEqual(data);
  });

  it("sets consume material and qty", () => {
    const { result } = renderHook(() => useShipmentDialogsState(defaultStrapOptions));
    act(() => {
      result.current.setConsumeMaterial("Egger White");
      result.current.setConsumeQty("5");
    });
    expect(result.current.consumeMaterial).toBe("Egger White");
    expect(result.current.consumeQty).toBe("5");
  });

  it("sets consume saving and error states", () => {
    const { result } = renderHook(() => useShipmentDialogsState(defaultStrapOptions));
    act(() => {
      result.current.setConsumeSaving(true);
      result.current.setConsumeError("Error message");
    });
    expect(result.current.consumeSaving).toBe(true);
    expect(result.current.consumeError).toBe("Error message");
  });

  it("opens and closes strap dialog", () => {
    const { result } = renderHook(() => useShipmentDialogsState(defaultStrapOptions));
    act(() => {
      result.current.setStrapDialogOpen(true);
    });
    expect(result.current.strapDialogOpen).toBe(true);
  });

  it("sets strap target product and week", () => {
    const { result } = renderHook(() => useShipmentDialogsState(defaultStrapOptions));
    act(() => {
      result.current.setStrapTargetProduct("Стол Компас");
      result.current.setStrapPlanWeek("2026-W17");
    });
    expect(result.current.strapTargetProduct).toBe("Стол Компас");
    expect(result.current.strapPlanWeek).toBe("2026-W17");
  });

  it("updates strap draft", () => {
    const { result } = renderHook(() => useShipmentDialogsState(defaultStrapOptions));
    act(() => {
      result.current.setStrapDraft((prev) => ({ ...prev, "Лента 12мм": "10" }));
    });
    expect(result.current.strapDraft["Лента 12мм"]).toBe("10");
  });

  it("sets strap items", () => {
    const { result } = renderHook(() => useShipmentDialogsState(defaultStrapOptions));
    const items = [{ name: "Лента 12мм", qty: 10 }];
    act(() => {
      result.current.setStrapItems(items);
    });
    expect(result.current.strapItems).toEqual(items);
  });

  it("opens and closes plan dialog", () => {
    const { result } = renderHook(() => useShipmentDialogsState(defaultStrapOptions));
    act(() => {
      result.current.setPlanDialogOpen(true);
    });
    expect(result.current.planDialogOpen).toBe(true);
  });

  it("sets plan dialog fields", () => {
    const { result } = renderHook(() => useShipmentDialogsState(defaultStrapOptions));
    act(() => {
      result.current.setPlanSection("Кухни");
      result.current.setPlanArticle("ART001");
      result.current.setPlanMaterial("Egger");
      result.current.setPlanWeek("2026-W17");
      result.current.setPlanQty("10");
    });
    expect(result.current.planSection).toBe("Кухни");
    expect(result.current.planArticle).toBe("ART001");
    expect(result.current.planMaterial).toBe("Egger");
    expect(result.current.planWeek).toBe("2026-W17");
    expect(result.current.planQty).toBe("10");
  });

  it("sets plan saving state", () => {
    const { result } = renderHook(() => useShipmentDialogsState(defaultStrapOptions));
    act(() => {
      result.current.setPlanSaving(true);
    });
    expect(result.current.planSaving).toBe(true);
  });
});
