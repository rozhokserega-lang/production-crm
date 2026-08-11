function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

/** Порядок распределения остатка: раньше план (неделя), внутри — больший расход листов. */
export function compareAwaitingMaterialRows(a, b) {
  return (
    String(a?.week || "").localeCompare(String(b?.week || ""), "ru", { numeric: true }) ||
    Number(b?.sheets || 0) - Number(a?.sheets || 0) ||
    String(a?.key || "").localeCompare(String(b?.key || ""), "ru")
  );
}

/**
 * Жадное покрытие позиций доступным остатком листов.
 * @returns {Map<string, { enough: boolean, shortage: number }>}
 */
export function allocateMaterialStockCoverage(rows, availableSheets) {
  const coverage = new Map();
  const list = (Array.isArray(rows) ? rows : [])
    .filter((row) => Number(row?.sheets || 0) > 0)
    .slice()
    .sort(compareAwaitingMaterialRows);
  let remaining = Math.max(0, Number(availableSheets || 0));
  list.forEach((row) => {
    const key = String(row?.key || "").trim();
    if (!key) return;
    const sheets = Number(row.sheets || 0);
    const enough = sheets <= remaining;
    coverage.set(key, {
      enough,
      shortage: enough ? 0 : Math.max(0, sheets - remaining),
    });
    remaining = Math.max(0, remaining - sheets);
  });
  return coverage;
}

/**
 * Для каждой «Ожидаю заказ» позиции: хватает ли материала именно на неё
 * (при общем дефиците по цвету часть строк может быть зелёной).
 */
export function annotateRowsWithMaterialCoverage(rows, shipmentMaterialBalance, normalizeFurnitureKey) {
  const normalizeKey =
    typeof normalizeFurnitureKey === "function"
      ? normalizeFurnitureKey
      : (value) => String(value || "").toLowerCase().trim();
  const list = Array.isArray(rows) ? rows : [];
  const awaitingByMaterial = new Map();

  list.forEach((row) => {
    if (row?.stageKey !== "awaiting") return;
    const materialKey = normalizeKey(row.material || "");
    if (!materialKey) return;
    if (!awaitingByMaterial.has(materialKey)) awaitingByMaterial.set(materialKey, []);
    awaitingByMaterial.get(materialKey).push(row);
  });

  const coverageByKey = new Map();
  awaitingByMaterial.forEach((materialRows, materialKey) => {
    const totals = shipmentMaterialBalance?.get?.(materialKey) || { available: 0 };
    const coverage = allocateMaterialStockCoverage(materialRows, totals.available);
    coverage.forEach((value, key) => coverageByKey.set(key, value));
  });

  return list.map((row) => {
    const materialKey = normalizeKey(row.material || "");
    const totals = shipmentMaterialBalance?.get?.(materialKey) || { needed: 0, available: 0 };
    const deficit = Math.max(0, Number(totals.needed || 0) - Number(totals.available || 0));
    const coverage = coverageByKey.get(String(row.key || "").trim());
    const isAwaiting = row.stageKey === "awaiting";
    const sheets = Number(row.sheets || 0);
    const materialEnoughForRow = isAwaiting
      ? (coverage ? coverage.enough : sheets <= 0 || sheets <= Number(totals.available || 0))
      : true;
    const materialRowShortage = isAwaiting && coverage ? Number(coverage.shortage || 0) : 0;
    return {
      ...row,
      materialNeededTotal: Number(totals.needed || 0),
      materialAvailableTotal: Number(totals.available || 0),
      materialDeficit: deficit,
      materialHasDeficit: deficit > 0,
      materialEnoughForRow,
      materialRowShortage,
    };
  });
}

export function buildShipmentMaterialPlan(
  shipmentTableRowsWithStockStatus,
  shipmentMaterialBalance,
  normalizeFurnitureKey,
) {
  const normalizeKey =
    typeof normalizeFurnitureKey === "function"
      ? normalizeFurnitureKey
      : (value) => String(value || "").toLowerCase().trim();
  const byMaterial = new Map();

  (Array.isArray(shipmentTableRowsWithStockStatus) ? shipmentTableRowsWithStockStatus : []).forEach((row) => {
    if (row.stageKey !== "awaiting") return;
    const material = String(row.material || "Материал не указан").trim();
    const key = normalizeKey(material);
    if (!byMaterial.has(key)) {
      const totals = shipmentMaterialBalance.get(key) || { needed: 0, available: 0 };
      byMaterial.set(key, {
        material,
        materialKey: key,
        needed: Number(totals.needed || 0),
        available: Number(totals.available || 0),
        rows: [],
      });
    }
    byMaterial.get(key).rows.push({
      key: row.key,
      orderId: row.orderId,
      section: row.section,
      item: row.item,
      article: row.productArticle,
      week: row.week || "-",
      qty: Number(row.qty || 0),
      sheets: Number(row.sheets || 0),
      sourceRow: row.sourceRow,
      sourceCol: row.sourceCol,
    });
  });

  return [...byMaterial.values()]
    .map((x) => {
      const deficit = Math.max(0, Number(x.needed || 0) - Number(x.available || 0));
      const rows = x.rows
        .filter((row) => Number(row.sheets || 0) > 0)
        .sort(compareAwaitingMaterialRows);
      let remainingAvailable = Number(x.available || 0);
      const weekMap = new Map();
      rows.forEach((row) => {
        const week = String(row.week || "-").trim() || "-";
        if (!weekMap.has(week)) weekMap.set(week, { week, needed: 0, deficit: 0, rows: [] });
        const bucket = weekMap.get(week);
        bucket.needed += Number(row.sheets || 0);
        bucket.rows.push(row);
      });
      const weeks = [...weekMap.values()].map((week) => {
        const weekDeficit = Math.max(0, Number(week.needed || 0) - remainingAvailable);
        remainingAvailable = Math.max(0, remainingAvailable - Number(week.needed || 0));
        return {
          ...week,
          needed: Number(week.needed || 0),
          deficit: weekDeficit,
        };
      });
      const coverage = allocateMaterialStockCoverage(rows, x.available);
      const blockedRows = rows
        .filter((row) => coverage.get(String(row.key || ""))?.enough === false)
        .map((row) => ({
          ...row,
          shortage: Number(coverage.get(String(row.key || ""))?.shortage || 0),
        }));
      return {
        material: x.material,
        materialKey: x.materialKey,
        needed: Number(x.needed || 0),
        available: Number(x.available || 0),
        deficit,
        firstWeek: weeks[0]?.week || "-",
        weeks,
        blockerRows: blockedRows.slice(0, 8),
        blockedCount: blockedRows.length,
      };
    })
    .filter((x) => x.needed > 0)
    .sort((a, b) => b.deficit - a.deficit || b.needed - a.needed || a.material.localeCompare(b.material, "ru"));
}

export function findShipmentMaterialPlanEntry(planRows, material, normalizeFurnitureKey) {
  const normalizeKey =
    typeof normalizeFurnitureKey === "function"
      ? normalizeFurnitureKey
      : (value) => String(value || "").toLowerCase().trim();
  const materialKey = normalizeKey(material);
  if (!materialKey) return null;
  return (Array.isArray(planRows) ? planRows : []).find((row) => {
    const rowKey = String(row?.materialKey || "").trim() || normalizeKey(row?.material);
    return rowKey === materialKey;
  }) || null;
}

export function materialPlanTotals(planRows) {
  const rows = Array.isArray(planRows) ? planRows : [];
  return {
    demandMaterials: rows.length,
    deficitMaterials: rows.filter((row) => toNumber(row.deficit) > 0).length,
    coveredMaterials: rows.filter((row) => toNumber(row.deficit) === 0 && toNumber(row.needed) > 0).length,
  };
}
