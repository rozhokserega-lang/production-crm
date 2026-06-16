import { PipelineStage, resolvePipelineStage } from "../orderPipeline";
import { stripPlanItemMeta } from "../app/orderHelpers";
import { isBlueCell, isRedCell, isYellowCell, parseColor } from "./colorUtils";

export function normText(v) {
  return String(v || "").trim().toLowerCase();
}

/** Сравнение имён секций: регистр, пробелы, ё/е. */
export function normSectionKey(name) {
  return normText(String(name || "").replace(/ё/g, "е"));
}

export function getPlanSectionVariant(planSection) {
  const key = normSectionKey(planSection);
  if (key.endsWith(" белый")) {
    return { base: key.slice(0, -" белый".length).trim(), variant: "white" };
  }
  if (key.endsWith(" черный")) {
    return { base: key.slice(0, -" черный".length).trim(), variant: "black" };
  }
  return { base: key, variant: null };
}

export function sectionNamesMatch(a, b) {
  return normSectionKey(a) === normSectionKey(b);
}

/** Строка каталога подходит для выбранной секции плана (учитывает «… белый» / «… черный»). */
export function catalogSectionMatchesPlanSection(catalogSection, planSection) {
  const cat = normSectionKey(catalogSection);
  const plan = normSectionKey(planSection);
  if (cat === plan) return true;
  const { base, variant } = getPlanSectionVariant(planSection);
  return Boolean(variant) && cat === base;
}

export function isWhitePlanCatalogItemName(itemName) {
  return /(белый|белые ноги)/i.test(String(itemName || ""));
}

export function itemMatchesPlanSectionVariant(itemName, planSection, sectionOptions = []) {
  const { base, variant } = getPlanSectionVariant(planSection);
  const options = Array.isArray(sectionOptions) ? sectionOptions : [];
  const hasWhiteAlias = options.some((name) => normSectionKey(name) === `${base} белый`);
  const isWhiteItem = isWhitePlanCatalogItemName(itemName);

  if (variant === "white") return isWhiteItem;
  if (variant === "black") return !isWhiteItem;
  if (hasWhiteAlias && normSectionKey(planSection) === base) return !isWhiteItem;
  return true;
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

export function shipmentOrderItemWeekKey(itemName, week, material = "") {
  const itemKey = normText(itemName);
  const weekKey = String(week || "").trim();
  const materialKey = normText(material);
  return materialKey ? `${itemKey}|${weekKey}|${materialKey}` : `${itemKey}|${weekKey}`;
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
    case PipelineStage.WAREHOUSE_KIT: {
      const overall = String(order?.overallStatus || order?.overall_status || order?.overall || "").toLowerCase();
      if (overall.includes("комплектация готова")) return "warehouse_kit_done";
      if (overall.includes("в комплектации")) return "warehouse_kit_work";
      return "warehouse_kit_wait";
    }
    case PipelineStage.PILKA:
      if (pilka.includes("в работе") || pilka.includes("пауза")) return "on_pilka_work";
      return "on_pilka_wait";
    default:
      return "plan_idle";
  }
}

function shipmentOrderKey(sourceRow, week) {
  return `${String(sourceRow || "").trim()}|${String(week || "").trim()}`;
}

function lookupItemWeekOrder(orderMaps, itemName, week, material = "") {
  if (!itemName || !orderMaps?.byItemWeek) return null;
  const mat = String(material || "").trim();
  const names = [String(itemName || "").trim()];
  const stripped = stripPlanItemMeta(names[0]);
  if (stripped && stripped !== names[0]) names.push(stripped);
  for (const name of names) {
    let order = orderMaps.byItemWeek.get(shipmentOrderItemWeekKey(name, week, mat));
    if (order) return order;
    order = orderMaps.byItemWeek.get(shipmentOrderItemWeekKey(name, week));
    if (order) return order;
  }
  return null;
}


function resolveCellFallbackStageKey(c) {
  if (!c) return "plan_idle";
  if (c.canSendToWork && !c.inWork) return "awaiting";
  // Активная работа: цвет ячейки ещё может подсказать этап.
  if (c.inWork) {
    if (isRedCell(c.bg)) return "shipped";
    if (isBlueCell(c.bg)) return "on_kromka_work";
    return "on_pilka_work";
  }
  // Без in_work цвет часто «застрял» после прохождения производства — не трактуем жёлтый как «на пиле».
  if (isRedCell(c.bg)) return "shipped";
  if (isBlueCell(c.bg)) return "on_kromka_wait";
  return "plan_idle";
}

export function getShipmentStageKey(c, sourceRow, orderMaps, itemName, materialName = "") {
  if (!c) return "awaiting";
  // Ячейка готова к пуску — показываем «Ожидаю заказ», даже если по item+week
  // в БД ещё висит предыдущий заказ (типично для повторной обвязки со склада).
  if (c.canSendToWork && !c.inWork) {
    return resolveCellFallbackStageKey(c);
  }
  const material = String(materialName || (c?.material ?? c?.material_name ?? "")).trim();
  const rowKey = shipmentOrderKey(sourceRow, c.week);
  let order = orderMaps?.byRowWeek?.get(rowKey);
  if (!order && itemName) {
    order = lookupItemWeekOrder(orderMaps, itemName, c.week, material);
  }
  if (order) {
    return mapPipelineStageToShipmentKey(order);
  }
  return resolveCellFallbackStageKey(c);
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
