import { describe, expect, it } from "vitest";
import { applyRealtimeOrdersChange } from "./realtimeOrderPatch";

const baseRows = [
  {
    order_id: "SP-1",
    item: "полка 587x340",
    pilka_status: "Готово",
    kromka_status: "Готово",
    pras_status: "В работе",
    assembly_status: "",
    pipeline_stage: "pras",
  },
];

describe("applyRealtimeOrdersChange", () => {
  it("merges partial UPDATE without dropping existing fields", () => {
    const next = applyRealtimeOrdersChange(baseRows, {
      eventType: "UPDATE",
      new: {
        order_id: "SP-1",
        pras_status: "Готово",
        pipeline_stage: "workshop_complete",
      },
    });
    expect(next).toHaveLength(1);
    expect(next[0].item).toBe("полка 587x340");
    expect(next[0].prasStatus).toBe("Готово");
    expect(next[0].pipelineStage).toBe("workshop_complete");
  });

  it("removes row on DELETE", () => {
    const next = applyRealtimeOrdersChange(baseRows, {
      eventType: "DELETE",
      old: { order_id: "SP-1" },
    });
    expect(next).toEqual([]);
  });

  it("appends row on INSERT", () => {
    const next = applyRealtimeOrdersChange(baseRows, {
      eventType: "INSERT",
      new: {
        order_id: "SP-2",
        item: "полка 387x340",
        pilka_status: "Готово",
        kromka_status: "Готово",
        pras_status: "Готово",
        assembly_status: "",
        pipeline_stage: "workshop_complete",
      },
    });
    expect(next).toHaveLength(2);
    expect(next[1].orderId).toBe("SP-2");
    expect(next[1].pipelineStage).toBe("workshop_complete");
  });
});
