import {
  canonicalStrapProductName,
  extractDetailSizeToken,
  normalizeStrapProductKey,
} from "../utils/furnitureUtils";
import {
  extractStrapTargetProduct,
  formatStrapPlanTargetCaption,
  resolveStrapTargetProductFromShipmentRow,
} from "./orderHelpers";
import {
  STRAP_LAUNCH_PLAN_WEEK,
  detectWorkshopStrapProductLine,
  isWorkshopStrapOrderItem,
} from "./workshopStrapNeeds";

const DONINI_R_STRAP_CODES = new Set(["288_80", "502_80", "520_75.5", "544_80"]);

export function buildStrapProductBySizeToken(furnitureDetailArticleRows = []) {
  const map = new Map();
  (furnitureDetailArticleRows || []).forEach((r) => {
    const isActive = r?.is_active ?? r?.isActive;
    if (isActive === false) return;
    const productName = canonicalStrapProductName(String(r.product_name || r.productName || "").trim());
    const pattern = String(r.detail_name_pattern || r.detailNamePattern || "").trim();
    if (!productName) return;
    const token = extractDetailSizeToken(pattern);
    if (!token) return;
    const key = normalizeStrapProductKey(token);
    if (!map.has(key)) {
      map.set(key, productName);
      return;
    }
    const existing = String(map.get(key) || "");
    if (normalizeStrapProductKey(existing) !== normalizeStrapProductKey(productName)) {
      map.set(key, "");
    }
  });
  return map;
}

export function isStrapLaunchPlanWeek(week) {
  return String(week || "").trim().toLowerCase() === STRAP_LAUNCH_PLAN_WEEK;
}

function isStrapDisplayContext(row, rawItem) {
  const section = String(row?.section || row?.sectionName || "").toLowerCase();
  if (section.includes("обвяз")) return true;
  if (isStrapLaunchPlanWeek(row?.week || row?.planNumber)) return true;
  if (isWorkshopStrapOrderItem(rawItem)) return true;
  if (extractStrapTargetProduct(rawItem)) return true;
  return Boolean(String(row?.strapProduct || "").trim());
}

function productFromWorkshopStrapLine(line) {
  if (line === "donini_r") return canonicalStrapProductName("Донини R");
  if (line === "donini") return canonicalStrapProductName("Донини");
  if (line === "donini_grande") return canonicalStrapProductName("Донини Grande");
  if (line === "avella_lite") return canonicalStrapProductName("Авелла Лайт");
  return "";
}

function productFromKnownStrapCode(token) {
  const code = String(token || "").replace(/x/gi, "_").replace(/,/g, ".");
  if (DONINI_R_STRAP_CODES.has(code)) {
    return canonicalStrapProductName("Донини R");
  }
  if (code === "1158_56" || code === "600_56") {
    return canonicalStrapProductName("Авелла Лайт");
  }
  return "";
}

/**
 * Изделие-назначение для планки обвязки (как в предпросмотре плана).
 */
export function resolveStrapTargetProductForDisplay(row = {}, deps = {}) {
  const rawItem = String(row?.sourceItem || row?.item || "").trim();
  if (!isStrapDisplayContext(row, rawItem)) return "";

  const fromRow = resolveStrapTargetProductFromShipmentRow(row);
  if (fromRow) return canonicalStrapProductName(fromRow);

  const fromLine = productFromWorkshopStrapLine(detectWorkshopStrapProductLine(rawItem));
  if (fromLine) return fromLine;

  const token = extractDetailSizeToken(rawItem) || extractDetailSizeToken(String(row?.item || ""));
  if (!token) return "";

  const key = normalizeStrapProductKey(token);
  const map = deps.strapProductBySizeToken;
  const fromCatalog = map instanceof Map
    ? String(map.get(key) || "").trim()
    : String(map?.[key] || "").trim();
  if (fromCatalog) return canonicalStrapProductName(fromCatalog);

  return productFromKnownStrapCode(token);
}

export function buildStrapDisplayDeps(furnitureDetailArticleRows = []) {
  return {
    strapProductBySizeToken: buildStrapProductBySizeToken(furnitureDetailArticleRows),
  };
}

/** Подпись вида «Обвязка для изделия: Донини R». */
export function resolveStrapTargetCaption(row = {}, deps = {}) {
  const rawItem = String(row?.sourceItem || row?.item || "").trim();
  const target = resolveStrapTargetProductForDisplay(row, deps);
  if (!target) return "";
  const week = String(row?.week || row?.planNumber || "").trim();
  return formatStrapPlanTargetCaption(target, week, rawItem);
}
