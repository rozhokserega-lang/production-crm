import { describe, expect, it } from "vitest";
import { statusClass, stageLabel, stageBg, getOverallStatusDisplay } from "./statusHelpers";

describe("statusClass", () => {
  it("returns 'done' for shipped order", () => {
    expect(statusClass({ pipelineStage: "shipped" })).toBe("done");
  });
  it("returns 'done' for ready_to_ship", () => {
    expect(statusClass({ pipeline_stage: "ready_to_ship" })).toBe("done");
  });
  it("returns 'done' for assembled", () => {
    expect(statusClass({ pipelineStage: "assembled" })).toBe("done");
  });
  it("returns 'done' when assemblyStatus contains СОБРАНО", () => {
    expect(statusClass({ pipelineStage: "pilka", assemblyStatus: "СОБРАНО" })).toBe("done");
  });
  it("returns 'pause' when pilka is on pause", () => {
    expect(statusClass({ pipelineStage: "pilka", pilkaStatus: "Пауза" })).toBe("pause");
  });
  it("returns 'work' when kromka is in work", () => {
    expect(statusClass({ pipelineStage: "kromka", kromkaStatus: "В работе" })).toBe("work");
  });
  it("returns 'wait' by default", () => {
    expect(statusClass({ pipelineStage: "pilka" })).toBe("wait");
  });
  it("returns 'done' for legacy assembled", () => {
    expect(statusClass({ pipelineStage: "pilka", assemblyStatus: "собрано" })).toBe("done");
  });
});

describe("stageLabel", () => {
  it("returns label for awaiting", () => {
    expect(stageLabel("awaiting")).toBe("Ожидаю заказ");
  });
  it("returns label for on_pilka_wait", () => {
    expect(stageLabel("on_pilka_wait")).toBe("На пиле (ожидает запуск)");
  });
  it("returns label for on_pilka_work", () => {
    expect(stageLabel("on_pilka_work")).toBe("На пиле");
  });
  it("returns label for on_kromka_work", () => {
    expect(stageLabel("on_kromka_work")).toBe("На кромке");
  });
  it("returns label for on_pras_work", () => {
    expect(stageLabel("on_pras_work")).toBe("На присадке");
  });
  it("returns label for ready_assembly", () => {
    expect(stageLabel("ready_assembly")).toBe("Готово к сборке");
  });
  it("returns label for assembled_wait_ship", () => {
    expect(stageLabel("assembled_wait_ship")).toBe("Собран, ждет отправку");
  });
  it("returns label for shipped", () => {
    expect(stageLabel("shipped")).toBe("Отправлен");
  });
  it("returns label for warehouse_kit_wait", () => {
    expect(stageLabel("warehouse_kit_wait")).toBe("На складе (ожидает)");
  });
  it("returns label for warehouse_kit_done", () => {
    expect(stageLabel("warehouse_kit_done")).toBe("Комплектация готова");
  });
  it("returns unknown for unknown stage", () => {
    expect(stageLabel("unknown")).toBe("Статус неизвестен");
  });
});

describe("stageBg", () => {
  it("returns white for awaiting", () => {
    expect(stageBg("awaiting")).toBe("#ffffff");
  });
  it("returns yellow for on_pilka_wait", () => {
    expect(stageBg("on_pilka_wait")).toBe("#fff7cc");
  });
  it("returns blue for on_kromka_work", () => {
    expect(stageBg("on_kromka_work")).toBe("#3b82f6");
  });
  it("returns green for assembled_wait_ship", () => {
    expect(stageBg("assembled_wait_ship")).toBe("#22c55e");
  });
  it("returns red for shipped", () => {
    expect(stageBg("shipped")).toBe("#d31d1d");
  });
  it("returns rawBg for unknown stage", () => {
    expect(stageBg("unknown", "#ff0000")).toBe("#ff0000");
  });
  it("returns white for unknown stage with no rawBg", () => {
    expect(stageBg("unknown")).toBe("#ffffff");
  });
});

describe("getOverallStatusDisplay", () => {
  it("returns computed stage label when no raw overall", () => {
    const result = getOverallStatusDisplay({ pipelineStage: "pilka" });
    expect(result).toContain("На пиле");
  });
  it("returns raw when not legacy pilka", () => {
    expect(getOverallStatusDisplay({ pipelineStage: "pilka", overallStatus: "В работе" })).toBe("В работе");
  });
  it("returns computed when legacy pilka but stage is kromka", () => {
    const result = getOverallStatusDisplay({ pipelineStage: "kromka", overallStatus: "Отправлен на пилу" });
    expect(result).toContain("ромк");
  });
  it("returns raw when legacy pilka and stage is pilka", () => {
    expect(getOverallStatusDisplay({ pipelineStage: "pilka", overallStatus: "Отправлен на пилу" })).toBe("Отправлен на пилу");
  });
});
