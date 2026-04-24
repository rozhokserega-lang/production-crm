export function enrichPreviewFromFurniture(preview, deps = {}) {
  if (!preview || preview.isStrapPlan) return preview;
  const existingRows = Array.isArray(preview.rows)
    ? preview.rows.filter((row) => String(row?.part || "").trim())
    : [];
  // Keep backend preview rows when they exist; template rows are only a fallback.
  if (existingRows.length > 0) return preview;
  const resolveTemplate = deps.resolveFurnitureTemplateForPreview;
  const buildRows = deps.buildPreviewRowsFromFurnitureTemplate;
  if (typeof resolveTemplate !== "function" || typeof buildRows !== "function") return preview;
  const template = resolveTemplate(preview, deps.furnitureTemplates);
  if (!template) return preview;
  const rows = buildRows(template, preview.qty);
  if (!Array.isArray(rows) || rows.length === 0) return preview;
  return { ...preview, rows };
}

export function enrichPreviewWithStrapProduct(preview, shipmentRow, deps = {}) {
  if (!preview) return preview;
  const canonicalName = deps.canonicalStrapProductName;
  const normalizeText = deps.normalizeFurnitureKey;
  const getArticleCode = deps.getPlanPreviewArticleCode;
  const resolveFallbackArticle = deps.resolvePlanPreviewArticleByName;
  const normalizeProductKey = deps.normalizeStrapProductKey;
  const extractSizeToken = deps.extractDetailSizeToken;
  const shipmentHint = typeof canonicalName === "function"
    ? canonicalName(String(shipmentRow?.strapProduct || "").trim())
    : String(shipmentRow?.strapProduct || "").trim();
  const sectionKey = typeof normalizeText === "function"
    ? normalizeText(shipmentRow?.section || "")
    : String(shipmentRow?.section || "").toLowerCase();
  if (!sectionKey.includes("обвяз") && !shipmentHint) return preview;
  const articleCode = String(
    (typeof getArticleCode === "function" ? getArticleCode(preview) : "") ||
    (typeof resolveFallbackArticle === "function"
      ? resolveFallbackArticle(preview, deps.articleLookupByItemKey)
      : "") ||
    "",
  ).trim().toUpperCase();
  const productsFromArticle = articleCode
    ? ((deps.strapProductsByArticleCode && deps.strapProductsByArticleCode.get(articleCode)) || []).filter(Boolean)
    : [];
  const shipmentHintKey = typeof normalizeProductKey === "function"
    ? normalizeProductKey(shipmentHint)
    : shipmentHint.toLowerCase();
  const productFromArticle = (() => {
    if (productsFromArticle.length === 0) return "";
    if (productsFromArticle.length === 1) return String(productsFromArticle[0] || "").trim();
    if (shipmentHintKey) {
      const hit = productsFromArticle.find(
        (p) => (typeof normalizeProductKey === "function" ? normalizeProductKey(String(p || "").trim()) : String(p || "").toLowerCase()) === shipmentHintKey,
      );
      if (hit) return String(hit).trim();
    }
    return "";
  })();
  const token = (typeof extractSizeToken === "function" && extractSizeToken(shipmentRow?.item || "")) ||
    (typeof extractSizeToken === "function" && extractSizeToken(preview?.firstName || "")) ||
    (typeof extractSizeToken === "function" && extractSizeToken(preview?.detailedName || "")) ||
    "";
  const productFromSize = token
    ? String(
      (deps.strapProductBySizeToken &&
        deps.strapProductBySizeToken.get(
          typeof normalizeProductKey === "function" ? normalizeProductKey(token) : token.toLowerCase(),
        )) ||
      "",
    ).trim()
    : "";
  const productFromDialog = typeof canonicalName === "function"
    ? canonicalName(String(deps.strapTargetProduct || "").trim())
    : String(deps.strapTargetProduct || "").trim();
  const productName = productFromArticle || shipmentHint || productFromSize || productFromDialog;
  if (!productName) return preview;
  return {
    ...preview,
    strapTargetProduct: productName,
  };
}

import { OrderService } from "../services/orderService";

export async function buildShipmentPreviewPlans(shipmentSelections = [], deps = {}) {
  const byKey = new Map(shipmentSelections.map((x) => [`${x.row}-${x.col}`, x]));
  const enrichPreview = deps.enrichPreview;
  if (typeof enrichPreview !== "function") {
    return { plans: [] };
  }
  let plans = [];
  try {
    const batch = await OrderService.previewPlansBatch(
      shipmentSelections.map((x) => ({ row: x.row, col: x.col })),
    );
    plans = (batch && Array.isArray(batch.plans) ? batch.plans : [])
      .map((p) => ({ ...(p.plan || {}), _key: `${p.row}-${p.col}` }))
      .map((p) => enrichPreview(p, byKey.get(p._key)));
    return { plans };
  } catch (batchError) {
    const settled = await Promise.allSettled(
      shipmentSelections.map((s) =>
        OrderService.previewPlanFromShipment(s.row, s.col)
          .then((plan) => ({ ...plan, _key: `${s.row}-${s.col}` })),
      ),
    );
    plans = settled
      .filter((x) => x.status === "fulfilled" && x.value)
      .map((x) => enrichPreview(x.value, byKey.get(x.value?._key)));
    const failedCount = settled.length - plans.length;
    return { plans, failedCount, batchError };
  }
}
