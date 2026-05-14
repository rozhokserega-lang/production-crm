import { STRAP_OPTIONS } from "../constants/views";
import { stripPlanItemMeta } from "./orderHelpers";
import {
  canonicalStrapProductName,
  detailPatternToStrapName,
  normalizeStrapProductKey,
  resolveFurnitureAliasKey,
  resolveStrapMaterialByProduct,
} from "../utils/furnitureUtils";

/** Единый формат кода размера (как в strap_stock.strap_type). */
export function normalizeStrapInventoryCode(code) {
  return String(code || "")
    .trim()
    .replace(/x/gi, "_");
}

const STRAP_TYPE_CODES = new Set(
  STRAP_OPTIONS.map((opt) => {
    const m = String(opt).match(/\((\d{2,5}[_x]\d{2,5})\)/);
    return m ? normalizeStrapInventoryCode(m[1]) : null;
  }).filter(Boolean),
);

function extractStrapCodeFromDetailName(detailName) {
  const m = String(detailName || "").match(/\((\d{2,5}[_x]\d{2,5})\)/);
  return m ? normalizeStrapInventoryCode(m[1]) : "";
}

export function strapDisplayNameForCode(code) {
  const c = normalizeStrapInventoryCode(code);
  if (!c) return "";
  const hit = STRAP_OPTIONS.find((opt) => {
    const m = String(opt).match(/\((\d{2,5}[_x]\d{2,5})\)/);
    return m && normalizeStrapInventoryCode(m[1]) === c;
  });
  return hit || `Обвязка (${c})`;
}

/** Заказ только планок (размер в названии / «Планки обвязки») — без расхода «мебельной» обвязки. */
export function isWorkshopStrapOrderItem(item) {
  const s = String(item || "").trim();
  return s.includes("Планки обвязки") || /^\d{3,5}[_x]\d{2,5}$/.test(s);
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
  if (alias === "донини") return "donini";
  if (alias === "авелла лайт") return "avella_lite";
  const lower = stripped.toLowerCase();
  if (lower.includes("donini") && lower.includes("grande")) return "donini_grande";
  if (lower.includes("donini")) return "donini";
  if (lower.includes("avella") && lower.includes("lite")) return "avella_lite";
  if (lower.includes("авелла") && lower.includes("лайт")) return "avella_lite";
  if (lower.includes("авела") && lower.includes("лайт")) return "avella_lite";
  return "";
}

/**
 * Множители «штук на 1 единицу заказа» по коду планки (после базового расчёта из шаблона или каталога).
 * Avella lite: 1158_50 и 600_50 — по 2; Donini: 1000_80 — 2, 558_80 — 4; Donini Grande: как в ТЗ.
 */
function applyWorkshopStrapQtyOverrides(productLine, orderQty, needs) {
  const Q = Number(orderQty || 0) || 0;
  if (!(Q > 0)) return needs || [];
  const rules =
    productLine === "avella_lite"
      ? { "1158_50": 2, "600_50": 2 }
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
  const m = String(strapType || "").match(/\((\d[\d_x]+)\)/i);
  return m ? normalizeStrapInventoryCode(m[1]) : normalizeStrapInventoryCode(strapType);
}

/**
 * Суммарная потребность по списку заказов цеха, по ключу «код|цвет» (цвет как у strapConsumeColorForOrder).
 */
export function computeWorkshopStrapDemandByInventoryKey(workshopRows, deps) {
  const map = new Map();
  if (!Array.isArray(workshopRows) || !deps) return map;
  for (const order of workshopRows) {
    const needs = getResolvedWorkshopStrapNeeds(order, deps);
    if (!needs.length) continue;
    const color = strapConsumeColorForOrder(order);
    for (const n of needs) {
      const k = normalizeStrapInventoryCode(n.code);
      if (!k) continue;
      const key = `${k}|${color}`;
      map.set(key, (map.get(key) || 0) + (Number(n.needed) || 0));
    }
  }
  return map;
}

/** Нехватка по строке склада: max(0, потребность цеха − остаток в строке). */
export function strapWarehouseShortage(demandMap, strapType, color, qtyOnHand) {
  const code = inventoryCodeFromStrapStockType(strapType);
  const c = String(color || "").trim() || "Черный";
  const demand = demandMap.get(`${code}|${c}`) || 0;
  return Math.max(0, Math.round(demand - (Number(qtyOnHand) || 0)));
}
