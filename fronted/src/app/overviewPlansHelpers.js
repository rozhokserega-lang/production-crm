import { PipelineStage, getOrderStageDisplayLabel, getOverviewLaneId, resolvePipelineStage } from "../orderPipeline";
import { formatEmbeddedPlanItem } from "./orderHelpers";
import { isWorkshopStrapOrderItem } from "./workshopStrapNeeds";
import { matchesWeekFilter, normalizeWeekFilter } from "./weekFilterUtils";
import { getShipmentStageKey, isGarbageShipmentItemName, isObvyazkaSectionName } from "../utils/shipmentUtils";

export const PLAN_MONTHS_STORAGE_KEY = "crm_overview_plan_months";

const AWAITING_LANE = "awaiting";

const LANE_LABELS = {
  awaiting: "Ожидаю заказ",
  pilka: "Пила",
  kromka: "Кромка",
  pras: "Присадка",
  workshop_complete: "Сборка",
  assembled: "Сборка",
  ready_to_ship: "Отправка",
  shipped: "Отгружено",
};

/** Нормализация номера плана (недели) — только цифры, как в БД. */
export function normalizePlanWeek(week) {
  const digits = String(week ?? "").replace(/\D/g, "");
  return digits || "";
}

export function planWeekLabel(week) {
  const key = normalizePlanWeek(week);
  return key || "Без плана";
}

export function sortPlanWeeks(weeks) {
  return [...weeks].sort((a, b) => {
    const na = Number(normalizePlanWeek(a));
    const nb = Number(normalizePlanWeek(b));
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return String(a).localeCompare(String(b), "ru", { numeric: true });
  });
}

function laneLabel(laneId) {
  return LANE_LABELS[laneId] || laneId || "—";
}

export { LANE_LABELS, laneLabel };

function readOrderId(order) {
  return String(order?.orderId || order?.order_id || "").trim();
}

function readOrderItem(order) {
  return String(order?.item || order?.itemName || order?.item_label || order?.itemLabel || "—").trim();
}

function isOrderShipped(order) {
  if (order?._planStatsSource === "awaiting") return false;
  return resolvePipelineStage(order) === PipelineStage.SHIPPED;
}

function getPlanStatsLaneId(order) {
  if (order?._planStatsSource === "awaiting") return AWAITING_LANE;
  return getOverviewLaneId(order);
}

function getPlanStatsStageLabel(order) {
  if (order?._planStatsSource === "awaiting") return "Ожидаю заказ";
  return getOrderStageDisplayLabel(order);
}

function isStrapOrderForPlanStats(order) {
  const item = readOrderItem(order);
  return isWorkshopStrapOrderItem(item) || /обвязка/i.test(item);
}

/** Позиции плана на доске отгрузки в статусе «Ожидаю заказ» (ещё не отправлены в работу). */
export function collectAwaitingPlanOrders(shipmentBoard, shipmentOrderMaps, weekFilter = "all") {
  const out = [];
  const sections = Array.isArray(shipmentBoard?.sections) ? shipmentBoard.sections : [];

  for (const section of sections) {
    const sectionName = String(section?.name || "").trim();
    if (isObvyazkaSectionName(sectionName)) continue;

    for (const it of section.items || []) {
      const item = String(it?.item || "").trim();
      if (!item || isGarbageShipmentItemName(item)) continue;
      if (isStrapOrderForPlanStats({ item })) continue;

      const sourceRow = it.sourceRowId != null ? String(it.sourceRowId) : String(it.row || "");
      for (const c of it.cells || []) {
        if ((Number(c.qty) || 0) <= 0) continue;
        if (!matchesWeekFilter(c.week, weekFilter)) continue;

        const stageKey = getShipmentStageKey(c, sourceRow, shipmentOrderMaps, it.item);
        if (stageKey !== "awaiting") continue;

        const sourceCol = c.sourceColId != null ? String(c.sourceColId) : String(c.col || "");
        out.push({
          orderId: "",
          item,
          qty: Number(c.qty || 0),
          week: c.week,
          _planStatsSource: "awaiting",
          _awaitingKey: `${sourceRow}|${sourceCol}|${c.week}`,
        });
      }
    }
  }

  return out;
}

/** Заказы мебели без обвязки — только они участвуют в статистике планов. */
export function filterOrdersForPlanStats(orders) {
  return (orders || []).filter((o) => !isStrapOrderForPlanStats(o));
}

function mergeOrdersForPlanStats(pipelineOrders, awaitingOrders) {
  return [
    ...filterOrdersForPlanStats(pipelineOrders),
    ...(awaitingOrders || []),
  ];
}

/** Список уникальных номеров планов из заказов. */
export function collectAvailablePlanWeeks(orders, awaitingOrders = []) {
  const set = new Set();
  for (const o of mergeOrdersForPlanStats(orders, awaitingOrders)) {
    set.add(planWeekLabel(o?.week));
  }
  return sortPlanWeeks([...set]);
}

/** Агрегация одного плана (недели). */
export function buildPlanSummary(weekLabel, orders) {
  const list = orders || [];
  const stageBreakdown = {};
  const blockingOrders = [];

  let qtyTotal = 0;
  let qtyShipped = 0;
  let shippedCount = 0;

  for (const o of list) {
    const lane = getPlanStatsLaneId(o);
    stageBreakdown[lane] = (stageBreakdown[lane] || 0) + 1;
    const qty = Number(o?.qty || 0);
    qtyTotal += qty;
    if (isOrderShipped(o)) {
      shippedCount += 1;
      qtyShipped += qty;
    } else {
      const rawItem = readOrderItem(o);
      const display = formatEmbeddedPlanItem(rawItem);
      blockingOrders.push({
        orderId: readOrderId(o),
        item: display.title,
        article: display.article,
        qrQty: display.qrQty,
        qty,
        week: o?.week,
        stage: resolvePipelineStage(o),
        stageLabel: getPlanStatsStageLabel(o),
        laneLabel: laneLabel(lane),
        _awaitingKey: o?._awaitingKey || "",
      });
    }
  }

  blockingOrders.sort((a, b) =>
    String(a.laneLabel).localeCompare(String(b.laneLabel), "ru")
    || String(a.item).localeCompare(String(b.item), "ru")
  );

  const orderCount = list.length;
  const percent = orderCount > 0 ? Math.round((shippedCount / orderCount) * 100) : 0;

  const rawWeeks = [...new Set(
    list.map((o) => String(o?.week ?? "").trim()).filter(Boolean)
  )];

  return {
    week: weekLabel,
    weekKey: normalizePlanWeek(weekLabel) || weekLabel,
    rawWeeks,
    orderCount,
    shippedCount,
    openCount: orderCount - shippedCount,
    qtyTotal,
    qtyShipped,
    percent,
    isClosed: orderCount > 0 && shippedCount === orderCount,
    stageBreakdown,
    blockingOrders,
  };
}

/** Все планы из списка заказов (без обвязки) + позиции «Ожидаю заказ» с доски отгрузки. */
export function buildPlansSummary(orders, awaitingOrders = []) {
  const relevant = mergeOrdersForPlanStats(orders, awaitingOrders);
  const byWeek = new Map();
  for (const o of relevant) {
    const label = planWeekLabel(o?.week);
    if (!byWeek.has(label)) byWeek.set(label, []);
    byWeek.get(label).push(o);
  }

  return sortPlanWeeks([...byWeek.keys()]).map((week) =>
    buildPlanSummary(week, byWeek.get(week))
  );
}

/** Агрегация месяца из списка планов. */
export function buildMonthSummary(month, plansByWeek) {
  const weekLabels = sortPlanWeeks(
    (month?.weeks || []).map((w) => planWeekLabel(w)).filter(Boolean)
  );
  const plans = weekLabels
    .map((w) => plansByWeek.get(w))
    .filter(Boolean);

  const orderCount = plans.reduce((s, p) => s + p.orderCount, 0);
  const shippedCount = plans.reduce((s, p) => s + p.shippedCount, 0);
  const closedPlans = plans.filter((p) => p.isClosed).length;
  const percent = orderCount > 0 ? Math.round((shippedCount / orderCount) * 100) : 0;

  const blockingPlans = plans
    .filter((p) => !p.isClosed)
    .map((p) => ({
      week: p.week,
      openCount: p.openCount,
      blockingOrders: p.blockingOrders,
    }));

  const missingWeeks = weekLabels.filter((w) => !plansByWeek.has(w));

  return {
    id: month.id,
    name: month.name,
    weeks: weekLabels,
    planCount: weekLabels.length,
    plansFound: plans.length,
    missingWeeks,
    closedPlans,
    openPlans: plans.length - closedPlans,
    orderCount,
    shippedCount,
    openCount: orderCount - shippedCount,
    percent,
    isClosed: weekLabels.length > 0 && plans.length === weekLabels.length && plans.every((p) => p.isClosed),
    blockingPlans,
    plans,
  };
}

export function buildMonthsSummary(months, orders, awaitingOrders = []) {
  const plans = buildPlansSummary(orders, awaitingOrders);
  const plansByWeek = new Map(plans.map((p) => [p.week, p]));
  return (months || []).map((m) => buildMonthSummary(m, plansByWeek));
}

/** Нормализация строки месяца из API/БД. */
export function normalizePlanMonthRow(row) {
  return {
    id: Number(row?.id ?? row?.month_id ?? 0) || String(row?.id || ""),
    name: String(row?.name || "").trim(),
    weeks: sortPlanWeeks((row?.weeks || []).map(normalizePlanWeek).filter(Boolean)),
  };
}

/** Найти месяц, чьи недели точно совпадают с текущим фильтром недель. */
export function findPlanMonthByWeekFilter(months, weekFilter) {
  const selected = normalizeWeekFilter(weekFilter);
  if (!selected.length) return null;
  const selectedSet = new Set(selected);
  return (
    (months || []).find((month) => {
      const weeks = (month?.weeks || []).map((w) => String(w).trim()).filter(Boolean);
      if (!weeks.length || weeks.length !== selectedSet.size) return false;
      return weeks.every((w) => selectedSet.has(w));
    }) || null
  );
}

/** Однократная миграция из localStorage (legacy). */
export function loadPlanMonthsFromLocalStorage() {
  try {
    const raw = localStorage.getItem(PLAN_MONTHS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((m) => ({
        id: String(m?.id || crypto.randomUUID()),
        name: String(m?.name || "").trim(),
        weeks: sortPlanWeeks((m?.weeks || []).map(normalizePlanWeek).filter(Boolean)),
      }))
      .filter((m) => m.name);
  } catch {
    return [];
  }
}

export function clearPlanMonthsLocalStorage() {
  try {
    localStorage.removeItem(PLAN_MONTHS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
