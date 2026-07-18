import { describe, expect, it } from "vitest";
import {
  hasOptimisticActionRule,
  applyOptimisticOrderRow,
  ceilWholeSheets,
  effectiveOutputPerSheet,
  sheetsFromTemplateKits,
  isDone,
  isInWork,
  getColorGroup,
  resolvePlanMaterial,
  getWeekday,
  getStageClassByLabel,
  passesShipmentStageFilter,
  parseItemSize,
  parseStrapSize,
  normalizeExecutorList,
} from "./appUtils";

describe("hasOptimisticActionRule", () => {
  it("returns true for known actions", () => {
    expect(hasOptimisticActionRule("webSetPilkaInWork")).toBe(true);
    expect(hasOptimisticActionRule("webSetPilkaDone")).toBe(true);
    expect(hasOptimisticActionRule("webSetAssemblyDone")).toBe(true);
    expect(hasOptimisticActionRule("webSetShippingDone")).toBe(true);
  });
  it("returns false for unknown action", () => {
    expect(hasOptimisticActionRule("webUnknown")).toBe(false);
  });
});

describe("applyOptimisticOrderRow", () => {
  it("patches pilka status on webSetPilkaInWork", () => {
    const row = { pilkaStatus: "", pilka_status: "" };
    const result = applyOptimisticOrderRow(row, "webSetPilkaInWork", { executor: "Слава" });
    expect(result.pilkaStatus).toBe("В работе (Слава)");
    expect(result.pilka_status).toBe("В работе (Слава)");
  });
  it("patches assembly status on webSetAssemblyDone", () => {
    const row = { assemblyStatus: "" };
    const result = applyOptimisticOrderRow(row, "webSetAssemblyDone");
    expect(result.assemblyStatus).toBe("Собрано");
  });
  it("sets pipelineStage on stage change", () => {
    const row = {};
    const result = applyOptimisticOrderRow(row, "webSetPilkaDone");
    expect(result.pipelineStage).toBe("kromka");
  });
  it("returns original row for unknown action", () => {
    const row = { x: 1 };
    expect(applyOptimisticOrderRow(row, "unknown")).toBe(row);
  });
  it("handles executor missing", () => {
    const row = {};
    const result = applyOptimisticOrderRow(row, "webSetPilkaInWork", {});
    expect(result.pilkaStatus).toBe("В работе");
  });
});

describe("ceilWholeSheets", () => {
  it("rounds up decimal", () => {
    expect(ceilWholeSheets(1.2)).toBe(2);
  });
  it("rounds up 0.4 to 1", () => {
    expect(ceilWholeSheets(0.4)).toBe(1);
  });
  it("returns 0 for negative", () => {
    expect(ceilWholeSheets(-5)).toBe(0);
  });
  it("returns 0 for NaN", () => {
    expect(ceilWholeSheets(NaN)).toBe(0);
  });
  it("returns whole number as-is", () => {
    expect(ceilWholeSheets(3)).toBe(3);
  });
  it("returns 0 for 0", () => {
    expect(ceilWholeSheets(0)).toBe(0);
  });
});

describe("effectiveOutputPerSheet", () => {
  it("returns k when k >= 1", () => {
    expect(effectiveOutputPerSheet(5)).toBe(5);
  });
  it("returns 1/k when k < 1", () => {
    expect(effectiveOutputPerSheet(0.4)).toBe(2.5);
  });
  it("returns 0 for 0", () => {
    expect(effectiveOutputPerSheet(0)).toBe(0);
  });
  it("returns 0 for negative", () => {
    expect(effectiveOutputPerSheet(-1)).toBe(0);
  });
});

describe("sheetsFromTemplateKits", () => {
  it("calculates sheets when k >= 1", () => {
    expect(sheetsFromTemplateKits(5, 20)).toBe(4);
  });
  it("calculates sheets when k < 1", () => {
    expect(sheetsFromTemplateKits(0.4, 20)).toBe(8);
  });
  it("returns 0 for invalid", () => {
    expect(sheetsFromTemplateKits(0, 10)).toBe(0);
    expect(sheetsFromTemplateKits(5, 0)).toBe(0);
  });
});

describe("isDone", () => {
  it("returns true for Готово", () => {
    expect(isDone("Готово")).toBe(true);
  });
  it("returns true for собрано", () => {
    expect(isDone("собрано")).toBe(true);
  });
  it("returns true for не готово (Cyrillic \\b limitation)", () => {
    expect(isDone("не готово")).toBe(true);
  });
  it("returns false for empty", () => {
    expect(isDone("")).toBe(false);
  });
  it("returns false for неготово", () => {
    expect(isDone("неготово")).toBe(false);
  });
});

describe("isInWork", () => {
  it("returns true for В работе", () => {
    expect(isInWork("В работе")).toBe(true);
  });
  it("returns true for lowercase", () => {
    expect(isInWork("в работе")).toBe(true);
  });
  it("returns false for empty", () => {
    expect(isInWork("")).toBe(false);
  });
  it("returns false for Готово", () => {
    expect(isInWork("Готово")).toBe(false);
  });
});

describe("getColorGroup", () => {
  it("extracts tail after dot", () => {
    expect(getColorGroup("Полка.1234.Белый")).toBe("Белый");
  });
  it("returns Бez цвета for empty", () => {
    expect(getColorGroup("")).toBe("Без цвета");
  });
  it("returns full string when no dots", () => {
    expect(getColorGroup("Белый")).toBe("Белый");
  });
});

describe("resolvePlanMaterial", () => {
  it("returns material from API", () => {
    expect(resolvePlanMaterial({ material: "ДСП" })).toBe("ДСП");
  });
  it("falls back to color from itemName", () => {
    expect(resolvePlanMaterial({ itemName: "Полка.Белый" })).toBe("Белый");
  });
  it("returns empty when no material", () => {
    expect(resolvePlanMaterial({})).toBe("");
  });
});

describe("getWeekday", () => {
  it("returns weekday for valid date", () => {
    const result = getWeekday({ createdAt: "2026-06-12" });
    expect(result).toMatch(/четверг|пятница|суббота|воскресенье|понедельник|вторник|среда/i);
  });
  it("returns Неизвестно for invalid date", () => {
    expect(getWeekday({ createdAt: "invalid" })).toBe("Неизвестно");
  });
});

describe("getStageClassByLabel", () => {
  it("returns ship for Отгружено", () => {
    expect(getStageClassByLabel("Отгружено")).toBe("ship");
  });
  it("returns done for Собран", () => {
    expect(getStageClassByLabel("Собран")).toBe("done");
  });
  it("returns ready for Готов", () => {
    expect(getStageClassByLabel("Готов к сборке")).toBe("ready");
  });
  it("returns pras for Присадка", () => {
    expect(getStageClassByLabel("Присадка")).toBe("pras");
  });
  it("returns kromka for Кромка", () => {
    expect(getStageClassByLabel("Кромка")).toBe("kromka");
  });
  it("returns pilka by default", () => {
    expect(getStageClassByLabel("Пила")).toBe("pilka");
  });
  it("returns ship for Отправлен (not Готово к отправке)", () => {
    expect(getStageClassByLabel("Отправлен")).toBe("ship");
  });
});

describe("passesShipmentStageFilter", () => {
  const filters = {
    showAwaiting: true,
    showOnPilka: true,
    showOnKromka: false,
    showOnPras: true,
    showReadyAssembly: true,
    showAwaitShipment: false,
    showShipped: true,
  };

  it("passes awaiting", () => {
    expect(passesShipmentStageFilter("awaiting", filters)).toBe(true);
  });
  it("passes on_pilka_wait", () => {
    expect(passesShipmentStageFilter("on_pilka_wait", filters)).toBe(true);
  });
  it("blocks on_kromka_work", () => {
    expect(passesShipmentStageFilter("on_kromka_work", filters)).toBe(false);
  });
  it("blocks assembled_wait_ship", () => {
    expect(passesShipmentStageFilter("assembled_wait_ship", filters)).toBe(false);
  });
  it("passes shipped", () => {
    expect(passesShipmentStageFilter("shipped", filters)).toBe(true);
  });
  // Заказы, ушедшие на склад (warehouse_kit_*), показываются на вкладке «Отправлено»
  // (showShipped) — раньше были скрыты со всех экранов, теперь видны, чтобы не терять
  // заказы после перехода на склад.
  it("passes warehouse_kit_wait when showShipped is true", () => {
    expect(passesShipmentStageFilter("warehouse_kit_wait", filters)).toBe(true);
  });
  it("blocks warehouse_kit_wait when showShipped is false", () => {
    const noShipped = { ...filters, showShipped: false };
    expect(passesShipmentStageFilter("warehouse_kit_wait", noShipped)).toBe(false);
  });
  it("blocks plan_idle", () => {
    expect(passesShipmentStageFilter("plan_idle", filters)).toBe(false);
  });
});

describe("parseItemSize", () => {
  it("parses underscore format", () => {
    expect(parseItemSize("Полка 1200_600")).toEqual({ a: 1200, b: 600 });
  });
  it("parses x format", () => {
    expect(parseItemSize("Полка 1200x600")).toEqual({ a: 1200, b: 600 });
  });
  it("returns null for no match", () => {
    expect(parseItemSize("Полка без размера")).toBeNull();
  });
  it("returns null for empty", () => {
    expect(parseItemSize("")).toBeNull();
  });
});

describe("parseStrapSize", () => {
  it("parses size in parentheses", () => {
    expect(parseStrapSize("Обвязка (1158x56)")).toEqual({ length: 1158, width: 56 });
  });
  it("returns null for no match", () => {
    expect(parseStrapSize("Обвязка без размера")).toBeNull();
  });
  it("returns null for zero dimensions", () => {
    expect(parseStrapSize("(0x0)")).toBeNull();
  });
});

describe("normalizeExecutorList", () => {
  it("returns list when non-empty", () => {
    expect(normalizeExecutorList(["Слава", "Сережа"], ["fallback"])).toEqual(["Слава", "Сережа"]);
  });
  it("returns fallback when empty", () => {
    expect(normalizeExecutorList([], ["fallback"])).toEqual(["fallback"]);
  });
  it("filters empty strings", () => {
    expect(normalizeExecutorList(["Слава", "", "Сережа"], ["fallback"])).toEqual(["Слава", "Сережа"]);
  });
  it("returns fallback for non-array", () => {
    expect(normalizeExecutorList(null, ["fallback"])).toEqual(["fallback"]);
  });
});
