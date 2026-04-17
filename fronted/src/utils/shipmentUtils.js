import { PipelineStage, resolvePipelineStage } from "../orderPipeline";
import { isBlueCell, isRedCell, isYellowCell, parseColor } from "./colorUtils";

export function normText(v) {
  return String(v || "").trim().toLowerCase();
}

export function sectionSortKey(name, sectionOrder = []) {
  const n = normText(name);
  const idx = sectionOrder.findIndex((x) => normText(x) === n);
  return idx === -1 ? 999 : idx;
}

export function isStorageLikeName(text) {
  const t = normText(text);
  if (!t) return false;
  if (t.includes("система хранения")) return true;
  // Частые имена тех-позиций хранения: "387_330 Вотан", "587_330 Сонома" и т.п.
  if (/^\d{2,4}\s*[_xх]\s*\d{2,4}\b/.test(t)) return true;
  return false;
}

export function isObvyazkaSectionName(name) {
  return normText(name).includes("обвяз");
}

export function isGarbageShipmentItemName(text) {
  const t = normText(text);
  if (!t) return false;
  if (t === "123" || t === "ава") return true;
  if (t.includes("[obv-")) return true;
  return false;
}

export function shipmentOrderItemWeekKey(itemName, week) {
  return `${normText(itemName)}|${String(week || "").trim()}`;
}

/** Согласование этапа отгрузки с pipeline заказа (Производство ↔ Отгрузка). */
export function mapPipelineStageToShipmentKey(order) {
  const ps = resolvePipelineStage(order);
  const pilka = String(order?.pilkaStatus || "").toLowerCase();
  const kromka = String(order?.kromkaStatus || "").toLowerCase();
  const pras = String(order?.prasStatus || "").toLowerCase();
  switch (ps) {
    case PipelineStage.SHIPPED:
      return "shipped";
    case PipelineStage.READY_TO_SHIP:
    case PipelineStage.ASSEMBLED:
      return "assembled_wait_ship";
    case PipelineStage.WORKSHOP_COMPLETE:
      return "ready_assembly";
    case PipelineStage.PRAS:
      if (pras.includes("в работе")) return "on_pras_work";
      return "on_pras_wait";
    case PipelineStage.KROMKA:
      if (kromka.includes("в работе") || kromka.includes("пауза")) return "on_kromka_work";
      return "on_kromka_wait";
    case PipelineStage.PILKA:
    default:
      if (pilka.includes("в работе") || pilka.includes("пауза")) return "on_pilka_work";
      return "on_pilka_wait";
  }
}

function shipmentOrderKey(sourceRow, week) {
  return `${String(sourceRow || "").trim()}|${String(week || "").trim()}`;
}

export function getShipmentStageKey(c, sourceRow, orderMaps, itemName) {
  if (!c) return "awaiting";
  if (c.canSendToWork && !c.inWork) return "awaiting";
  const rowKey = shipmentOrderKey(sourceRow, c.week);
  let order = orderMaps?.byRowWeek?.get(rowKey);
  if (!order && itemName && orderMaps?.byItemWeek) {
    order = orderMaps.byItemWeek.get(shipmentOrderItemWeekKey(itemName, c.week));
  }
  if (order) {
    return mapPipelineStageToShipmentKey(order);
  }
  // Fallback for cells without bound order: if already in work,
  // show active pilka stage instead of "waiting launch".
  if (c.inWork) return "on_pilka_work";
  if (isRedCell(c.bg)) return "shipped";
  if (isBlueCell(c.bg)) return "on_kromka_work";
  if (isYellowCell(c.bg)) return "on_pilka_work";
  return "awaiting";
}

export function getShipmentCellStatus(c) {
  if (!c) return "Статус неизвестен";
  const materialInfoText =
    Number(c.sheetsNeeded || 0) > 0
      ? `\n📦 Доступно листов (E): ${Number(c.availableSheets || 0)}\n${
          c.materialEnoughForOrder ? "✅ На этот заказ материала хватает" : "❌ На этот заказ материала не хватает"
        }`
      : "";
  const calcText =
    Number(c.sheetsNeeded || 0) > 0
      ? `\n📐 На заказ: ${c.sheetsNeeded} лист(ов) (B=${Number(c.outputPerSheet || 0)} изд/лист)`
      : "";
  const extraText = c.canSendToWork ? calcText + materialInfoText : "";
  if (String(c.note || "").trim()) return String(c.note).trim() + extraText;
  if (c.canSendToWork) return "Готово к отправке в работу" + extraText;
  if (c.inWork) return "Уже отправлено в работу";
  const { r, g, b } = parseColor(c.bg);
  if (r == null) return "Статус неизвестен";
  if (r > 180 && g < 100 && b < 100) return "Отправлено (красная ячейка)";
  if (g > 150 && r < 140 && b < 140) return "Собрано";
  if (r > 200 && g > 150 && b < 120) return "Пауза / ожидание";
  if (b > 140 && r < 140) return "Этап выполнен";
  if (r > 180 && g > 120 && b < 80) return "Присадка готова";
  return "Статус по цвету";
}

export function getShipmentCellStatusShort(c) {
  if (!c) return "Статус";
  if (c.canSendToWork) return "Не начато";
  if (c.inWork) return "В работе";
  if (isRedCell(c.bg)) return "Выполнено";
  if (isYellowCell(c.bg)) return "Пауза";
  if (isBlueCell(c.bg)) return "Этап";
  return "Статус";
}
