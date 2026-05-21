function normalizeMaterial(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function asTimestamp(value) {
  const ts = new Date(value || 0).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function materialMatches(row, materialKey) {
  return materialKey && normalizeMaterial(row?.material) === materialKey;
}

function flattenPlanRows(plan) {
  const weeks = Array.isArray(plan?.weeks) ? plan.weeks : [];
  return weeks.flatMap((week) =>
    (Array.isArray(week?.rows) ? week.rows : []).map((row) => ({
      ...row,
      week: String(row?.week || week?.week || "-").trim() || "-",
      weekDeficit: toNumber(week?.deficit),
    })),
  );
}

export function buildMaterialCard(material, {
  warehouseTableRows,
  warehouseOrderPlanRows,
  consumeHistoryTableRows,
  leftoversTableRows,
} = {}, {
  now = new Date(),
} = {}) {
  const materialName = String(material || "").trim();
  const materialKey = normalizeMaterial(materialName);
  if (!materialKey) return null;

  const stockRows = (Array.isArray(warehouseTableRows) ? warehouseTableRows : [])
    .filter((row) => materialMatches(row, materialKey));
  const stockTotal = stockRows.reduce((sum, row) => sum + toNumber(row?.qtySheets), 0);
  const updatedAt = stockRows.reduce((latest, row) => {
    const current = String(row?.updatedAt || "").trim();
    return current && (!latest || current > latest) ? current : latest;
  }, "");

  const plan = (Array.isArray(warehouseOrderPlanRows) ? warehouseOrderPlanRows : [])
    .find((row) => materialMatches(row, materialKey)) || null;
  const requiredRows = flattenPlanRows(plan)
    .sort((a, b) =>
      String(a.week || "").localeCompare(String(b.week || ""), "ru", { numeric: true }) ||
      toNumber(b.sheets) - toNumber(a.sheets),
    );
  const blockerRows = (Array.isArray(plan?.blockerRows) ? plan.blockerRows : [])
    .slice()
    .sort((a, b) =>
      String(a.week || "").localeCompare(String(b.week || ""), "ru", { numeric: true }) ||
      toNumber(b.shortage) - toNumber(a.shortage),
    );

  const historyRows = (Array.isArray(consumeHistoryTableRows) ? consumeHistoryTableRows : [])
    .filter((row) => materialMatches(row, materialKey))
    .sort((a, b) => asTimestamp(b?.createdAt) - asTimestamp(a?.createdAt));
  const leftoverRows = (Array.isArray(leftoversTableRows) ? leftoversTableRows : [])
    .filter((row) => materialMatches(row, materialKey))
    .sort((a, b) => asTimestamp(b?.createdAt) - asTimestamp(a?.createdAt));

  const nowMs = asTimestamp(now);
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const actualConsumptionRows = historyRows.filter((row) => row?.rowType === "consume");
  const consumedLast30Days = actualConsumptionRows
    .filter((row) => nowMs - asTimestamp(row?.createdAt) <= thirtyDaysMs)
    .reduce((sum, row) => sum + toNumber(row?.qtySheets), 0);
  const avgDailyConsumption = consumedLast30Days > 0 ? consumedLast30Days / 30 : 0;
  const daysLeft = avgDailyConsumption > 0 ? stockTotal / avgDailyConsumption : null;
  const runsOutAt = daysLeft != null ? addDays(now, Math.ceil(daysLeft)).toISOString() : "";

  const needed = toNumber(plan?.needed);
  const toOrder = toNumber(plan?.toOrder ?? plan?.deficit);
  return {
    material: materialName || stockRows[0]?.material || plan?.material || "",
    stockRows,
    stockTotal,
    updatedAt,
    needed,
    available: toNumber(plan?.available ?? stockTotal),
    toOrder,
    firstWeek: String(plan?.firstWeek || "").trim(),
    weeks: Array.isArray(plan?.weeks) ? plan.weeks : [],
    requiredRows,
    blockerRows,
    blockedCount: toNumber(plan?.blockedCount ?? blockerRows.length),
    historyRows,
    leftoverRows,
    consumedLast30Days,
    avgDailyConsumption,
    daysLeft,
    runsOutAt,
  };
}
