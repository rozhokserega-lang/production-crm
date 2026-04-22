import { normalizeFurnitureKey } from "../utils/furnitureUtils";
import { getPlanPreviewArticleCode } from "./orderHelpers";
import { extractPlanItemArticle } from "./orderHelpers";

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
  for (const candidate of candidates) {
    if (!candidate) continue;
    const embedded = extractPlanItemArticle(candidate);
    if (embedded) return embedded;
    const key = normalizeFurnitureKey(candidate);
    if (!key) continue;
    const article = String(articleLookupByItemKey.get(key) || "").trim();
    if (article) return article;
    const fuzzy = [...articleLookupByItemKey.entries()].find(
      ([itemKey]) => key.includes(itemKey) || itemKey.includes(key),
    );
    if (fuzzy?.[1]) return String(fuzzy[1]).trim();
  }
  return "";
}

export function buildPlanPreviewQrPayload(planPreview, fallbackArticle = "") {
  const article = getPlanPreviewArticleCode(planPreview) || String(fallbackArticle || "").trim() || "-";
  const planNumber = String(planPreview?.planNumber || "-").trim() || "-";
  const qtyRaw = Number(planPreview?.qty || 0);
  const qty = Number.isFinite(qtyRaw) ? qtyRaw : 0;
  return `ARTICLE:${article};PLAN:${planNumber};QTY:${qty}`;
}

export function buildQrCodeUrl(payload, size = 160) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`;
}
