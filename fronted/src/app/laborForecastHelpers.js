export const LABOR_FORECAST_STAGES = [
  { key: "pilka", label: "Пила" },
  { key: "kromka", label: "Кромка" },
  { key: "pras", label: "Присадка" },
  { key: "assembly", label: "Сборка" },
];

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function isImportedLaborRow(row) {
  return Boolean(row?.importedLocal) || /^import-/i.test(String(row?.orderId || "").trim());
}

function normalizeWeek(value) {
  const text = String(value || "").trim();
  return text || "Без недели";
}

function formatHhMm(totalMin) {
  const safe = Math.max(0, Number(totalMin || 0));
  const hours = Math.floor(safe / 60);
  const minutes = Math.round(safe % 60);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function weeklyBaseCapacity(workSchedule) {
  const hoursPerDay = positiveNumber(workSchedule?.hoursPerDay ?? workSchedule?.hours_per_day, 8);
  const workingDays = Array.isArray(workSchedule?.workingDays ?? workSchedule?.working_days)
    ? workSchedule?.workingDays ?? workSchedule?.working_days
    : [];
  const workingDaysCount = workingDays.length > 0 ? workingDays.length : 5;
  return {
    hoursPerDay,
    workingDaysCount,
    minutes: Math.round(hoursPerDay * workingDaysCount * 60),
  };
}

function stageCapacity(baseMinutes, stageKey, stationMultipliers) {
  const multiplier = positiveNumber(stationMultipliers?.[stageKey], 1);
  return Math.round(baseMinutes * multiplier);
}

function stageStatus(loadPct) {
  if (loadPct > 100) return "over";
  if (loadPct >= 80) return "warn";
  return "ok";
}

function summarizeStage({ key, label, used, capacity }) {
  const safeCapacity = Math.max(1, Number(capacity || 0));
  const loadPct = Math.round((Number(used || 0) * 100) / safeCapacity);
  const free = Math.max(0, safeCapacity - Number(used || 0));
  const over = Math.max(0, Number(used || 0) - safeCapacity);
  return {
    key,
    label,
    used: Math.round(Number(used || 0)),
    capacity: safeCapacity,
    loadPct,
    free: Math.round(free),
    over: Math.round(over),
    status: stageStatus(loadPct),
    hhmm: formatHhMm(used),
  };
}

export function buildProductionLoadForecast({
  laborTableRows,
  workSchedule,
  stationMultipliers = {},
} = {}) {
  const base = weeklyBaseCapacity(workSchedule);
  const capacityByStage = Object.fromEntries(
    LABOR_FORECAST_STAGES.map((stage) => [
      stage.key,
      stageCapacity(base.minutes, stage.key, stationMultipliers),
    ]),
  );
  const byWeek = new Map();

  (Array.isArray(laborTableRows) ? laborTableRows : []).forEach((row, index) => {
    if (isImportedLaborRow(row)) return;
    const week = normalizeWeek(row?.week);
    if (!byWeek.has(week)) {
      byWeek.set(week, {
        week,
        orderIds: new Set(),
        qty: 0,
        totalMin: 0,
        stages: { pilka: 0, kromka: 0, pras: 0, assembly: 0 },
        orders: [],
      });
    }
    const bucket = byWeek.get(week);
    const orderId = String(row?.orderId || "").trim() || `row-${index}`;
    bucket.orderIds.add(orderId);
    bucket.qty += toNumber(row?.qty);
    const pilka = toNumber(row?.pilkaMin ?? row?.pilka_min);
    const kromka = toNumber(row?.kromkaMin ?? row?.kromka_min);
    const pras = toNumber(row?.prasMin ?? row?.pras_min);
    const assembly = toNumber(row?.assemblyMin ?? row?.assembly_min);
    const stageTotal = pilka + kromka + pras + assembly;
    const totalMin = stageTotal > 0 ? stageTotal : toNumber(row?.totalMin ?? row?.total_min);
    bucket.stages.pilka += pilka;
    bucket.stages.kromka += kromka;
    bucket.stages.pras += pras;
    bucket.stages.assembly += assembly;
    bucket.totalMin += totalMin;
    bucket.orders.push({
      orderId: String(row?.orderId || "").trim(),
      item: String(row?.item || "").trim(),
      qty: toNumber(row?.qty),
      totalMin: Math.round(totalMin),
      hhmm: formatHhMm(totalMin),
    });
  });

  return [...byWeek.values()]
    .map((weekRow) => {
      const stages = LABOR_FORECAST_STAGES.map((stage) =>
        summarizeStage({
          key: stage.key,
          label: stage.label,
          used: weekRow.stages[stage.key],
          capacity: capacityByStage[stage.key],
        }),
      );
      const maxLoadPct = stages.reduce((max, stage) => Math.max(max, stage.loadPct), 0);
      const status = stageStatus(maxLoadPct);
      const overloadedStages = stages.filter((stage) => stage.status === "over");
      return {
        week: weekRow.week,
        ordersCount: weekRow.orderIds.size,
        qty: Math.round(weekRow.qty),
        totalMin: Math.round(weekRow.totalMin),
        totalHhmm: formatHhMm(weekRow.totalMin),
        stages,
        maxLoadPct,
        status,
        overloadedStages,
        topOrders: weekRow.orders
          .sort((a, b) => Number(b.totalMin || 0) - Number(a.totalMin || 0))
          .slice(0, 6),
        capacity: {
          workingDaysCount: base.workingDaysCount,
          hoursPerDay: base.hoursPerDay,
          baseMinutes: base.minutes,
          byStage: capacityByStage,
        },
      };
    })
    .sort((a, b) => String(a.week || "").localeCompare(String(b.week || ""), "ru", { numeric: true }));
}
