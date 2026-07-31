import { describe, expect, it } from "vitest";
import { isDone } from "./appUtils";
import { isOrderCustomerShipped } from "../orderPipeline";
import { filterWorkshopFinalIncomingOrders } from "./workshopFinalIncoming";
import { normalizeOrder } from "./rowHelpers";

const helpers = { isDone, isOrderCustomerShipped };

describe("workshopFinalIncoming", () => {
  it("включает заказ «готово к отправке» по pipeline", () => {
    const row = normalizeOrder({
      item: "Тумба",
      assembly_status: "",
      overall_status: "Готово к отправке",
      pipeline_stage: "ready_to_ship",
      week: "84",
      qty: 2,
    });
    expect(filterWorkshopFinalIncomingOrders([row], helpers).length).toBe(1);
  });

  it("включает только собранные заказы на финале", () => {
    const rows = [
      normalizeOrder({ item: "Стол", assembly_status: "Собрано", overall_status: "В работе", week: "84", qty: 2 }),
      normalizeOrder({ item: "Стул", assembly_status: "В работе", overall_status: "В работе", week: "84", qty: 1 }),
    ];
    expect(filterWorkshopFinalIncomingOrders(rows, helpers).map((r) => r.item)).toEqual(["Стол"]);
  });
});
