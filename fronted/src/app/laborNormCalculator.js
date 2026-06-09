import {
  laborNormHasValues,
  laborNormPerQty,
  normalizeLaborNormRow,
  resolveLaborGroup,
  sortLaborGroups,
} from "./laborGroupHelpers";

const isImportedLaborRow = (row) =>
  Boolean(row?.importedLocal) || /^import-/i.test(String(row?.orderId || "").trim());

function normalizeLaborTableRow(x) {
  return {
    orderId: String(x.order_id || x.orderId || ""),
    item: String(x.item || ""),
    qty: Number(x.qty || 0),
    pilkaMin: Number(x.pilka_min ?? x.pilkaMin ?? 0),
    kromkaMin: Number(x.kromka_min ?? x.kromkaMin ?? 0),
    prasMin: Number(x.pras_min ?? x.prasMin ?? 0),
    assemblyMin: Number(x.assembly_min ?? x.assemblyMin ?? 0),
    totalMin: Number(x.total_min ?? x.totalMin ?? 0),
    dateFinished: String(x.date_finished || x.dateFinished || ""),
    importedLocal: Boolean(x.imported_local || x.importedLocal),
  };
}

function buildFactGroups(laborTableRows) {
  const completed = laborTableRows.filter(
    (x) => !isImportedLaborRow(x) && x.pilkaMin > 0 && x.kromkaMin > 0 && x.prasMin > 0,
  );
  const grouped = new Map();
  completed.forEach((x) => {
    const group = resolveLaborGroup(x.item);
    if (!group) return;
    if (!grouped.has(group)) {
      grouped.set(group, {
        group,
        orders: 0,
        qty: 0,
        pilkaMin: 0,
        kromkaMin: 0,
        prasMin: 0,
        assemblyMin: 0,
        totalMin: 0,
        lastDate: "",
      });
    }
    const g = grouped.get(group);
    g.orders += 1;
    g.qty += Number(x.qty || 0);
    g.pilkaMin += Number(x.pilkaMin || 0);
    g.kromkaMin += Number(x.kromkaMin || 0);
    g.prasMin += Number(x.prasMin || 0);
    g.assemblyMin += Number(x.assemblyMin || 0);
    g.totalMin += Number(x.totalMin || 0);
    const d = String(x.dateFinished || "");
    if (d && (!g.lastDate || d > g.lastDate)) g.lastDate = d;
  });
  return grouped;
}

function finalizeLaborOrderRow({ group, fact, norm }) {
  const hasNorm = laborNormHasValues(norm);
  const hasFact = Boolean(fact && fact.orders > 0);
  const normPerQty = hasNorm ? laborNormPerQty(norm) : null;
  const factPerQty = hasFact && fact.qty > 0
    ? {
        pilka: fact.pilkaMin / fact.qty,
        kromka: fact.kromkaMin / fact.qty,
        pras: fact.prasMin / fact.qty,
        assembly: fact.assemblyMin / fact.qty,
        total: fact.totalMin / fact.qty,
      }
    : null;
  const perQty = hasNorm ? normPerQty : factPerQty;
  const source = hasNorm ? "norm" : hasFact ? "fact" : "empty";

  return {
    group,
    source,
    sourceLabel: source === "norm" ? "Норматив" : source === "fact" ? "Факт" : "—",
    hasNorm,
    hasFact,
    normQtyUnit: hasNorm ? norm.qtyUnit : null,
    orders: Number(fact?.orders || 0),
    qty: Number(fact?.qty || 0),
    pilkaPerQtyMin: perQty ? perQty.pilka : 0,
    kromkaPerQtyMin: perQty ? perQty.kromka : 0,
    prasPerQtyMin: perQty ? perQty.pras : 0,
    assemblyPerQtyMin: perQty ? perQty.assembly : 0,
    laborPerQtyMin: perQty ? perQty.total : 0,
    laborPerQtyHour: perQty ? perQty.total / 60 : 0,
    factPerQtyMin: factPerQty ? factPerQty.total : null,
  };
}

/** Сводка по группам: норматив приоритетнее факта. */
export function buildLaborOrdersRows(laborTableRows = [], laborNormsRows = []) {
  const table = (Array.isArray(laborTableRows) ? laborTableRows : []).map(normalizeLaborTableRow);
  const factGroups = buildFactGroups(table);
  const normsMap = new Map();
  (Array.isArray(laborNormsRows) ? laborNormsRows : []).forEach((raw) => {
    const norm = normalizeLaborNormRow(raw);
    if (norm.groupName) normsMap.set(norm.groupName, norm);
  });
  const allGroups = new Set([...factGroups.keys(), ...normsMap.keys()]);
  return [...allGroups]
    .map((group) => finalizeLaborOrderRow({
      group,
      fact: factGroups.get(group),
      norm: normsMap.get(group),
    }))
    .filter((row) => row.source !== "empty")
    .sort((a, b) => sortLaborGroups(a.group, b.group));
}

export function buildLaborRatesIndex(laborOrdersRows = []) {
  const map = new Map();
  (Array.isArray(laborOrdersRows) ? laborOrdersRows : []).forEach((row) => {
    if (!row?.group || Number(row.laborPerQtyMin || 0) <= 0) return;
    map.set(row.group, row);
  });
  return map;
}

export function formatLaborHhMm(totalMin) {
  const safe = Math.max(0, Number(totalMin || 0));
  const hours = Math.floor(safe / 60);
  const minutes = Math.round(safe % 60);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

export function estimateLaborForItem({ item = "", qty = 1, group = "" }, laborOrdersRows = []) {
  const resolvedGroup = String(group || "").trim() || resolveLaborGroup(item);
  const q = Math.max(0, Number(qty) || 0);
  if (!resolvedGroup || q <= 0) {
    return {
      item: String(item || "").trim(),
      group: resolvedGroup || "",
      qty: q,
      missing: true,
      source: "empty",
      sourceLabel: "—",
      pilkaMin: 0,
      kromkaMin: 0,
      prasMin: 0,
      assemblyMin: 0,
      totalMin: 0,
      hhmm: "0:00",
    };
  }

  const rates = buildLaborRatesIndex(laborOrdersRows);
  const rate = rates.get(resolvedGroup);
  if (!rate || Number(rate.laborPerQtyMin || 0) <= 0) {
    return {
      item: String(item || "").trim(),
      group: resolvedGroup,
      qty: q,
      missing: true,
      source: "empty",
      sourceLabel: "Нет данных",
      pilkaMin: 0,
      kromkaMin: 0,
      prasMin: 0,
      assemblyMin: 0,
      totalMin: 0,
      hhmm: "0:00",
    };
  }

  const pilkaMin = Number(rate.pilkaPerQtyMin || 0) * q;
  const kromkaMin = Number(rate.kromkaPerQtyMin || 0) * q;
  const prasMin = Number(rate.prasPerQtyMin || 0) * q;
  const assemblyMin = Number(rate.assemblyPerQtyMin || 0) * q;
  const totalMin = pilkaMin + kromkaMin + prasMin + assemblyMin;

  return {
    item: String(item || "").trim(),
    group: resolvedGroup,
    qty: q,
    missing: false,
    source: rate.source,
    sourceLabel: rate.sourceLabel,
    pilkaMin,
    kromkaMin,
    prasMin,
    assemblyMin,
    totalMin,
    hhmm: formatLaborHhMm(totalMin),
  };
}

export function estimateLaborForLines(lines = [], laborOrdersRows = []) {
  const rows = (Array.isArray(lines) ? lines : [])
    .map((line) => estimateLaborForItem({
      item: line?.item || line?.itemName || "",
      qty: line?.qty,
      group: line?.group,
    }, laborOrdersRows))
    .filter((row) => row.qty > 0);

  const totals = rows.reduce(
    (acc, row) => ({
      pilkaMin: acc.pilkaMin + row.pilkaMin,
      kromkaMin: acc.kromkaMin + row.kromkaMin,
      prasMin: acc.prasMin + row.prasMin,
      assemblyMin: acc.assemblyMin + row.assemblyMin,
      totalMin: acc.totalMin + row.totalMin,
      missingCount: acc.missingCount + (row.missing ? 1 : 0),
    }),
    { pilkaMin: 0, kromkaMin: 0, prasMin: 0, assemblyMin: 0, totalMin: 0, missingCount: 0 },
  );

  return {
    lines: rows,
    totals: {
      ...totals,
      hhmm: formatLaborHhMm(totals.totalMin),
    },
  };
}
