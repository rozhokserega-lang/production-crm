import { getOrderStageDisplayLabel, getOverviewLaneId, isOrderProductionPlanComplete, resolvePipelineStage } from "../orderPipeline";
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
  warehouse_kit: "Склад (комплектация)",
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

        const stageKey = getShipmentStageKey(c, sourceRow, shipmentOrderMaps, it.item, it.material);
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
  const completedOrders = [];

  let qtyTotal = 0;
  let qtyCompleted = 0;
  let completedCount = 0;

  for (const o of list) {
    const lane = getPlanStatsLaneId(o);
    stageBreakdown[lane] = (stageBreakdown[lane] || 0) + 1;
    const qty = Number(o?.qty || 0);
    qtyTotal += qty;
    const rawItem = readOrderItem(o);
    const display = formatEmbeddedPlanItem(rawItem);
    const orderCard = {
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
    };
    if (isOrderProductionPlanComplete(o)) {
      completedCount += 1;
      qtyCompleted += qty;
      completedOrders.push(orderCard);
    } else {
      blockingOrders.push(orderCard);
    }
  }

  const byItem = (a, b) => String(a.item).localeCompare(String(b.item), "ru");
  blockingOrders.sort((a, b) => String(a.laneLabel).localeCompare(String(b.laneLabel), "ru") || byItem(a, b));
  completedOrders.sort(byItem);

  const orderCount = list.length;
  const percent = orderCount > 0 ? Math.round((completedCount / orderCount) * 100) : 0;

  const rawWeeks = [...new Set(
    list.map((o) => String(o?.week ?? "").trim()).filter(Boolean)
  )];

  return {
    week: weekLabel,
    weekKey: normalizePlanWeek(weekLabel) || weekLabel,
    rawWeeks,
    orderCount,
    completedCount,
    /** @deprecated используйте completedCount */
    shippedCount: completedCount,
    openCount: orderCount - completedCount,
    qtyTotal,
    qtyCompleted,
    /** @deprecated используйте qtyCompleted */
    qtyShipped: qtyCompleted,
    percent,
    isClosed: orderCount > 0 && completedCount === orderCount,
    stageBreakdown,
    blockingOrders,
    completedOrders,
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
  const completedCount = plans.reduce((s, p) => s + p.completedCount, 0);
  const closedPlans = plans.filter((p) => p.isClosed).length;
  const percent = orderCount > 0 ? Math.round((completedCount / orderCount) * 100) : 0;

  const blockingPlans = plans
    .filter((p) => !p.isClosed)
    .map((p) => ({
      week: p.week,
      openCount: p.openCount,
      blockingOrders: p.blockingOrders,
    }));

  // Выполненные заказы по неделям месяца — для просмотра «что уже выпущено».
  const completedPlans = plans
    .filter((p) => p.completedCount > 0)
    .map((p) => ({
      week: p.week,
      completedCount: p.completedCount,
      completedOrders: p.completedOrders,
    }));

  const missingWeeks = weekLabels.filter((w) => !plansByWeek.has(w));

  return {
    id: month.id,
    name: month.name,
    isHidden: Boolean(month?.isHidden),
    weeks: weekLabels,
    planCount: weekLabels.length,
    plansFound: plans.length,
    missingWeeks,
    closedPlans,
    openPlans: plans.length - closedPlans,
    orderCount,
    completedCount,
    /** @deprecated используйте completedCount */
    shippedCount: completedCount,
    openCount: orderCount - completedCount,
    percent,
    isClosed: weekLabels.length > 0 && plans.length === weekLabels.length && plans.every((p) => p.isClosed),
    blockingPlans,
    completedPlans,
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
    isHidden: Boolean(row?.isHidden ?? row?.is_hidden),
  };
}

/** Месяцы, видимые в селектах и основном списке (без архивных). */
export function filterVisiblePlanMonths(months) {
  return (months || []).filter((m) => !m?.isHidden);
}

/** Найти месяц, в который входит указанный номер плана (недели). */
export function findPlanMonthByWeek(months, week) {
  const target = normalizePlanWeek(week);
  if (!target) return null;
  return (
    (months || []).find((month) =>
      (month?.weeks || []).some((w) => normalizePlanWeek(w) === target),
    ) || null
  );
}

/** Недели выбранного месяца. */
export function resolvePlanMonthWeeks(months, monthId) {
  const month = (months || []).find((m) => String(m.id) === String(monthId));
  return sortPlanWeeks((month?.weeks || []).map(normalizePlanWeek).filter(Boolean));
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

/** Все недели месяца входят в фильтр. */
export function isPlanMonthFullySelected(month, weekFilter) {
  const weeks = sortPlanWeeks((month?.weeks || []).map(normalizePlanWeek).filter(Boolean));
  if (!weeks.length) return false;
  const selectedSet = new Set(normalizeWeekFilter(weekFilter));
  return weeks.every((w) => selectedSet.has(w));
}

/** Месяцы, выбранные целиком (все их недели в фильтре). */
export function getFullySelectedPlanMonths(months, weekFilter) {
  return (months || []).filter((m) => isPlanMonthFullySelected(m, weekFilter));
}

/** Переключить недели месяца в фильтре (мультивыбор месяцев). */
export function togglePlanMonthWeeksInFilter(month, weekFilter) {
  const monthWeeks = sortPlanWeeks((month?.weeks || []).map(normalizePlanWeek).filter(Boolean));
  if (!monthWeeks.length) return weekFilter;
  const selected = normalizeWeekFilter(weekFilter);
  const selectedSet = new Set(selected);
  const fullySelected = monthWeeks.every((w) => selectedSet.has(w));
  const next = fullySelected
    ? selected.filter((w) => !monthWeeks.includes(w))
    : sortPlanWeeks([...selected, ...monthWeeks]);
  return next.length ? next : "all";
}

/** Подпись фильтра месяцев для UI. */
export function formatPlanMonthFilterLabel(months, weekFilter, { loading = false } = {}) {
  if (loading && !(months || []).length) return "Месяцы…";
  const active = getFullySelectedPlanMonths(months, weekFilter);
  if (!active.length) return "Все месяцы";
  if (active.length === 1) return active[0].name;
  if (active.length === 2) return active.map((m) => m.name).join(", ");
  return `${active.length} мес.`;
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
