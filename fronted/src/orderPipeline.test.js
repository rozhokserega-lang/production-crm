import { describe, it, expect } from "vitest";
import {
  PipelineStage,
  resolvePipelineStage,
  inferPipelineStage,
  isWorkshopLineDone,
  isCustomerShippedOverall,
  getOrderStageDisplayLabel,
  getOverviewLaneId,
  isOrderCustomerShipped,
  OVERVIEW_LANE_READY_TO_SHIP,
  OVERVIEW_LANE_SHIPPED,
  OVERVIEW_LANE_WORKSHOP_COMPLETE,
  OVERVIEW_LANE_ASSEMBLED,
  OVERVIEW_POST_PRODUCTION_LANE_IDS,
} from "./orderPipeline";

describe("PipelineStage constants", () => {
  it("defines all expected stages", () => {
    expect(PipelineStage.PILKA).toBe("pilka");
    expect(PipelineStage.KROMKA).toBe("kromka");
    expect(PipelineStage.PRAS).toBe("pras");
    expect(PipelineStage.WORKSHOP_COMPLETE).toBe("workshop_complete");
    expect(PipelineStage.ASSEMBLED).toBe("assembled");
    expect(PipelineStage.READY_TO_SHIP).toBe("ready_to_ship");
    expect(PipelineStage.SHIPPED).toBe("shipped");
  });
});

describe("isWorkshopLineDone", () => {
  it("returns true for 'готов' status", () => {
    expect(isWorkshopLineDone("готов")).toBe(true);
    expect(isWorkshopLineDone("ГОТОВ")).toBe(true);
    expect(isWorkshopLineDone("Готов")).toBe(true);
  });

  it("returns true for 'собрано' status", () => {
    expect(isWorkshopLineDone("собрано")).toBe(true);
    expect(isWorkshopLineDone("СОБРАНО")).toBe(true);
  });

  it("returns false for 'в работе' status", () => {
    expect(isWorkshopLineDone("в работе")).toBe(false);
  });

  it("returns false for empty status", () => {
    expect(isWorkshopLineDone("")).toBe(false);
    expect(isWorkshopLineDone(null)).toBe(false);
    expect(isWorkshopLineDone(undefined)).toBe(false);
  });
});

describe("isCustomerShippedOverall", () => {
  it("returns true for 'отгружено'", () => {
    expect(isCustomerShippedOverall("Отгружено")).toBe(true);
  });

  it("returns true for 'упаковано'", () => {
    expect(isCustomerShippedOverall("Упаковано")).toBe(true);
  });

  it("returns true for 'отправлен'", () => {
    expect(isCustomerShippedOverall("Отправлен")).toBe(true);
  });

  it("returns false for 'Отправлен на пилу'", () => {
    expect(isCustomerShippedOverall("Отправлен на пилу")).toBe(false);
  });

  it("returns false for 'Готово к отправке'", () => {
    expect(isCustomerShippedOverall("Готово к отправке")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isCustomerShippedOverall("")).toBe(false);
  });
});

describe("inferPipelineStage", () => {
  it("returns SHIPPED when overall indicates shipment", () => {
    const order = { overallStatus: "Отгружено" };
    expect(inferPipelineStage(order)).toBe(PipelineStage.SHIPPED);
  });

  it("returns READY_TO_SHIP when overall is 'готово к отправке'", () => {
    const order = { overallStatus: "Готово к отправке" };
    expect(inferPipelineStage(order)).toBe(PipelineStage.READY_TO_SHIP);
  });

  it("returns ASSEMBLED when assembly is 'собрано'", () => {
    const order = { assemblyStatus: "собрано" };
    expect(inferPipelineStage(order)).toBe(PipelineStage.ASSEMBLED);
  });

  it("returns WORKSHOP_COMPLETE when all three lines are done", () => {
    const order = {
      pilkaStatus: "готов",
      kromkaStatus: "готов",
      prasStatus: "готов",
    };
    expect(inferPipelineStage(order)).toBe(PipelineStage.WORKSHOP_COMPLETE);
  });

  it("returns PRAS when pilka and kromka are done but pras is not", () => {
    const order = {
      pilkaStatus: "готов",
      kromkaStatus: "готов",
      prasStatus: "в работе",
    };
    expect(inferPipelineStage(order)).toBe(PipelineStage.PRAS);
  });

  it("returns KROMKA when pilka is done but kromka is not", () => {
    const order = {
      pilkaStatus: "готов",
      kromkaStatus: "в работе",
      prasStatus: "",
    };
    expect(inferPipelineStage(order)).toBe(PipelineStage.KROMKA);
  });

  it("returns PILKA when pilka is not done", () => {
    const order = {
      pilkaStatus: "в работе",
      kromkaStatus: "",
      prasStatus: "",
    };
    expect(inferPipelineStage(order)).toBe(PipelineStage.PILKA);
  });

  it("returns PILKA for empty order", () => {
    expect(inferPipelineStage({})).toBe(PipelineStage.PILKA);
  });

  it("handles snake_case field names", () => {
    const order = {
      pilka_status: "готов",
      kromka_status: "готов",
      pras_status: "готов",
    };
    expect(inferPipelineStage(order)).toBe(PipelineStage.WORKSHOP_COMPLETE);
  });

  it("handles short field names (pilka/kromka/pras)", () => {
    const order = {
      pilka: "готов",
      kromka: "готов",
      pras: "в работе",
    };
    expect(inferPipelineStage(order)).toBe(PipelineStage.PRAS);
  });
});

describe("resolvePipelineStage", () => {
  it("uses pipelineStage when it is a known value", () => {
    const order = { pipelineStage: "shipped", pilkaStatus: "в работе" };
    expect(resolvePipelineStage(order)).toBe("shipped");
  });

  it("uses pipeline_stage (snake_case) when known", () => {
    const order = { pipeline_stage: "assembled", pilkaStatus: "в работе" };
    expect(resolvePipelineStage(order)).toBe("assembled");
  });

  it("falls back to inferPipelineStage when pipelineStage is unknown", () => {
    const order = { pipelineStage: "unknown_stage", pilkaStatus: "готов" };
    expect(resolvePipelineStage(order)).toBe(PipelineStage.KROMKA);
  });

  it("falls back to inferPipelineStage when pipelineStage is null", () => {
    const order = { pipelineStage: null, pilkaStatus: "готов" };
    expect(resolvePipelineStage(order)).toBe(PipelineStage.KROMKA);
  });

  it("falls back to inferPipelineStage when pipelineStage is undefined", () => {
    const order = { pilkaStatus: "готов" };
    expect(resolvePipelineStage(order)).toBe(PipelineStage.KROMKA);
  });
});

describe("getOrderStageDisplayLabel", () => {
  it("returns 'Отгружено' for shipped", () => {
    expect(getOrderStageDisplayLabel({ overallStatus: "Отгружено" })).toBe("Отгружено");
  });

  it("returns 'Готово к отправке' for ready_to_ship", () => {
    expect(getOrderStageDisplayLabel({ overallStatus: "Готово к отправке" })).toBe("Готово к отправке");
  });

  it("returns 'Собран' for assembled", () => {
    expect(getOrderStageDisplayLabel({ assemblyStatus: "собрано" })).toBe("Собран");
  });

  it("returns 'Готов' for workshop_complete", () => {
    const order = { pilkaStatus: "готов", kromkaStatus: "готов", prasStatus: "готов" };
    expect(getOrderStageDisplayLabel(order)).toBe("Готов");
  });

  it("returns 'Присадка' for pras", () => {
    const order = { pilkaStatus: "готов", kromkaStatus: "готов", prasStatus: "в работе" };
    expect(getOrderStageDisplayLabel(order)).toBe("Присадка");
  });

  it("returns 'Кромка' for kromka", () => {
    const order = { pilkaStatus: "готов", kromkaStatus: "в работе" };
    expect(getOrderStageDisplayLabel(order)).toBe("Кромка");
  });

  it("returns 'Пила' for pilka", () => {
    const order = { pilkaStatus: "в работе" };
    expect(getOrderStageDisplayLabel(order)).toBe("Пила");
  });
});

describe("getOverviewLaneId", () => {
  it("returns 'pilka' for PILKA stage", () => {
    expect(getOverviewLaneId({ pilkaStatus: "в работе" })).toBe("pilka");
  });

  it("returns 'kromka' for KROMKA stage", () => {
    expect(getOverviewLaneId({ pilkaStatus: "готов", kromkaStatus: "в работе" })).toBe("kromka");
  });

  it("returns 'pras' for PRAS stage", () => {
    const order = { pilkaStatus: "готов", kromkaStatus: "готов", prasStatus: "в работе" };
    expect(getOverviewLaneId(order)).toBe("pras");
  });

  it("returns workshop_complete lane for WORKSHOP_COMPLETE", () => {
    const order = { pilkaStatus: "готов", kromkaStatus: "готов", prasStatus: "готов" };
    expect(getOverviewLaneId(order)).toBe(OVERVIEW_LANE_WORKSHOP_COMPLETE);
  });

  it("returns assembled lane for ASSEMBLED", () => {
    expect(getOverviewLaneId({ assemblyStatus: "собрано" })).toBe(OVERVIEW_LANE_ASSEMBLED);
  });

  it("returns ready_to_ship lane for READY_TO_SHIP", () => {
    expect(getOverviewLaneId({ overallStatus: "Готово к отправке" })).toBe(OVERVIEW_LANE_READY_TO_SHIP);
  });

  it("returns shipped lane for SHIPPED", () => {
    expect(getOverviewLaneId({ overallStatus: "Отгружено" })).toBe(OVERVIEW_LANE_SHIPPED);
  });
});

describe("isOrderCustomerShipped", () => {
  it("returns true for shipped orders", () => {
    expect(isOrderCustomerShipped({ overallStatus: "Отгружено" })).toBe(true);
  });

  it("returns false for non-shipped orders", () => {
    expect(isOrderCustomerShipped({ pilkaStatus: "в работе" })).toBe(false);
  });
});

describe("OVERVIEW_POST_PRODUCTION_LANE_IDS", () => {
  it("contains ready_to_ship and shipped", () => {
    expect(OVERVIEW_POST_PRODUCTION_LANE_IDS).toContain(OVERVIEW_LANE_READY_TO_SHIP);
    expect(OVERVIEW_POST_PRODUCTION_LANE_IDS).toContain(OVERVIEW_LANE_SHIPPED);
    expect(OVERVIEW_POST_PRODUCTION_LANE_IDS).toHaveLength(2);
  });
});
