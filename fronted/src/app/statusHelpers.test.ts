import { describe, it, expect } from "vitest";
import { statusClass, stageLabel, stageBg, getOverallStatusDisplay } from "./statusHelpers";

describe("stageLabel", () => {
  it("returns correct labels for all known stage keys", () => {
    expect(stageLabel("awaiting")).toBe("Ожидаю заказ");
    expect(stageLabel("on_pilka_wait")).toBe("На пиле (ожидает запуск)");
    expect(stageLabel("on_pilka_work")).toBe("На пиле");
    expect(stageLabel("on_kromka_wait")).toBe("Ожидает кромку");
    expect(stageLabel("on_kromka_work")).toBe("На кромке");
    expect(stageLabel("on_pras_wait")).toBe("Ожидает присадку");
    expect(stageLabel("on_pras_work")).toBe("На присадке");
    expect(stageLabel("ready_assembly")).toBe("Готово к сборке");
    expect(stageLabel("assembled_wait_ship")).toBe("Собран, ждет отправку");
    expect(stageLabel("shipped")).toBe("Отправлен");
  });

  it("returns fallback for unknown stage key", () => {
    expect(stageLabel("unknown")).toBe("Статус неизвестен");
    expect(stageLabel("")).toBe("Статус неизвестен");
  });
});

describe("stageBg", () => {
  it("returns correct background colors for all known stage keys", () => {
    expect(stageBg("awaiting")).toBe("#ffffff");
    expect(stageBg("on_pilka_wait")).toBe("#fff7cc");
    expect(stageBg("on_pilka_work")).toBe("#ffe066");
    expect(stageBg("on_kromka_wait")).toBe("#dbeafe");
    expect(stageBg("on_kromka_work")).toBe("#3b82f6");
    expect(stageBg("on_pras_wait")).toBe("#ffddb5");
    expect(stageBg("on_pras_work")).toBe("#8b5a2b");
    expect(stageBg("ready_assembly")).toBe("#f59e0b");
    expect(stageBg("assembled_wait_ship")).toBe("#22c55e");
    expect(stageBg("shipped")).toBe("#d31d1d");
  });

  it("returns rawBg for unknown stage key", () => {
    expect(stageBg("unknown", "#abc123")).toBe("#abc123");
  });

  it("returns #ffffff fallback when rawBg is not provided for unknown stage", () => {
    expect(stageBg("unknown")).toBe("#ffffff");
  });
});

describe("statusClass", () => {
  it("returns 'done' for shipped orders", () => {
    const order = { overallStatus: "Отгружено" };
    expect(statusClass(order)).toBe("done");
  });

  it("returns 'done' for ready_to_ship orders", () => {
    const order = { overallStatus: "Готово к отправке" };
    expect(statusClass(order)).toBe("done");
  });

  it("returns 'done' for assembled orders", () => {
    const order = { assemblyStatus: "собрано" };
    expect(statusClass(order)).toBe("done");
  });

  it("returns 'done' when assemblyStatus contains 'СОБРАНО'", () => {
    const order = { assemblyStatus: "СОБРАНО" };
    expect(statusClass(order)).toBe("done");
  });

  it("returns 'pause' for paused pilka stage", () => {
    const order = { pilkaStatus: "Пауза", pilka: "Пауза" };
    expect(statusClass(order)).toBe("pause");
  });

  it("returns 'pause' for paused kromka stage", () => {
    const order = { pilkaStatus: "готов", kromkaStatus: "Пауза" };
    expect(statusClass(order)).toBe("pause");
  });

  it("returns 'pause' for paused pras stage", () => {
    const order = { pilkaStatus: "готов", kromkaStatus: "готов", prasStatus: "Пауза" };
    expect(statusClass(order)).toBe("pause");
  });

  it("returns 'work' for in-work pilka stage", () => {
    const order = { pilkaStatus: "В работе" };
    expect(statusClass(order)).toBe("work");
  });

  it("returns 'work' for in-work kromka stage", () => {
    const order = { pilkaStatus: "готов", kromkaStatus: "В работе" };
    expect(statusClass(order)).toBe("work");
  });

  it("returns 'work' for in-work pras stage", () => {
    const order = { pilkaStatus: "готов", kromkaStatus: "готов", prasStatus: "В работе" };
    expect(statusClass(order)).toBe("work");
  });

  it("returns 'wait' for awaiting stage", () => {
    const order = { pilkaStatus: "Ожидает" };
    expect(statusClass(order)).toBe("wait");
  });

  it("returns 'wait' for empty order", () => {
    expect(statusClass({})).toBe("wait");
  });
});

describe("getOverallStatusDisplay", () => {
  it("returns computed label when raw overall is empty", () => {
    const order = { pilkaStatus: "В работе" };
    expect(getOverallStatusDisplay(order)).toBe("На пиле");
  });

  it("returns raw overall when it is not a legacy pilka status", () => {
    const order = { overallStatus: "На кромке", pilkaStatus: "готов", kromkaStatus: "В работе" };
    expect(getOverallStatusDisplay(order)).toBe("На кромке");
  });

  it("returns computed label when legacy 'Отправлен на пилу' is stale", () => {
    const order = { overallStatus: "Отправлен на пилу", pilkaStatus: "готов", kromkaStatus: "В работе" };
    expect(getOverallStatusDisplay(order)).toBe("На кромке");
  });

  it("keeps 'Отправлен на пилу' when order is actually on pilka", () => {
    const order = { overallStatus: "Отправлен на пилу", pilkaStatus: "В работе" };
    expect(getOverallStatusDisplay(order)).toBe("Отправлен на пилу");
  });
});
