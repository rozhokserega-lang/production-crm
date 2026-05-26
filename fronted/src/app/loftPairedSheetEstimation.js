import { ceilWholeSheets } from "./appUtils";
import {
  estimateSheetsFromPieces,
  estimateSheetsFromTemplateDetails,
  getMaterialSheetDimensions,
  normalizePlanKey,
  parsePanelSize,
} from "./planSheetEstimation";

/** Fallback, если симулятор не смог подобрать раскладку. */
export const LOFT_PAIRED_SETS_PER_SHEET = 2;
/** Малый лист 2750×1830: 1.5 пары на лист — с запасом (фактически ~1.67). */
export const LOFT_PAIRED_SETS_PER_SHEET_SMALL = 1.5;
export const LOFT_STANDALONE_OUTPUT_PER_SHEET = {
  regular: 4,
  "1500": 2,
};

const loftRulesCache = new Map();

export function resolveLoftVariant(sectionName = "", itemName = "") {
  const section = normalizePlanKey(sectionName);
  const item = normalizePlanKey(itemName);
  if (item.includes("180")) return null;
  const isLoft = item.includes("лофт") || section.includes("тв лофт");
  if (!isLoft) return null;
  if ((item.includes("лофт") && item.includes("150")) || section.includes("1500")) return "1500";
  return "regular";
}

function findLoftTemplate(variant, templates) {
  const target = variant === "1500" ? "ТВ тумба 1500" : "ТВ тумба";
  return (Array.isArray(templates) ? templates : []).find(
    (tpl) => normalizePlanKey(tpl?.product_name) === normalizePlanKey(target),
  );
}

function loftPanelDetails(details) {
  return (Array.isArray(details) ? details : []).filter((detail) => {
    const name = normalizePlanKey(detail?.detailName || detail?.detail_name || "");
    return name.includes("крыш") || name.includes("полк");
  });
}

function buildLoftPieces(details, kits) {
  const amount = Number(kits || 0);
  if (!(amount > 0)) return [];
  const pieces = [];
  for (const detail of Array.isArray(details) ? details : []) {
    const perUnit = Number(detail?.perUnit ?? detail?.per_unit ?? 0);
    if (!(perUnit > 0)) continue;
    const size = parsePanelSize(detail?.detailName || detail?.detail_name || "");
    if (!size) continue;
    const total = Math.ceil(perUnit * amount);
    for (let i = 0; i < total; i += 1) pieces.push(size);
  }
  return pieces;
}

export function resolveLoftSheetRules(templates, sheetW, sheetH) {
  const cacheKey = `${sheetW}x${sheetH}`;
  if (loftRulesCache.has(cacheKey)) return loftRulesCache.get(cacheKey);

  const regularTpl = findLoftTemplate("regular", templates);
  const largeTpl = findLoftTemplate("1500", templates);
  const regularPanels = loftPanelDetails(regularTpl?.details);
  const largePanels = loftPanelDetails(largeTpl?.details);

  let pairedKits = 0;
  for (let kits = 2; kits >= 1; kits -= 1) {
    const pieces = [...buildLoftPieces(regularPanels, kits), ...buildLoftPieces(largePanels, kits)];
    if (pieces.length > 0 && estimateSheetsFromPieces(pieces, sheetW, sheetH) === 1) {
      pairedKits = kits;
      break;
    }
  }

  const standalone = { regular: 1, "1500": 1 };
  for (const variant of ["regular", "1500"]) {
    const tpl = variant === "regular" ? regularTpl : largeTpl;
    for (let kits = 4; kits >= 1; kits -= 1) {
      const sheets = estimateSheetsFromTemplateDetails(tpl?.details || [], kits, sheetW, sheetH);
      if (sheets === 1) {
        standalone[variant] = kits;
        break;
      }
    }
  }

  const rules = { pairedKits, standalone };
  if (sheetW === 2750 && sheetH === 1830) {
    rules.pairedKits = Math.max(rules.pairedKits, LOFT_PAIRED_SETS_PER_SHEET_SMALL);
  }
  loftRulesCache.set(cacheKey, rules);
  return rules;
}

export function estimateLoftPairedSheets(matchedQty, pairedKitsPerSheet = LOFT_PAIRED_SETS_PER_SHEET) {
  const qty = Number(matchedQty || 0);
  const rate = Number(pairedKitsPerSheet || 0);
  if (!(qty > 0) || !(rate > 0)) return 0;
  return ceilWholeSheets(qty / rate);
}

function estimateLoftVariantSheetsAlone(variant, qty, standaloneRates) {
  const amount = Number(qty || 0);
  if (!(amount > 0)) return 0;
  const outputPerSheet = Number(standaloneRates?.[variant] || LOFT_STANDALONE_OUTPUT_PER_SHEET[variant] || 1);
  return ceilWholeSheets(amount / outputPerSheet);
}

function splitTotalAcrossRows(list, entries, totalSheets) {
  if (!entries.length) return;
  const totalQty = entries.reduce((sum, entry) => sum + Number(list[entry.idx].qty || 0), 0);
  let remaining = totalSheets;
  entries.forEach((entry, index) => {
    const row = list[entry.idx];
    let sheets = 0;
    if (totalQty > 0) {
      if (index === entries.length - 1) {
        sheets = remaining;
      } else {
        sheets = Math.round((totalSheets * Number(row.qty || 0)) / totalQty);
        remaining -= sheets;
      }
    }
    row.sheets = sheets;
    row.loftPaired = true;
    row.outputPerSheet = sheets > 0 ? Number(row.qty || 0) / sheets : 0;
  });
}

export function applyLoftPairedSheetAdjustment(rows, { templates = [], normalizeKey } = {}) {
  const list = (Array.isArray(rows) ? rows : []).map((row) => ({ ...row }));
  const groups = new Map();

  list.forEach((row, idx) => {
    const variant = resolveLoftVariant(row.section, row.item);
    const sheet = getMaterialSheetDimensions(row.material);
    if (!variant || !sheet) return;
    const materialKey =
      typeof normalizeKey === "function" ? normalizeKey(row.material) : normalizePlanKey(row.material);
    if (!groups.has(materialKey)) {
      groups.set(materialKey, { sheet, regular: [], large: [] });
    }
    groups.get(materialKey)[variant === "1500" ? "large" : "regular"].push({ idx });
  });

  groups.forEach((group) => {
    const regularEntries = group.regular;
    const largeEntries = group.large;
    if (!regularEntries.length || !largeEntries.length) return;

    const rules = resolveLoftSheetRules(templates, group.sheet.width, group.sheet.height);
    if (!(rules.pairedKits > 0)) return;

    const regularQty = regularEntries.reduce((sum, entry) => sum + Number(list[entry.idx].qty || 0), 0);
    const largeQty = largeEntries.reduce((sum, entry) => sum + Number(list[entry.idx].qty || 0), 0);
    if (!(regularQty > 0 && largeQty > 0)) return;

    const matchedQty = Math.min(regularQty, largeQty);
    const pairedSheets = estimateLoftPairedSheets(matchedQty, rules.pairedKits);
    const regularPairedSheets = Math.ceil(pairedSheets / 2);
    const largePairedSheets = pairedSheets - regularPairedSheets;

    const regularExtraQty = regularQty - matchedQty;
    const largeExtraQty = largeQty - matchedQty;
    const regularExtraSheets =
      regularExtraQty > 0 ? estimateLoftVariantSheetsAlone("regular", regularExtraQty, rules.standalone) : 0;
    const largeExtraSheets =
      largeExtraQty > 0 ? estimateLoftVariantSheetsAlone("1500", largeExtraQty, rules.standalone) : 0;

    splitTotalAcrossRows(list, regularEntries, regularPairedSheets + regularExtraSheets);
    splitTotalAcrossRows(list, largeEntries, largePairedSheets + largeExtraSheets);
  });

  return list;
}

export function verifyLoftCombinedLayout(templates, sheetW = 2800, sheetH = 2070) {
  return resolveLoftSheetRules(templates, sheetW, sheetH).pairedKits >= LOFT_PAIRED_SETS_PER_SHEET;
}
