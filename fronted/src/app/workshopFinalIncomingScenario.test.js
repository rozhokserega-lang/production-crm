import { describe, expect, it } from "vitest";
import {
  WORKSHOP_INCOMING_TEST_ORDER_ID,
  applyFinalReadyToWarehouseKit,
  createWorkshopIncomingTestOrder,
  listWarehouseIncomingOrders,
  listWorkshopFinalTabOrders,
  orderIdOf,
} from "./workshopFinalIncomingScenario";
import { normalizeOrder } from "./rowHelpers";

describe("сценарий: Финал → Что приедет → Готово", () => {
  it("тестовый заказ на финале виден в цехе и на складе", () => {
    const testOrder = createWorkshopIncomingTestOrder();
    const noise = normalizeOrder({
      order_id: "OTHER-1",
      item: "Другой заказ",
      assembly_status: "В работе",
      overall_status: "В работе",
      week: "84",
      qty: 1,
    });
    const rows = [noise, testOrder];

    const finalTab = listWorkshopFinalTabOrders(rows);
    const incoming = listWarehouseIncomingOrders(rows);

    expect(finalTab.map(orderIdOf)).toContain(WORKSHOP_INCOMING_TEST_ORDER_ID);
    expect(incoming.map(orderIdOf)).toContain(WORKSHOP_INCOMING_TEST_ORDER_ID);
    expect(finalTab.map(orderIdOf).sort()).toEqual(incoming.map(orderIdOf).sort());
  });

  it("после «Готово» на финале заказ пропадает с финала и с «Что приедет»", () => {
    const testOrder = createWorkshopIncomingTestOrder();
    const afterReady = applyFinalReadyToWarehouseKit(testOrder);
    const rows = [afterReady];

    expect(listWorkshopFinalTabOrders(rows).map(orderIdOf)).not.toContain(
      WORKSHOP_INCOMING_TEST_ORDER_ID,
    );
    expect(listWarehouseIncomingOrders(rows).map(orderIdOf)).not.toContain(
      WORKSHOP_INCOMING_TEST_ORDER_ID,
    );
    expect(String(afterReady.overallStatus || "")).toMatch(/комплектац/i);
  });

  it("полный цикл: появился → готово → исчез", () => {
    let rows = [
      normalizeOrder({
        order_id: "BG-1",
        item: "Фон",
        assembly_status: "Собрано",
        overall_status: "В работе",
        week: "80",
        qty: 1,
      }),
    ];

    expect(listWarehouseIncomingOrders(rows).map(orderIdOf)).not.toContain(
      WORKSHOP_INCOMING_TEST_ORDER_ID,
    );

    rows = [...rows, createWorkshopIncomingTestOrder()];
    expect(listWarehouseIncomingOrders(rows).map(orderIdOf)).toContain(
      WORKSHOP_INCOMING_TEST_ORDER_ID,
    );

    rows = rows.map((r) =>
      orderIdOf(r) === WORKSHOP_INCOMING_TEST_ORDER_ID
        ? applyFinalReadyToWarehouseKit(r)
        : r,
    );
    expect(listWarehouseIncomingOrders(rows).map(orderIdOf)).not.toContain(
      WORKSHOP_INCOMING_TEST_ORDER_ID,
    );
  });
});
