import { getOverviewLaneId, isOrderCustomerShipped, PipelineStage, resolvePipelineStage } from "../orderPipeline";
import { isWorkshopStrapOrderItem } from "./workshopStrapNeeds";

function isAssemblyCompleteForFinal(order, isDone) {
  const assemblyStatus = String(order?.assemblyStatus ?? order?.assembly_status ?? "");
  if (isDone(assemblyStatus)) return true;
  const stage = resolvePipelineStage(order);
  return stage === PipelineStage.ASSEMBLED || stage === PipelineStage.READY_TO_SHIP;
}

/** Заказы на вкладке «Финал» в производстве (ещё не ушли на комплектацию). */
export function isWorkshopFinalIncomingOrder(order, { isDone, isOrderCustomerShipped: isShipped }) {
  const overallStatus = String(order?.overallStatus ?? order?.overall_status ?? order?.overall ?? "");
  const assemblyDone = isAssemblyCompleteForFinal(order, isDone);
  const shipped = isShipped(order);
  const onPackaging = /упаков/i.test(overallStatus);
  const lane = getOverviewLaneId(order);
  const strapPlankOrder = isWorkshopStrapOrderItem(order?.item);

  if (lane === "warehouse_kit") return false;
  if (strapPlankOrder && (lane === "ready_to_ship" || lane === "shipped")) return false;
  if (strapPlankOrder) return false;

  return assemblyDone && !onPackaging && !shipped && lane !== "warehouse_kit";
}

export function filterWorkshopFinalIncomingOrders(orders, helpers) {
  return (Array.isArray(orders) ? orders : []).filter((o) => isWorkshopFinalIncomingOrder(o, helpers));
}

export function sortWorkshopFinalIncomingOrders(orders) {
  return [...orders].sort((a, b) => {
    const wa = Number(a.week);
    const wb = Number(b.week);
    if (Number.isFinite(wa) && Number.isFinite(wb) && wa !== wb) return wa - wb;
    return String(a.item || "").localeCompare(String(b.item || ""), "ru");
  });
}
