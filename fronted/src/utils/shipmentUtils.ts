import { PipelineStage, resolvePipelineStage } from "../orderPipeline";
import { isBlueCell, isRedCell, isYellowCell, parseColor } from "./colorUtils";

export function normText(v: string): string {
  return String(v || "").trim().toLowerCase();
}

export function sectionSortKey(name: string, sectionOrder: string[] = []): number {
  const n = normText(name);
  const idx = sectionOrder.findIndex((x) => normText(x) === n);
  return idx === -1 ? 999 : idx;
}

export function isStorageLikeName(text: string): boolean {
  const t = normText(text);
  if (!t) return false;
  if (t.includes("система хранения")) return true;
  if (/^\d{2,4}\s*[_xх]\s*\d{2,4}\b/.test(t)) return true;
  return false;
}

export function isObvyazkaSectionName(name: string): boolean {
  return normText(name).includes("обвяз");
}

export function isGarbageShipmentItemName(text: string): boolean {
  const t = normText(text);
  if (!t) return false;
  if (t === "123" || t === "ава") return true;
  if (t.includes("[obv-")) return true;
  return false;
}

export function shipmentOrderItemWeekKey(itemName: string, week: string): string {
  return `${normText(itemName)}|${String(week || "").trim()}`;
}

/** Согласование этапа отгрузки с pipeline заказа (Производство ↔ Отгрузка). */
export function mapPipelineStageToShipmentKey(order: Record<string, unknown>): string {
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

function shipmentOrderKey(sourceRow: string, week: string): string {
  return `${String(sourceRow || "").trim()}|${String(week || "").trim()}`;
}

interface CellLike {
  week?: string;
  canSendToWork?: boolean;
  inWork?: boolean;
  bg?: string;
  sheetsNeeded?: number;
  availableSheets?: number;
  outputPerSheet?: number;
  materialEnoughForOrder?: boolean;
  note?: string;
}

interface OrderMaps {
  byRowWeek?: Map<string, Record<string, unknown>>;
  byItemWeek?: Map<string, Record<string, unknown>>;
}

export function getShipmentStageKey(
  c: CellLike | null | undefined,
  sourceRow: string,
  orderMaps: OrderMaps | undefined,
  itemName: string,
): string {
  if (!c) return "awaiting";
  const rowKey = shipmentOrderKey(sourceRow, c.week || "");
  let order = orderMaps?.byRowWeek?.get(rowKey);
  if (!order && itemName && orderMaps?.byItemWeek) {
    order = orderMaps.byItemWeek.get(shipmentOrderItemWeekKey(itemName, c.week || ""));
  }
  if (order) {
    return mapPipelineStageToShipmentKey(order);
  }
  if (c.canSendToWork && !c.inWork) return "awaiting";
  if (c.inWork) return "on_pilka_work";
  if (isRedCell(c.bg || "")) return "shipped";
  if (isBlueCell(c.bg || "")) return "on_kromka_work";
  if (isYellowCell(c.bg || "")) return "on_pilka_work";
  return "awaiting";
}

export function getShipmentCellStatus(c: CellLike | null | undefined): string {
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
  const { r, g, b } = parseColor(c.bg || "");
  if (r == null || g == null || b == null) return "Статус неизвестен";
  if (r > 180 && g < 100 && b < 100) return "Отправлено (красная ячейка)";
  if (g > 150 && r < 140 && b < 140) return "Собрано";
  if (r > 200 && g > 150 && b < 120) return "Пауза / ожидание";
  if (b > 140 && r < 140) return "Этап выполнен";
  if (r > 180 && g > 120 && b < 80) return "Присадка готова";
  return "Статус по цвету";
}

export function getShipmentCellStatusShort(c: CellLike | null | undefined): string {
  if (!c) return "Статус";
  if (c.canSendToWork) return "Не начато";
  if (c.inWork) return "В работе";
  if (isRedCell(c.bg || "")) return "Выполнено";
  if (isYellowCell(c.bg || "")) return "Пауза";
  if (isBlueCell(c.bg || "")) return "Этап";
  return "Статус";
}
