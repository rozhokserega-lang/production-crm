export function enrichPreviewFromFurniture(preview, deps = {}) {
  if (!preview || preview.isStrapPlan) return preview;
  const existingRows = Array.isArray(preview.rows)
    ? preview.rows.filter((row) => String(row?.part || "").trim())
    : [];
  // Backend currently returns a placeholder row: [{ part: <item name>, qty: <qty> }].
  // Treat that single "self-row" as empty so we can expand from furniture templates.
  const normalizeText = deps.normalizeFurnitureKey;
  const norm = (v) => {
    const s = String(v || "").trim();
    if (!s) return "";
    const base = typeof normalizeText === "function"
      ? normalizeText(s)
      : s
          .toLowerCase()
          .replace(/[ё]/g, "е")
          .replace(/[^\p{L}\p{N}\s]/gu, " ")
          .replace(/\s+/g, " ")
          .trim();
    // Unify latin/cyrillic x and multiplication sign in sizes.
    return String(base || "").replace(/[xх×]/g, "x").replace(/\s+/g, " ").trim();
  };
  const isPlaceholderSelfRow =
    existingRows.length === 1 &&
    String(existingRows[0]?.part || "").trim() &&
    (norm(existingRows[0]?.part) === norm(preview?.firstName) ||
      norm(existingRows[0]?.part) === norm(preview?.detailedName)) &&
    Number(existingRows[0]?.qty || 0) === Number(preview?.qty || 0);

  // Keep backend preview rows when they exist and are not the placeholder row.
  if (existingRows.length > 0 && !isPlaceholderSelfRow) return preview;
  const resolveTemplate = deps.resolveFurnitureTemplateForPreview;
  const buildRows = deps.buildPreviewRowsFromFurnitureTemplate;
  const templates = Array.isArray(deps.furnitureTemplates) ? deps.furnitureTemplates : [];
  const furnitureError = String(deps.furnitureError || "").trim();
  const furnitureLoading = Boolean(deps.furnitureLoading);
  const debugBase = isPlaceholderSelfRow ? {
    _furnitureDebug: {
      isPlaceholder: true,
      templatesCount: templates.length,
      furnitureLoading,
      furnitureError,
      firstName: String(preview?.firstName || ""),
      detailedName: String(preview?.detailedName || ""),
      placeholderPart: String(existingRows[0]?.part || ""),
    },
  } : null;
  if (typeof resolveTemplate !== "function" || typeof buildRows !== "function") {
    return debugBase ? { ...preview, ...debugBase, _furnitureDebug: { ...debugBase._furnitureDebug, reason: "missing_helpers" } } : preview;
  }
  if (templates.length === 0) {
    return debugBase ? { ...preview, ...debugBase, _furnitureDebug: { ...debugBase._furnitureDebug, reason: "templates_empty" } } : preview;
  }
  const template = resolveTemplate(preview, templates);
  if (!template) {
    return debugBase ? { ...preview, ...debugBase, _furnitureDebug: { ...debugBase._furnitureDebug, reason: "template_not_found" } } : preview;
  }
  const rows = buildRows(template, preview.qty);
  if (!Array.isArray(rows) || rows.length === 0) {
    return debugBase ? { ...preview, ...debugBase, _furnitureDebug: { ...debugBase._furnitureDebug, reason: "template_rows_empty", templateName: String(template?.productName || "") } } : preview;
  }
  return {
    ...preview,
    rows,
    ...(debugBase || {}),
    _furnitureDebug: {
      ...(debugBase ? debugBase._furnitureDebug : {}),
      reason: "applied",
      templateName: String(template?.productName || ""),
      expandedRows: rows.length,
    },
  };
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
