import { normalizeFurnitureKey } from "../utils/furnitureUtils";
import { getPlanPreviewArticleCode } from "./orderHelpers";
import { extractPlanItemArticle } from "./orderHelpers";
import { extractPlanItemQrQty } from "./orderHelpers";

function extractSizeTokens(text: string): string[] {
  const matches = [...String(text || "").matchAll(/(\d{2,4})\s*[_xх]\s*(\d{2,4})/gi)];
  return matches.map((m) => `${m[1]} ${m[2]}`);
}

function buildCandidateKeys(candidate: string): string[] {
  const raw = String(candidate || "").trim();
  if (!raw) return [];
  const variants = [
    raw,
    raw.split(".")[0] || "",
    raw.replace(/\(.*?\)/g, " "),
  ];
  const keys = variants
    .map((v) => normalizeFurnitureKey(v))
    .filter(Boolean) as string[];
  return [...new Set(keys)];
}

export function resolvePlanPreviewArticleByName(
  planPreview: Record<string, unknown>,
  articleLookupByItemKey: Map<string, string>,
): string {
  if (!(articleLookupByItemKey instanceof Map) || articleLookupByItemKey.size === 0) return "";
  const candidates: string[] = [
    String(planPreview?.firstName || "").trim(),
    String(planPreview?.detailedName || "").trim(),
  ];
  const rows = Array.isArray(planPreview?.rows) ? (planPreview.rows as Record<string, unknown>[]) : [];
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

export function buildPlanPreviewQrPayload(planPreview: Record<string, unknown>, fallbackArticle = ""): string {
  const article = getPlanPreviewArticleCode(planPreview) || String(fallbackArticle || "").trim() || "-";
  const planNumber = String(planPreview?.planNumber || "-").trim() || "-";
  const qrQtyFromNames = [
    String(planPreview?.firstName || ""),
    String(planPreview?.detailedName || ""),
    ...(Array.isArray(planPreview?.rows) ? (planPreview.rows as Record<string, unknown>[]).map((r) => String(r?.part || r?.name || "")) : []),
  ]
    .map((x) => extractPlanItemQrQty(x))
    .find((n) => Number.isFinite(n) && n > 0);
  const qtyRaw = Number((planPreview?.qrQty as number) || qrQtyFromNames || (planPreview?.qty as number) || 0);
  const qty = Number.isFinite(qtyRaw) ? qtyRaw : 0;
  return `ARTICLE:${article};PLAN:${planNumber};QTY:${qty}`;
}

export function buildQrCodeUrl(payload: string, size = 160): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`;
}
