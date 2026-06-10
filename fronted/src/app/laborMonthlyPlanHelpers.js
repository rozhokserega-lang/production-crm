import { SHOP_KROMKA_POOL, SHOP_PRAS_POOL } from "./laborKitPlanner";

const MONTH_WEEKS = 4.33;

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function formatHhMm(totalMin) {
  const safe = Math.max(0, Number(totalMin || 0));
  const hours = Math.floor(safe / 60);
  const minutes = Math.round(safe % 60);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function stageStatus(loadPct) {
  if (loadPct > 100) return "over";
  if (loadPct >= 80) return "warn";
  return "ok";
}

export function defaultMonthWorkingDays(workSchedule) {
  const workingDays = Array.isArray(workSchedule?.workingDays ?? workSchedule?.working_days)
    ? workSchedule.workingDays ?? workSchedule.working_days
    : [];
  const daysPerWeek = workingDays.length > 0 ? workingDays.length : 5;
  return Math.max(1, Math.round(daysPerWeek * MONTH_WEEKS));
}

/** Фонд времени по станциям за месяц (мин). */
export function calcMonthlyStationCapacity(
  workSchedule,
  {
    workingDaysPerMonth = null,
    hoursPerDay = null,
    pilkaStations = 1,
    kromkaStations = SHOP_KROMKA_POOL,
    prasStations = SHOP_PRAS_POOL,
  } = {},
) {
  const hoursPerDayResolved = positiveNumber(
    hoursPerDay ?? workSchedule?.hoursPerDay ?? workSchedule?.hours_per_day,
    8,
  );
  const workingDays = Array.isArray(workSchedule?.workingDays ?? workSchedule?.working_days)
    ? workSchedule.workingDays ?? workSchedule.working_days
    : [];
  const daysPerWeek = workingDays.length > 0 ? workingDays.length : 5;
  const monthDays = Math.max(1, Math.round(positiveNumber(workingDaysPerMonth, defaultMonthWorkingDays(workSchedule))));
  const baseFund = monthDays * hoursPerDayResolved * 60;

  return {
    monthDays,
    hoursPerDay: hoursPerDayResolved,
    daysPerWeek,
    baseFund,
    pilka: Math.round(baseFund * pilkaStations),
    kromka: Math.round(baseFund * kromkaStations),
    pras: Math.round(baseFund * prasStations),
    pilkaStations,
    kromkaStations,
    prasStations,
  };
}

/**
 * Загрузка месячного плана: сумма минут по станциям vs фонд.
 * Узкое место = станция с максимальным % загрузки.
 */
export function calcMonthlyPlanLoad(
  planTotals = {},
  workSchedule,
  {
    workingDaysPerMonth = null,
    hoursPerDay = null,
    pilkaStations = null,
    kromkaStations = null,
    prasStations = null,
  } = {},
) {
  const capacity = calcMonthlyStationCapacity(workSchedule, {
    workingDaysPerMonth,
    hoursPerDay,
    pilkaStations: pilkaStations ?? 1,
    kromkaStations: kromkaStations ?? SHOP_KROMKA_POOL,
    prasStations: prasStations ?? SHOP_PRAS_POOL,
  });
  const pilkaUsed = Math.round(Number(planTotals.pilkaTotal || 0));
  const kromkaUsed = Math.round(Number(planTotals.kromkaSeq || planTotals.kromkaTotal || 0));
  const prasUsed = Math.round(Number(planTotals.prasSeq || planTotals.prasTotal || 0));
  const assemblyUsed = Math.round(Number(planTotals.assemblyTotal || 0));

  const stages = [
    {
      key: "pilka",
      label: "Пила",
      stations: capacity.pilkaStations,
      used: pilkaUsed,
      capacity: capacity.pilka,
    },
    {
      key: "kromka",
      label: "Кромка",
      stations: capacity.kromkaStations,
      used: kromkaUsed,
      capacity: capacity.kromka,
    },
    {
      key: "pras",
      label: "Присадка",
      stations: capacity.prasStations,
      used: prasUsed,
      capacity: capacity.pras,
    },
  ];

  const enriched = stages.map((stage) => {
    const safeCapacity = Math.max(1, stage.capacity);
    const loadPct = Math.round((stage.used * 100) / safeCapacity);
    const free = Math.max(0, safeCapacity - stage.used);
    const over = Math.max(0, stage.used - safeCapacity);
    return {
      ...stage,
      loadPct,
      free,
      over,
      status: stageStatus(loadPct),
      usedHhmm: formatHhMm(stage.used),
      capacityHhmm: formatHhMm(safeCapacity),
      freeHhmm: formatHhMm(free),
      overHhmm: formatHhMm(over),
    };
  });

  const bottleneck = enriched.reduce(
    (best, stage) => (stage.loadPct > best.loadPct ? stage : best),
    enriched[0] || null,
  );
  const maxLoadPct = bottleneck?.loadPct || 0;
  const hasPlan = pilkaUsed + kromkaUsed + prasUsed + assemblyUsed > 0;

  return {
    hasPlan,
    capacity,
    stages: enriched,
    bottleneck,
    maxLoadPct,
    status: stageStatus(maxLoadPct),
    assemblyUsed,
    assemblyHhmm: formatHhMm(assemblyUsed),
    formulaText: `${capacity.monthDays} дн. × ${capacity.hoursPerDay} ч × 60 мин`,
  };
}
