import { estimateLaborForItem } from "./laborNormCalculator";

/**
 * Дашборд загрузки цеха: расчёт очереди по этапам (Пила/Кромка/Присадка/Сборка).
 *
 * Логика «что считать в очередь этапа» (этап «в работе» считаем ПОЛНОСТЬЮ по норме —
 * решение продукта: не вычитаем прогресс внутри этапа):
 *   - Пила    в очередь: pilkaMin,    если !pilka_done    (заказ ещё не прошёл пилу)
 *   - Кромка  в очередь: kromkaMin,   если !kromka_done   (включая заказы на пиле — они ждут кромку)
 *   - Присадка в очередь: prasMin,    если !pras_done
 *   - Сборка  в очередь: assemblyMin, если !assembly_done
 * Это «очередь вниз по потоку» — корректно для прогноза загрузки: заказ на пиле всё
 * ещё ждёт кромку/присадку/сборку, поэтому их трудоёмкость входит в очереди этих этапов.
 *
 * Доступные часы этапа = hoursPerDay × workingDayCount × executors (исполнителей).
 * Дней до разгрузки = минуты очереди / (часы в день × 60 × исполнителей).
 * Подсветка (пороги — решение продукта): 🟢 ≤1 дня · 🟡 1–2 дня · 🔴 >2 дней.
 */

export const WORKSHOP_STAGES = ["pilka", "kromka", "pras", "assembly"];

export const WORKSHOP_STAGE_LABELS = {
  pilka: "Пила",
  kromka: "Кромка",
  pras: "Присадка",
  assembly: "Сборка",
};

const MIN_PER_HOUR = 60;
const GREEN_DAYS = 1;
const YELLOW_DAYS = 2;

/**
 * Определяет цвет подсветки этапа по числу дней до разгрузки очереди.
 * 🟢 ≤1 дня · 🟡 1–2 дня · 🔴 >2 дней.
 */
export function loadColorByDays(daysToClear) {
  const d = Number(daysToClear || 0);
  if (d <= GREEN_DAYS) return "green";
  if (d <= YELLOW_DAYS) return "yellow";
  return "red";
}

function emptyStage(stage, availableMinutesPerDay) {
  return {
    stage,
    label: WORKSHOP_STAGE_LABELS[stage],
    queueMinutes: 0,
    queueHours: 0,
    availableMinutesPerDay,
    availableHoursPerDay: availableMinutesPerDay / MIN_PER_HOUR,
    daysToClear: 0,
    color: "green",
    ordersCount: 0,
  };
}

/**
 * Главная функция расчёта загрузки цеха.
 *
 * @param {object}  args
 * @param {Array}   args.queueRows        — строки из RPC web_get_workshop_queue (order_id, item, qty, *_done).
 * @param {Array}   args.laborOrdersRows  — индекс норм/фактов из buildLaborOrdersRows.
 * @param {number}  args.hoursPerDay      — часов в смене (из workSchedule).
 * @param {number}  args.workingDayCount  — рабочих дней в неделе (из workSchedule).
 * @param {object}  [args.executorsPerStage] — { pilka: 1, kromka: 1, ... }; по умолчанию 1 на этап.
 * @returns {object} { stages: [...], queueRows: [...], totals, missingNormCount }
 */
export function computeWorkshopLoad({
  queueRows = [],
  laborOrdersRows = [],
  hoursPerDay = 8,
  workingDayCount = 5,
  executorsPerStage = {},
} = {}) {
  const safeHours = Math.max(0.1, Number(hoursPerDay) || 8);
  const safeDays = Math.max(1, Number(workingDayCount) || 5);
  const minutesPerDay = safeHours * MIN_PER_HOUR;

  const stages = WORKSHOP_STAGES.reduce((acc, stage) => {
    const executors = Math.max(1, Number(executorsPerStage[stage] || 1));
    acc[stage] = { ...emptyStage(stage, minutesPerDay * executors), executors };
    return acc;
  }, {});

  const enrichedRows = [];
  let missingNormCount = 0;

  (Array.isArray(queueRows) ? queueRows : []).forEach((raw) => {
    const orderId = String(raw?.order_id || raw?.orderId || "");
    const item = String(raw?.item || "");
    const qty = Math.max(0, Number(raw?.qty || 0));
    if (!item || qty <= 0) return;

    const est = estimateLaborForItem({ item, qty }, laborOrdersRows);
    const row = {
      orderId,
      item,
      qty,
      group: est.group,
      source: est.source,
      sourceLabel: est.sourceLabel,
      missing: Boolean(est.missing),
      pilkaMin: Number(est.pilkaMin || 0),
      kromkaMin: Number(est.kromkaMin || 0),
      prasMin: Number(est.prasMin || 0),
      assemblyMin: Number(est.assemblyMin || 0),
      totalMin: Number(est.totalMin || 0),
      pilkaDone: Boolean(raw?.pilka_done),
      kromkaDone: Boolean(raw?.kromka_done),
      prasDone: Boolean(raw?.pras_done),
      assemblyDone: Boolean(raw?.assembly_done),
      pipelineStage: String(raw?.pipeline_stage || ""),
    };
    if (row.missing) missingNormCount += 1;
    enrichedRows.push(row);

    // Распределяем минуты по этапам очереди («вниз по потоку»).
    if (!row.pilkaDone) {
      stages.pilka.queueMinutes += row.pilkaMin;
      stages.pilka.ordersCount += 1;
    }
    if (!row.kromkaDone) {
      stages.kromka.queueMinutes += row.kromkaMin;
      stages.kromka.ordersCount += 1;
    }
    if (!row.prasDone) {
      stages.pras.queueMinutes += row.prasMin;
      stages.pras.ordersCount += 1;
    }
    if (!row.assemblyDone) {
      stages.assembly.queueMinutes += row.assemblyMin;
      stages.assembly.ordersCount += 1;
    }
  });

  // Финализация: часы, дни до разгрузки, цвет.
  const stageList = WORKSHOP_STAGES.map((stageId) => {
    const s = stages[stageId];
    const minutesPerDay = s.availableMinutesPerDay;
    const daysToClear = minutesPerDay > 0 ? s.queueMinutes / minutesPerDay : 0;
    return {
      stage: stageId,
      label: WORKSHOP_STAGE_LABELS[stageId],
      queueMinutes: Math.round(s.queueMinutes),
      queueHours: Math.round((s.queueMinutes / MIN_PER_HOUR) * 10) / 10,
      availableMinutesPerDay: s.availableMinutesPerDay,
      availableHoursPerDay: Math.round((s.availableMinutesPerDay / MIN_PER_HOUR) * 10) / 10,
      executors: s.executors,
      daysToClear: Math.round(daysToClear * 10) / 10,
      color: loadColorByDays(daysToClear),
      ordersCount: s.ordersCount,
    };
  });

  const totals = stageList.reduce(
    (acc, s) => ({
      queueMinutes: acc.queueMinutes + s.queueMinutes,
      queueHours: acc.queueHours + s.queueMinutes / MIN_PER_HOUR,
      ordersCount: acc.ordersCount + s.ordersCount,
    }),
    { queueMinutes: 0, queueHours: 0, ordersCount: 0 },
  );
  totals.queueHours = Math.round(totals.queueHours * 10) / 10;

  // Максимальная загрузка по всем этапам — для общего KPI сверху экрана.
  const maxLoad = stageList.reduce((max, s) => (s.daysToClear > max.daysToClear ? s : max), stageList[0]);

  return {
    stages: stageList,
    queueRows: enrichedRows,
    totals,
    maxLoad,
    missingNormCount,
    uniqueOrdersCount: enrichedRows.length,
    hoursPerDay: safeHours,
    workingDayCount: safeDays,
  };
}
