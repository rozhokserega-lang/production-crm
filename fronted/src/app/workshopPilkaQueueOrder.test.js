import { describe, expect, it } from "vitest";
import {
  compareWorkshopPilkaRows,
  mergePilkaQueueWithRows,
  reorderPilkaQueueIds,
} from "./workshopPilkaQueueOrder";

describe("workshopPilkaQueueOrder", () => {
  it("reorders ids by drag target", () => {
    expect(reorderPilkaQueueIds(["A", "B", "C"], "C", "A")).toEqual(["C", "A", "B"]);
  });

  it("appends new row ids to saved queue", () => {
    expect(
      mergePilkaQueueWithRows(["B"], [{ orderId: "A" }, { orderId: "B" }]),
    ).toEqual(["B", "A"]);
  });

  it("sorts by manual rank after in-work and paused", () => {
    const rows = [
      { orderId: "B", item: "Б", pilkaStatus: "Ожидает" },
      { orderId: "A", item: "А", pilkaStatus: "Ожидает" },
      { orderId: "C", item: "В", pilkaStatus: "В работе" },
    ];
    const sorted = [...rows].sort((a, b) =>
      compareWorkshopPilkaRows(a, b, ["A", "B"], {
        isRowInWork: (o) => /работ/i.test(String(o.pilkaStatus || "")),
        isRowPaused: () => false,
      }),
    );
    expect(sorted.map((r) => r.orderId)).toEqual(["C", "A", "B"]);
  });
});
