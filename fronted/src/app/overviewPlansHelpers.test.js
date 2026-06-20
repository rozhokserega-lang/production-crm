import { describe, expect, it } from "vitest";
import { PipelineStage } from "../orderPipeline";
import { buildPlanSummary } from "./overviewPlansHelpers";

function orderAt(stage, overrides = {}) {
  const stageLabels = {
    [PipelineStage.PILKA]: { overall: "Пила", assembly: "" },
    [PipelineStage.WORKSHOP_COMPLETE]: { overall: "Цех", assembly: "собрано" },
    [PipelineStage.WAREHOUSE_KIT]: { overall: "Комплектация", assembly: "собрано" },
    [PipelineStage.READY_TO_SHIP]: { overall: "Готово к отправке", assembly: "собрано" },
    [PipelineStage.SHIPPED]: { overall: "Отгружено", assembly: "собрано" },
  };
  const labels = stageLabels[stage] || { overall: stage, assembly: "" };
  return {
    orderId: "1",
    week: "24",
    qty: 1,
    item: "Тест",
    pipelineStage: stage,
    overallStatus: labels.overall,
    assemblyStatus: labels.assembly,
    ...overrides,
  };
}

describe("buildPlanSummary — план производства", () => {
  it("считает заказ закрытым на warehouse_kit", () => {
    const summary = buildPlanSummary("24", [
      orderAt(PipelineStage.WAREHOUSE_KIT),
      orderAt(PipelineStage.PILKA),
    ]);
    expect(summary.completedCount).toBe(1);
    expect(summary.openCount).toBe(1);
    expect(summary.percent).toBe(50);
    expect(summary.isClosed).toBe(false);
    expect(summary.blockingOrders).toHaveLength(1);
    expect(summary.blockingOrders[0].laneLabel).toBe("Пила");
  });

  it("закрывает план когда все заказы ушли на склад или дальше", () => {
    const summary = buildPlanSummary("24", [
      orderAt(PipelineStage.WAREHOUSE_KIT),
      orderAt(PipelineStage.READY_TO_SHIP),
      orderAt(PipelineStage.SHIPPED),
    ]);
    expect(summary.completedCount).toBe(3);
    expect(summary.isClosed).toBe(true);
    expect(summary.blockingOrders).toHaveLength(0);
  });

  it("не считает позиции «Ожидаю заказ» выпущенными", () => {
    const summary = buildPlanSummary("24", [
      { week: "24", qty: 2, item: "Обвязка", _planStatsSource: "awaiting" },
    ]);
    expect(summary.completedCount).toBe(0);
    expect(summary.blockingOrders[0].laneLabel).toBe("Ожидаю заказ");
  });
});
