import { normalizeFurnitureKey } from "../utils/furnitureUtils";
import { normalizePlanWeek } from "./overviewPlansHelpers";
import { getPlanPreviewArticleCode } from "./orderHelpers";
import { extractPlanItemArticle } from "./orderHelpers";
import { extractPlanItemQrQty } from "./orderHelpers";

/** Как web_norm_item_key в Supabase (материал / изделие). */
export function normShipmentItemKey(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/х/g, "x")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSizeTokens(text) {
  const matches = [...String(text || "").matchAll(/(\d{2,4})\s*[_xх]\s*(\d{2,4})/gi)];
  return matches.map((m) => `${m[1]} ${m[2]}`);
}

function buildCandidateKeys(candidate) {
  const raw = String(candidate || "").trim();
  if (!raw) return [];
  const variants = [
    raw,
    raw.split(".")[0] || "",
    raw.replace(/\(.*?\)/g, " "),
  ];
  const keys = variants
    .map((v) => normalizeFurnitureKey(v))
    .filter(Boolean);
  return [...new Set(keys)];
}

export function resolvePlanPreviewArticleByName(planPreview, articleLookupByItemKey) {
  if (!(articleLookupByItemKey instanceof Map) || articleLookupByItemKey.size === 0) return "";
  const candidates = [
    String(planPreview?.firstName || "").trim(),
    String(planPreview?.detailedName || "").trim(),
  ];
  const rows = Array.isArray(planPreview?.rows) ? planPreview.rows : [];
  rows.forEach((row) => {
    candidates.push(String(row?.part || row?.name || row?.item_name || row?.itemName || "").trim());
  });
  const entries = [...articleLookupByItemKey.entries()];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const embedded = extractPlanItemArticle(candidate);
    if (embedded) return embedded;
    const candidateKeys = buildCandidateKeys(candidate);
    for (const key of candidateKeys) {
      const article = String(articleLookupByItemKey.get(key) || "").trim();
      if (article) return article;
      const fuzzy = entries.find(([itemKey]) => key.includes(itemKey) || itemKey.includes(key));
      if (fuzzy?.[1]) return String(fuzzy[1]).trim();
    }
    // Fallback for storage-like names where the same detail is written with different prefixes.
    const sizeTokens = extractSizeTokens(candidate);
    if (sizeTokens.length > 0) {
      const bySize = entries.find(([itemKey]) =>
        sizeTokens.some((token) => itemKey.includes(token)),
      );
      if (bySize?.[1]) return String(bySize[1]).trim();
    }
  }
  return "";
}

export function buildPlanPreviewQrPayload(planPreview, fallbackArticle = "") {
  const sanitize = (value) => String(value || "").trim().replace(/[;\r\n]+/g, " ");
  const article = sanitize(getPlanPreviewArticleCode(planPreview) || fallbackArticle || "-") || "-";
  const planNumber = sanitize(planPreview?.planNumber || "-") || "-";
  const qrQtyFromNames = [
    String(planPreview?.firstName || ""),
    String(planPreview?.detailedName || ""),
    ...(Array.isArray(planPreview?.rows) ? planPreview.rows.map((r) => String(r?.part || r?.name || "")) : []),
  ]
    .map((x) => extractPlanItemQrQty(x))
    .find((n) => Number.isFinite(n) && n > 0);
  const qtyRaw = Number(planPreview?.qrQty || qrQtyFromNames || planPreview?.qty || 0);
  const qty = Number.isFinite(qtyRaw) ? qtyRaw : 0;
  const orderId = String(planPreview?.orderId || planPreview?.order_id || "")
    .trim()
    .toUpperCase();
  const base = `ARTICLE:${article};PLAN:${planNumber};QTY:${qty}`;
  if (/^SP-[A-F0-9]{6,}$/i.test(orderId)) {
    return `${base};ORDER:${orderId}`;
  }
  return base;
}

function materialsCompatible(expectedMaterial, orderMaterial) {
  const expected = normShipmentItemKey(expectedMaterial);
  const actual = normShipmentItemKey(orderMaterial);
  if (!expected) return true;
  if (!actual) return true;
  if (expected === actual) return true;
  return expected.includes(actual) || actual.includes(expected);
}

export function resolveProductionOrderIdForShipment(rows = [], sourceRow = "", week = "", material = "") {
  const rowKey = String(sourceRow || "").trim();
  const weekKey = normalizePlanWeek(week) || String(week || "").trim();
  if (!rowKey || !weekKey) return "";
  const materialKey = normShipmentItemKey(material);
  const candidates = [];
  for (const order of rows) {
    const source = String(order?.source_row_id ?? order?.sourceRowId ?? "").trim();
    const orderWeek = normalizePlanWeek(order?.week ?? "") || String(order?.week ?? "").trim();
    if (source !== rowKey || orderWeek !== weekKey) continue;
    const orderId = String(order?.orderId || order?.order_id || "")
      .trim()
      .toUpperCase();
    if (!/^SP-[A-F0-9]{6,}$/i.test(orderId)) continue;
    candidates.push({
      orderId,
      material: normShipmentItemKey(order?.material || order?.colorName || order?.color_name || ""),
    });
  }
  if (!candidates.length) return "";
  if (candidates.length === 1) return candidates[0].orderId;
  if (materialKey) {
    const exact = candidates.find((entry) => entry.material === materialKey);
    if (exact) return exact.orderId;
    const fuzzy = candidates.find((entry) => materialsCompatible(materialKey, entry.material));
    if (fuzzy) return fuzzy.orderId;
  }
  return candidates[0].orderId;
}

export function buildQrCodeUrl(payload, size = 160) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`;
}
