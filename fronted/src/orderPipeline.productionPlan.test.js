import { describe, expect, it } from "vitest";
import { isOrderProductionPlanComplete, PipelineStage } from "./orderPipeline";

describe("isOrderProductionPlanComplete", () => {
  it("true для warehouse_kit, ready_to_ship и shipped", () => {
    for (const stage of [
      PipelineStage.WAREHOUSE_KIT,
      PipelineStage.READY_TO_SHIP,
      PipelineStage.SHIPPED,
    ]) {
      expect(isOrderProductionPlanComplete({ pipelineStage: stage })).toBe(true);
    }
  });

  it("false для стадий производства", () => {
    for (const stage of [
      PipelineStage.PILKA,
      PipelineStage.KROMKA,
      PipelineStage.PRAS,
      PipelineStage.WORKSHOP_COMPLETE,
      PipelineStage.ASSEMBLED,
    ]) {
      expect(isOrderProductionPlanComplete({ pipelineStage: stage })).toBe(false);
    }
  });

  it("false для позиций «Ожидаю заказ»", () => {
    expect(
      isOrderProductionPlanComplete({
        pipelineStage: PipelineStage.WAREHOUSE_KIT,
        _planStatsSource: "awaiting",
      }),
    ).toBe(false);
  });
});
