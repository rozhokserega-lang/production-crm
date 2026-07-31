import { applyOptimisticOrderRow, isDone } from "./appUtils";
import { isOrderCustomerShipped } from "../orderPipeline";
import { normalizeOrder } from "./rowHelpers";
import { filterWorkshopFinalIncomingOrders } from "./workshopFinalIncoming";

/** Маркер тестового заказа в сценариях «Финал ↔ Что приедет». */
export const WORKSHOP_INCOMING_TEST_ORDER_ID = "TEST-INCOMING-FINAL";

const incomingHelpers = { isDone, isOrderCustomerShipped };

/** Заказ на вкладке «Финал» (сборка завершена, ещё не на комплектации). */
export function createWorkshopIncomingTestOrder(overrides = {}) {
  return normalizeOrder({
    order_id: WORKSHOP_INCOMING_TEST_ORDER_ID,
    item: "[TEST] Склад — что приедет",
    material: "Тестовый материал",
    week: "99",
    qty: 1,
    pilka_status: "Готово",
    kromka_status: "Готово",
    pras_status: "Готово",
    assembly_status: "Собрано",
    overall_status: "В работе",
    ...overrides,
  });
}

/** То же, что кнопка «Готово» на финале (webSetWarehouseKitReady). */
export function applyFinalReadyToWarehouseKit(order) {
  const patched = applyOptimisticOrderRow(order, "webSetWarehouseKitReady");
  return normalizeOrder(patched);
}

export function listWorkshopFinalTabOrders(orders) {
  const rows = (Array.isArray(orders) ? orders : []).map((o) =>
    o?.orderId || o?.order_id ? normalizeOrder(o) : o,
  );
  return filterWorkshopFinalIncomingOrders(rows, incomingHelpers);
}

/** Список для вкладки «Что приедет» на складе — тот же фильтр, что «Финал». */
export function listWarehouseIncomingOrders(orders) {
  return listWorkshopFinalTabOrders(orders);
}

export function orderIdOf(row) {
  return String(row?.orderId || row?.order_id || "").trim();
}
