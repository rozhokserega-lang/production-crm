import { normalizeFurnitureKey as defaultNormalizeMaterialKey } from "../utils/furnitureUtils";

function resolveMaterialKey(value, normalizeMaterialKey) {
  const normalize =
    typeof normalizeMaterialKey === "function" ? normalizeMaterialKey : defaultNormalizeMaterialKey;
  return normalize(value);
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

function materialMatches(row, materialKey, normalizeMaterialKey) {
  if (!materialKey) return false;
  const rowKey =
    String(row?.materialKey || "").trim() ||
    resolveMaterialKey(row?.material, normalizeMaterialKey);
  return rowKey === materialKey;
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
  warehouseMaterialPlanRows,
  warehouseOrderPlanRows,
  consumeHistoryTableRows,
  leftoversTableRows,
} = {}, {
  now = new Date(),
  normalizeMaterialKey = defaultNormalizeMaterialKey,
} = {}) {
  const materialName = String(material || "").trim();
  const materialKey = resolveMaterialKey(materialName, normalizeMaterialKey);
  if (!materialKey) return null;

  const stockRows = (Array.isArray(warehouseTableRows) ? warehouseTableRows : [])
    .filter((row) => materialMatches(row, materialKey, normalizeMaterialKey));
  const stockTotal = stockRows.reduce((sum, row) => sum + toNumber(row?.qtySheets), 0);
  const updatedAt = stockRows.reduce((latest, row) => {
    const current = String(row?.updatedAt || "").trim();
    return current && (!latest || current > latest) ? current : latest;
  }, "");

  const demandPlan = (Array.isArray(warehouseMaterialPlanRows) ? warehouseMaterialPlanRows : [])
    .find((row) => materialMatches(row, materialKey, normalizeMaterialKey)) || null;
  const deficitPlan = (Array.isArray(warehouseOrderPlanRows) ? warehouseOrderPlanRows : [])
    .find((row) => materialMatches(row, materialKey, normalizeMaterialKey)) || null;
  const plan = demandPlan || deficitPlan;
  const requiredRows = flattenPlanRows(plan)
    .sort((a, b) =>
      String(a.week || "").localeCompare(String(b.week || ""), "ru", { numeric: true }) ||
      toNumber(b.sheets) - toNumber(a.sheets),
    );
  const blockerRows = (Array.isArray(deficitPlan?.blockerRows) ? deficitPlan.blockerRows : [])
    .slice()
    .sort((a, b) =>
      String(a.week || "").localeCompare(String(b.week || ""), "ru", { numeric: true }) ||
      toNumber(b.shortage) - toNumber(a.shortage),
    );

  const historyRows = (Array.isArray(consumeHistoryTableRows) ? consumeHistoryTableRows : [])
    .filter((row) => materialMatches(row, materialKey, normalizeMaterialKey))
    .sort((a, b) => asTimestamp(b?.createdAt) - asTimestamp(a?.createdAt));
  const leftoverRows = (Array.isArray(leftoversTableRows) ? leftoversTableRows : [])
    .filter((row) => materialMatches(row, materialKey, normalizeMaterialKey))
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

  const needed = toNumber(demandPlan?.needed ?? plan?.needed);
  const toOrder = toNumber(deficitPlan?.toOrder ?? deficitPlan?.deficit);
  return {
    material: materialName || stockRows[0]?.material || plan?.material || "",
    stockRows,
    stockTotal,
    updatedAt,
    needed,
    available: toNumber(demandPlan?.available ?? plan?.available ?? stockTotal),
    toOrder,
    firstWeek: String(demandPlan?.firstWeek || plan?.firstWeek || "").trim(),
    weeks: Array.isArray(demandPlan?.weeks) ? demandPlan.weeks : Array.isArray(plan?.weeks) ? plan.weeks : [],
    requiredRows,
    blockerRows,
    blockedCount: toNumber(deficitPlan?.blockedCount ?? blockerRows.length),
    historyRows,
    leftoverRows,
    consumedLast30Days,
    avgDailyConsumption,
    daysLeft,
    runsOutAt,
  };
}
