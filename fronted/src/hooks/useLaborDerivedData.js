import { useMemo } from "react";
import {
  laborNormHasValues,
  laborNormPerQty,
  normalizeLaborNormRow,
  resolveLaborGroup,
  sortLaborGroups,
} from "../app/laborGroupHelpers";

const isImportedLaborRow = (row) =>
  Boolean(row?.importedLocal) || /^import-/i.test(String(row?.orderId || "").trim());

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

function buildNormsMap(laborNormsRows) {
  const map = new Map();
  (Array.isArray(laborNormsRows) ? laborNormsRows : []).forEach((raw) => {
    const norm = normalizeLaborNormRow(raw);
    if (!norm.groupName) return;
    map.set(norm.groupName, norm);
  });
  return map;
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
  const displayPilka = hasNorm ? Number(norm.pilkaMin || 0) : Number(fact?.pilkaMin || 0);
  const displayKromka = hasNorm ? Number(norm.kromkaMin || 0) : Number(fact?.kromkaMin || 0);
  const displayPras = hasNorm ? Number(norm.prasMin || 0) : Number(fact?.prasMin || 0);
  const displayAssembly = hasNorm ? Number(norm.assemblyMin || 0) : Number(fact?.assemblyMin || 0);
  const displayTotal = displayPilka + displayKromka + displayPras + displayAssembly;
  const totalForShare = displayTotal > 0 ? displayTotal : 0;

  return {
    group,
    source,
    sourceLabel: source === "norm" ? "Норматив" : source === "fact" ? "Факт" : "—",
    hasNorm,
    hasFact,
    normQtyUnit: hasNorm ? norm.qtyUnit : null,
    orders: Number(fact?.orders || 0),
    qty: Number(fact?.qty || 0),
    pilkaMin: displayPilka,
    kromkaMin: displayKromka,
    prasMin: displayPras,
    assemblyMin: displayAssembly,
    totalMin: displayTotal,
    lastDate: fact?.lastDate || "",
    laborPerOrderHour: fact && fact.orders > 0 ? fact.totalMin / fact.orders / 60 : 0,
    laborPerQtyMin: perQty ? perQty.total : 0,
    laborPerQtyHour: perQty ? perQty.total / 60 : 0,
    pilkaPerQtyMin: perQty ? perQty.pilka : 0,
    kromkaPerQtyMin: perQty ? perQty.kromka : 0,
    prasPerQtyMin: perQty ? perQty.pras : 0,
    assemblyPerQtyMin: perQty ? perQty.assembly : 0,
    factPerQtyMin: factPerQty ? factPerQty.total : null,
    pilkaShare: totalForShare > 0 ? (displayPilka * 100) / totalForShare : 0,
    kromkaShare: totalForShare > 0 ? (displayKromka * 100) / totalForShare : 0,
    prasShare: totalForShare > 0 ? (displayPras * 100) / totalForShare : 0,
  };
}

export function useLaborDerivedData({ view, filtered, laborSort, laborNormsRows = [] }) {
  const laborTableRows = useMemo(() => {
    if (view !== "labor") return [];
    const toNum = (v) => Number(v || 0);
    const list = [...filtered].map((x) => ({
      orderId: String(x.order_id || x.orderId || ""),
      item: String(x.item || ""),
      week: String(x.week || ""),
      qty: toNum(x.qty),
      pilkaMin: toNum(x.pilka_min ?? x.pilkaMin),
      kromkaMin: toNum(x.kromka_min ?? x.kromkaMin),
      prasMin: toNum(x.pras_min ?? x.prasMin),
      assemblyMin: toNum(x.assembly_min ?? x.assemblyMin),
      totalMin: toNum(x.total_min ?? x.totalMin),
      dateFinished: String(x.date_finished || x.dateFinished || ""),
      importedLocal: Boolean(x.imported_local || x.importedLocal),
      importKey: String(x.import_key || x.importKey || ""),
    }));
    list.sort((a, b) => {
      if (laborSort === "total_asc") return a.totalMin - b.totalMin;
      if (laborSort === "week") return Number(a.week || 0) - Number(b.week || 0);
      if (laborSort === "item") return a.item.localeCompare(b.item, "ru");
      return b.totalMin - a.totalMin;
    });
    return list;
  }, [filtered, laborSort, view]);

  const laborOrdersRows = useMemo(() => {
    if (view !== "labor") return [];
    const factGroups = buildFactGroups(laborTableRows);
    const normsMap = buildNormsMap(laborNormsRows);
    const allGroups = new Set([...factGroups.keys(), ...normsMap.keys()]);

    return [...allGroups]
      .map((group) => finalizeLaborOrderRow({
        group,
        fact: factGroups.get(group),
        norm: normsMap.get(group),
      }))
      .filter((row) => row.source !== "empty")
      .sort((a, b) => sortLaborGroups(a.group, b.group));
  }, [laborTableRows, laborNormsRows, view]);

  return { laborTableRows, laborOrdersRows };
}
