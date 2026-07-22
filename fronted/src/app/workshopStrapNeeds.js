import { STRAP_OPTIONS } from "../constants/views";
import { getOrderStageDisplayLabel, PipelineStage, resolvePipelineStage } from "../orderPipeline";
import { stripPlanItemMeta, stripStrapTargetMeta } from "./orderHelpers";
import {
  canonicalStrapProductName,
  detailPatternToStrapName,
  normalizeStrapProductKey,
  resolveFurnitureAliasKey,
  resolveStrapMaterialByProduct,
} from "../utils/furnitureUtils";

/** План для заказов обвязки со склада — не привязан к неделе мебели. */
export const STRAP_LAUNCH_PLAN_WEEK = "обвязка";

/** Цвета ЛДСП для фасадов при добавлении в план со склада обвязки. */
export const STRAP_FACADE_LAUNCH_COLORS = ["Графит", "Эра", "Герион"];

const STRAP_LAUNCH_COLOR_CODES = new Set(["396_305", "153_320", "153x320"]);

export function strapRequiresLaunchColorChoice(strapType) {
  const code = normalizeStrapInventoryCode(strapType);
  if (STRAP_LAUNCH_COLOR_CODES.has(code)) return true;
  return /^фасад/i.test(String(strapDisplayNameForCode(code) || ""));
}

/** Единый формат кода размера (как в strap_stock.strap_type). */
export function normalizeStrapInventoryCode(code) {
  return String(code || "")
    .trim()
    .replace(/x/gi, "_")
    .replace(/,/g, ".");
}

const STRAP_TYPE_CODES = new Set(
  STRAP_OPTIONS.map((opt) => {
    const m = String(opt).match(/\((\d{2,5}[_x]\d{2,5}(?:[.,]\d+)?)\)/);
    return m ? normalizeStrapInventoryCode(m[1]) : null;
  }).filter(Boolean),
);

function extractStrapCodeFromDetailName(detailName) {
  const m = String(detailName || "").match(/\((\d{2,5}[_x]\d{2,5}(?:[.,]\d+)?)\)/);
  return m ? normalizeStrapInventoryCode(m[1]) : "";
}

export function strapDisplayNameForCode(code) {
  const c = normalizeStrapInventoryCode(code);
  if (!c) return "";
  const hit = STRAP_OPTIONS.find((opt) => {
    const m = String(opt).match(/\((\d{2,5}[_x]\d{2,5}(?:[.,]\d+)?)\)/);
    return m && normalizeStrapInventoryCode(m[1]) === c;
  });
  return hit || `Обвязка (${c})`;
}

function strapOptionNameToInventoryCode(optionName) {
  const m = String(optionName || "").match(/\((\d{2,5}[_x]\d{2,5}(?:[.,]\d+)?)\)/i);
  return m ? normalizeStrapInventoryCode(m[1]) : "";
}

/** Изделия (группы), для которых в каталоге указана обвязка с данным кодом размера. */
export function buildStrapProductGroupsByCode(furnitureDetailArticleRows = []) {
  const byCode = new Map();

  const linkProductToCode = (productName, code) => {
    const normalized = normalizeStrapInventoryCode(code);
    if (!normalized || !productName) return;
    if (!byCode.has(normalized)) byCode.set(normalized, new Set());
    byCode.get(normalized).add(productName);
  };

  (furnitureDetailArticleRows || []).forEach((row) => {
    const isActive = row?.is_active ?? row?.isActive;
    if (isActive === false) return;
    const productName = canonicalStrapProductName(String(row?.product_name || row?.productName || "").trim());
    const pattern = String(row?.detail_name_pattern || row?.detailNamePattern || "").trim();
    if (!productName || !pattern) return;

    const optionName = detailPatternToStrapName(pattern);
    if (!optionName) return;

    if (optionName === "Обвязка") {
      const productKey = normalizeStrapProductKey(productName);
      if (productKey === "донини" || productKey === "донини белый") {
        linkProductToCode(productName, "1000_80");
        linkProductToCode(productName, "558_80");
        return;
      }
    }

    const code = strapOptionNameToInventoryCode(optionName);
    if (code) linkProductToCode(productName, code);
  });

  return new Map(
    [...byCode.entries()].map(([code, products]) => [
      code,
      [...products].sort((a, b) => a.localeCompare(b, "ru")),
    ]),
  );
}

export function formatStrapProductGroups(products) {
  const list = Array.isArray(products) ? products.filter(Boolean) : [];
  if (!list.length) return "—";
  return list.join(", ");
}

/** Уникальные изделия из каталога деталей (для фильтра на складе обвязки). */
export function collectStrapCatalogProductNames(productsByCode) {
  const names = new Set();
  (productsByCode instanceof Map ? productsByCode : new Map()).forEach((products) => {
    (Array.isArray(products) ? products : []).forEach((name) => {
      const label = String(name || "").trim();
      if (label) names.add(label);
    });
  });
  return [...names].sort((a, b) => a.localeCompare(b, "ru"));
}

/** Обвязка с кодом `code` привязана к выбранному изделию в каталоге. */
export function strapCodeServesProduct(code, productsByCode, productName) {
  const target = normalizeStrapProductKey(productName);
  if (!target) return false;
  const key = normalizeStrapInventoryCode(code);
  const products = (productsByCode instanceof Map ? productsByCode : new Map()).get(key) || [];
  return products.some((p) => normalizeStrapProductKey(p) === target);
}

/** Сначала обвязка для выбранного изделия, остальные — ниже без скрытия. */
export function sortStrapCodesByProductFilter(codes, productsByCode, productName) {
  const list = Array.isArray(codes) ? [...codes] : [];
  if (!String(productName || "").trim()) return list;
  const matched = [];
  const rest = [];
  list.forEach((code) => {
    if (strapCodeServesProduct(code, productsByCode, productName)) matched.push(code);
    else rest.push(code);
  });
  return [...matched, ...rest];
}

/** Заказ только планок (размер в названии / «Планки обвязки») — без расхода «мебельной» обвязки. */
export function isWorkshopStrapOrderItem(item) {
  const s = stripStrapTargetMeta(stripPlanItemMeta(String(item || "").trim()));
  return s.includes("Планки обвязки") || /^\d{3,5}[_x]\d{2,5}(?:[.,]\d+)?$/.test(s);
}

/** Потребность в планках для склада/карточки: только пила, кромка, присадка и «готов» к сборке (до «собрано» и финала). */
export function orderCountsTowardStrapDemand(order) {
  const ps = resolvePipelineStage(order);
  return (
    ps === PipelineStage.PILKA ||
    ps === PipelineStage.KROMKA ||
    ps === PipelineStage.PRAS ||
    ps === PipelineStage.WORKSHOP_COMPLETE
  );
}

export function strapConsumeColorForOrder(order) {
  const item = String(order?.item || order?.Item || "");
  return resolveStrapMaterialByProduct(item) === "Белый" ? "Белый" : "Черный";
}

/** Линейка изделия для правил количества планок на 1 единицу заказа. */
export function detectWorkshopStrapProductLine(rawItem) {
  const stripped = stripPlanItemMeta(String(rawItem || "")).trim();
  if (!stripped) return "";
  const alias = resolveFurnitureAliasKey([stripped]);
  if (alias === "донини гранде") return "donini_grande";
  if (alias === "донини r") return "donini_r";
  if (alias === "донини") return "donini";
  if (alias === "авелла лайт") return "avella_lite";
  const lower = stripped.toLowerCase();
  if (lower.includes("donini") && lower.includes("grande")) return "donini_grande";
  if (/\bdonini\s+r\b/i.test(lower) || lower.includes("donini r")) return "donini_r";
  if (lower.includes("donini")) return "donini";
  if (lower.includes("avella") && lower.includes("lite")) return "avella_lite";
  if (lower.includes("авелла") && lower.includes("лайт")) return "avella_lite";
  if (lower.includes("авела") && lower.includes("лайт")) return "avella_lite";
  return "";
}

/**
 * Множители «штук на 1 единицу заказа» по коду планки (после базового расчёта из шаблона или каталога).
 * Avella lite: 1158_56 и 600_56 — по 2; Donini: 1000_80 — 2, 558_80 — 4; Donini Grande: как в ТЗ.
 * Donini R: фиксированный набор (каталог/шаблон не смешиваем с обычным Donini).
 */
function applyWorkshopStrapQtyOverrides(productLine, orderQty, needs) {
  const Q = Number(orderQty || 0) || 0;
  if (!(Q > 0)) return needs || [];

  if (productLine === "donini_r") {
    const rulesR = { "288_80": 4, "502_80": 2, "520_75.5": 2, "544_80": 2 };
    const out = [];
    Object.entries(rulesR).forEach(([codeRaw, mul]) => {
      const code = normalizeStrapInventoryCode(codeRaw);
      const target = Math.max(0, Math.round(Q * Number(mul || 0)));
      if (!code || !STRAP_TYPE_CODES.has(code) || !(target > 0)) return;
      out.push({ code, needed: target, name: strapDisplayNameForCode(code) });
    });
    return out.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }

  const rules =
    productLine === "avella_lite"
      ? { "1158_56": 2, "600_56": 2 }
      : productLine === "donini"
        ? { "1000_80": 2, "558_80": 4 }
        : productLine === "donini_grande"
          ? { "750_80": 2, "600_80": 4, "618_80": 2, "586_80": 2 }
          : null;
  if (!rules) return needs || [];

  const byCode = new Map();
  (needs || []).forEach((n) => {
    const code = normalizeStrapInventoryCode(n.code);
    if (!code) return;
    byCode.set(code, { ...n, code, name: n.name || strapDisplayNameForCode(code) });
  });

  Object.entries(rules).forEach(([codeRaw, mul]) => {
    const code = normalizeStrapInventoryCode(codeRaw);
    const target = Math.max(0, Math.round(Q * Number(mul || 0)));
    if (!code || !STRAP_TYPE_CODES.has(code)) return;
    if (byCode.has(code)) {
      const row = byCode.get(code);
      row.needed = target;
    } else if (target > 0) {
      byCode.set(code, { code, needed: target, name: strapDisplayNameForCode(code) });
    }
  });

  return [...byCode.values()].filter((x) => Number(x.needed || 0) > 0).sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

function buildTemplateByKeyFromMerged(furnitureTemplates, furnitureCustomTemplates, normalizeFurnitureKey) {
  const map = {};
  const merged =
    Array.isArray(furnitureTemplates) && furnitureTemplates.length > 0
      ? furnitureTemplates
      : Array.isArray(furnitureCustomTemplates)
        ? furnitureCustomTemplates
        : [];
  const n = (v) =>
    typeof normalizeFurnitureKey === "function" ? normalizeFurnitureKey(v) : String(v || "").toLowerCase().trim();
  merged.forEach((t) => {
    const name = String(t.productName || t.product_name || "").trim();
    const k = n(name);
    if (k) map[k] = t;
  });
  return map;
}

function extractBaseKey(name, normalizeFurnitureKey) {
  const norm = (v) =>
    typeof normalizeFurnitureKey === "function" ? normalizeFurnitureKey(v) : String(v || "").toLowerCase().trim();
  const base = norm(String(name || "")).split(". ")[0].trim();
  return base.replace(/\s*\d[\d\s.]*(?:мм)?$/u, "").trim();
}

function calcStrapNeedsFromFurnitureTemplate(rawItem, orderQty, templateByKey, normalizeFurnitureKey) {
  const itemKey =
    typeof normalizeFurnitureKey === "function"
      ? normalizeFurnitureKey(rawItem)
      : String(rawItem || "").toLowerCase().trim();
  const orderBase = extractBaseKey(rawItem, normalizeFurnitureKey);

  let tpl = templateByKey[itemKey] || null;
  if (!tpl && orderBase.length >= 5) {
    const entry = Object.entries(templateByKey).find(([, t]) => {
      const tplBase = extractBaseKey(String(t.product_name || t.productName || ""), normalizeFurnitureKey);
      return tplBase.length >= 5 && (orderBase.startsWith(tplBase) || tplBase.startsWith(orderBase));
    });
    tpl = entry ? entry[1] : null;
  }

  if (!tpl || !Array.isArray(tpl.details)) return [];
  const orderQtyN = Number(orderQty || 0);
  const needs = [];
  tpl.details.forEach((d) => {
    const code = extractStrapCodeFromDetailName(d.detailName || d.detail_name || "");
    if (!code || !STRAP_TYPE_CODES.has(code)) return;
    const totalNeeded = (Number(d.perUnit || d.per_unit || 0)) * orderQtyN;
    if (totalNeeded > 0) {
      needs.push({ code, needed: totalNeeded, name: d.detailName || d.detail_name || strapDisplayNameForCode(code) });
    }
  });
  return needs;
}

/** Ключи заказа для сопоставления с product_name из furniture_detail_item_map (как в диалоге обвязки). */
export function orderKeysForStrapCatalogMatch(rawItem) {
  const stripped = stripPlanItemMeta(String(rawItem || "")).trim();
  if (!stripped) return [];
  const keys = new Set();
  const alias = resolveFurnitureAliasKey([stripped]);
  if (alias) keys.add(alias);
  keys.add(normalizeStrapProductKey(canonicalStrapProductName(stripped)));
  const beforeDot = stripped.split(".")[0].trim();
  if (beforeDot) keys.add(normalizeStrapProductKey(canonicalStrapProductName(beforeDot)));
  return [...keys].filter(Boolean);
}

/**
 * Потребность в планках из БД furniture_detail_item_map (тот же источник, что useStrapDerivedData на отгрузке).
 */
export function calcStrapNeedsFromDetailArticles(rawItem, orderQty, furnitureDetailArticleRows = []) {
  const qty = Number(orderQty || 0) || 0;
  if (!(qty > 0)) return [];

  const stripped = stripPlanItemMeta(String(rawItem || "")).trim();
  if (!stripped) return [];

  const orderKeys = orderKeysForStrapCatalogMatch(stripped);
  if (!orderKeys.length) return [];

  const matchedRows = (furnitureDetailArticleRows || []).filter((r) => {
    if (r?.is_active === false || r?.isActive === false) return false;
    const productRaw = String(r.product_name || r.productName || "").trim();
    if (!productRaw) return false;
    const rk = normalizeStrapProductKey(canonicalStrapProductName(productRaw));
    return orderKeys.some((ok) => ok && rk === ok);
  });
  if (!matchedRows.length) return [];

  const bucket = new Set();
  matchedRows.forEach((r) => {
    const productRaw = String(r.product_name || r.productName || "").trim();
    const pattern = String(r.detail_name_pattern || r.detailNamePattern || "").trim();
    const optionName = detailPatternToStrapName(pattern);
    if (!optionName) return;
    const pKey = normalizeStrapProductKey(canonicalStrapProductName(productRaw));
    if (optionName === "Обвязка") {
      if (pKey === "донини" || pKey === "донини белый") {
        bucket.add("Обвязка (1000_80)");
        bucket.add("Обвязка (558_80)");
        return;
      }
    }
    bucket.add(optionName);
  });

  const byCode = new Map();
  [...bucket].forEach((name) => {
    const code = extractStrapCodeFromDetailName(name);
    if (!code || !STRAP_TYPE_CODES.has(code)) return;
    byCode.set(code, { code, needed: qty, name });
  });

  return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

/**
 * Итоговая потребность в планках для заказа в цеху: шаблон → каталог → правила 2:1 и т.д.
 */
export function getResolvedWorkshopStrapNeeds(order, { furnitureTemplates, furnitureCustomTemplates, furnitureDetailArticleRows, normalizeFurnitureKey }) {
  const rawItem = stripPlanItemMeta(String(order?.item || ""));
  const qty = Number(order?.qty || 0) || 0;
  if (!(qty > 0) || isWorkshopStrapOrderItem(rawItem)) return [];

  const templateByKey = buildTemplateByKeyFromMerged(
    furnitureTemplates,
    furnitureCustomTemplates,
    normalizeFurnitureKey,
  );
  const fromTpl = calcStrapNeedsFromFurnitureTemplate(rawItem, qty, templateByKey, normalizeFurnitureKey);
  const fromCat = fromTpl.length ? [] : calcStrapNeedsFromDetailArticles(rawItem, qty, furnitureDetailArticleRows);
  const merged = fromTpl.length ? fromTpl : fromCat;
  const line = detectWorkshopStrapProductLine(rawItem);
  return applyWorkshopStrapQtyOverrides(line, qty, merged);
}

/** Код размера из strap_stock.strap_type (короткий или подпись «Обвязка (1000_80)»). */
export function inventoryCodeFromStrapStockType(strapType) {
  const m = String(strapType || "").match(/\((\d[\d_x.,]+)\)/i);
  return m ? normalizeStrapInventoryCode(m[1]) : normalizeStrapInventoryCode(strapType);
}

function accumulateWorkshopStrapDemand(workshopRows, deps) {
  const totals = new Map();
  const ordersByKey = new Map();
  if (!Array.isArray(workshopRows) || !deps) {
    return { totals, ordersByKey };
  }

  for (const order of workshopRows) {
    if (!orderCountsTowardStrapDemand(order)) continue;
    const needs = getResolvedWorkshopStrapNeeds(order, deps);
    if (!needs.length) continue;

    const color = strapConsumeColorForOrder(order);
    const orderId = String(order?.orderId || order?.order_id || "").trim();
    const item = stripPlanItemMeta(String(order?.item || order?.Item || "")).trim();
    const qty = Number(order?.qty || 0) || 0;
    const stageLabel = getOrderStageDisplayLabel(order);

    for (const n of needs) {
      const k = normalizeStrapInventoryCode(n.code);
      if (!k) continue;
      const key = `${k}|${color}`;
      const needed = Number(n.needed) || 0;
      if (!(needed > 0)) continue;
      totals.set(key, (totals.get(key) || 0) + needed);
      if (!ordersByKey.has(key)) ordersByKey.set(key, []);
      ordersByKey.get(key).push({ orderId, item, qty, needed, stageLabel });
    }
  }

  return { totals, ordersByKey };
}

/**
 * Суммарная потребность по списку заказов цеха, по ключу «код|цвет» (цвет как у strapConsumeColorForOrder).
 */
export function computeWorkshopStrapDemandByInventoryKey(workshopRows, deps) {
  return accumulateWorkshopStrapDemand(workshopRows, deps).totals;
}

/** Заказы, формирующие потребность, по ключу «код|цвет». */
export function computeWorkshopStrapDemandOrdersByKey(workshopRows, deps) {
  return accumulateWorkshopStrapDemand(workshopRows, deps).ordersByKey;
}

export function getStrapDemandOrdersForRow(ordersByKey, strapType, color) {
  const code = inventoryCodeFromStrapStockType(strapType);
  const c = String(color || "").trim() || "Черный";
  const rows = ordersByKey instanceof Map ? ordersByKey.get(`${code}|${c}`) || [] : [];
  return [...rows].sort((a, b) => {
    const idCmp = String(a.orderId || "").localeCompare(String(b.orderId || ""), "ru");
    if (idCmp !== 0) return idCmp;
    return String(a.item || "").localeCompare(String(b.item || ""), "ru");
  });
}

/** Нехватка по строке склада: max(0, потребность цеха − остаток в строке). */
export function strapWarehouseShortage(demandMap, strapType, color, qtyOnHand) {
  const code = inventoryCodeFromStrapStockType(strapType);
  const c = String(color || "").trim() || "Черный";
  const demand = demandMap.get(`${code}|${c}`) || 0;
  return Math.max(0, Math.round(demand - (Number(qtyOnHand) || 0)));
}

/** Суммарная потребность (шт) по заказам в активных этапах цеха для типа+цвета строки склада. */
export function strapWarehouseDemandQty(demandMap, strapType, color) {
  const code = inventoryCodeFromStrapStockType(strapType);
  const c = String(color || "").trim() || "Черный";
  return Math.max(0, Math.round(demandMap.get(`${code}|${c}`) || 0));
}
