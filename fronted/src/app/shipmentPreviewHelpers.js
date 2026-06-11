import { OrderService } from "../services/orderService";
import { extractPlanItemArticle, getPlanPreviewArticleCode } from "./orderHelpers";
import { resolvePlanPreviewArticleByName, resolveProductionOrderIdForShipment } from "./planPreviewHelpers";

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
  const multiplierQty = Number(preview?.qrQty || preview?.qr_qty || preview?.qty || 0);
  const rows = buildRows(template, multiplierQty);
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
  const extractStrapFromItem = deps.extractStrapTargetProduct;
  const itemForStrapMeta = String(
    shipmentRow?.sourceItem || shipmentRow?.item || preview?.firstName || "",
  ).trim();
  const strapFromItem = typeof extractStrapFromItem === "function"
    ? extractStrapFromItem(itemForStrapMeta)
    : "";
  const shipmentHint = typeof canonicalName === "function"
    ? canonicalName(String(shipmentRow?.strapProduct || strapFromItem || "").trim())
    : String(shipmentRow?.strapProduct || strapFromItem || "").trim();
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
  const token = (typeof extractSizeToken === "function" && extractSizeToken(itemForStrapMeta)) ||
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
  const productFromAvellaLiteCode = (() => {
    const code = String(token || "").trim().replace(/x/gi, "_").replace(/,/g, ".");
    if (code !== "1158_56" && code !== "600_56") return "";
    return typeof canonicalName === "function"
      ? canonicalName("Авелла Лайт")
      : "Авелла Лайт";
  })();
  const productName =
    shipmentHint ||
    productFromSize ||
    productFromAvellaLiteCode ||
    productFromArticle ||
    productFromDialog;
  if (!productName) return preview;
  return {
    ...preview,
    strapTargetProduct: productName,
  };
}

export async function loadShipmentTableBySourceMap() {
  try {
    const tableRows = await OrderService.getShipmentTable();
    const list = Array.isArray(tableRows) ? tableRows : [];
    return new Map(
      list.map((row) => [
        `${String(row?.source_row_id || row?.sourceRowId || "").trim()}|${String(row?.source_col_id || row?.sourceColId || "").trim()}`,
        row,
      ]),
    );
  } catch (_) {
    return new Map();
  }
}

function extractSpOrderId(value) {
  const direct = String(value || "").trim().toUpperCase();
  if (/^SP-[A-F0-9]{6,}$/i.test(direct)) return direct;
  const match = direct.match(/\b(SP-[A-F0-9]{6,})\b/i);
  return match ? match[1].toUpperCase() : "";
}

export function getSentOrderId(order) {
  if (!order) return "";
  if (typeof order === "string") return extractSpOrderId(order);
  if (Array.isArray(order)) return getSentOrderId(order[0]);
  const nested = order?.order ?? order?.data ?? order?.result ?? null;
  if (nested && nested !== order) {
    const fromNested = getSentOrderId(nested);
    if (fromNested) return fromNested;
  }
  const direct = extractSpOrderId(order?.order_id ?? order?.orderId);
  if (direct) return direct;
  for (const value of Object.values(order)) {
    if (typeof value === "string") {
      const hit = extractSpOrderId(value);
      if (hit) return hit;
    }
  }
  return "";
}

function shipmentSelectionPreviewKey(selection) {
  return `${String(selection?.row || "").trim()}-${String(selection?.col || "").trim()}`;
}

export function resolveOrderIdForShipmentPrint(plan, sentResults = [], productionRows = []) {
  const previewKey = String(plan?._key || "").trim();
  for (const entry of sentResults) {
    const selection = entry?.selection || {};
    if (shipmentSelectionPreviewKey(selection) !== previewKey) continue;
    const fromApi = getSentOrderId(entry?.order);
    if (fromApi) return fromApi;
    return resolveProductionOrderIdForShipment(
      productionRows,
      selection?.row,
      selection?.week || selection?.weekCol,
      selection?.material,
    );
  }
  if (plan?.orderId || plan?.order_id) return getSentOrderId(plan);
  return resolveProductionOrderIdForShipment(
    productionRows,
    plan?.source_row_id || plan?.sourceRowId,
    plan?.week || plan?.planNumber,
    plan?.material || plan?.colorName,
  );
}

export function attachOrderIdToPlans(plans, sentResults = [], productionRows = []) {
  return (Array.isArray(plans) ? plans : []).map((plan) => {
    const existing = getSentOrderId(plan);
    if (existing) return { ...plan, orderId: existing };
    const orderId = resolveOrderIdForShipmentPrint(plan, sentResults, productionRows);
    return orderId ? { ...plan, orderId } : plan;
  });
}

export function createShipmentPlanPreviewEnricher(deps = {}) {
  const shipmentTableBySource = deps.shipmentTableBySource instanceof Map ? deps.shipmentTableBySource : new Map();

  const attachOrderId = (preview, shipmentRow, orderIdOverride = "") => {
    const forced = String(orderIdOverride || "").trim().toUpperCase();
    const orderId =
      forced ||
      resolveProductionOrderIdForShipment(
        deps.productionRows,
        shipmentRow?.row,
        shipmentRow?.week || shipmentRow?.weekCol,
        shipmentRow?.material,
      );
    return orderId
      ? {
          ...preview,
          orderId,
          sourceRowId: preview?.sourceRowId ?? preview?.source_row_id ?? shipmentRow?.row ?? "",
          week: preview?.week ?? shipmentRow?.week ?? shipmentRow?.weekCol ?? preview?.planNumber ?? "",
          material: preview?.material ?? preview?.colorName ?? shipmentRow?.material ?? "",
        }
      : preview;
  };

  return (preview, shipmentRow, orderIdOverride = "") => {
    const withFurniture = enrichPreviewFromFurniture(preview, {
      furnitureTemplates: deps.furnitureTemplates,
      resolveFurnitureTemplateForPreview: deps.resolveFurnitureTemplateForPreview,
      buildPreviewRowsFromFurnitureTemplate: deps.buildPreviewRowsFromFurnitureTemplate,
      normalizeFurnitureKey: deps.normalizeFurnitureKey,
      furnitureLoading: deps.furnitureLoading,
      furnitureError: deps.furnitureError,
    });
    const withStrapProduct = enrichPreviewWithStrapProduct(withFurniture, shipmentRow, {
      canonicalStrapProductName: deps.canonicalStrapProductName,
      normalizeFurnitureKey: deps.normalizeFurnitureKey,
      getPlanPreviewArticleCode,
      resolvePlanPreviewArticleByName,
      articleLookupByItemKey: deps.articleLookupByItemKey,
      strapProductsByArticleCode: deps.strapProductsByArticleCode,
      normalizeStrapProductKey: deps.normalizeStrapProductKey,
      extractDetailSizeToken: deps.extractDetailSizeToken,
      strapProductBySizeToken: deps.strapProductBySizeToken,
      strapTargetProduct: deps.strapTargetProduct,
    });
    const sourceKey = `${String(shipmentRow?.row || "").trim()}|${String(shipmentRow?.col || "").trim()}`;
    const sourceRowFromTable = shipmentTableBySource.get(sourceKey) || null;
    const articleFromTable = String(
      sourceRowFromTable?.product_article ||
        sourceRowFromTable?.productArticle ||
        sourceRowFromTable?.article_code ||
        sourceRowFromTable?.articleCode ||
        sourceRowFromTable?.article ||
        sourceRowFromTable?.mapped_article_code ||
        sourceRowFromTable?.mappedArticleCode ||
        "",
    ).trim();
    const explicitArticle = String(
      shipmentRow?.productArticle ||
        extractPlanItemArticle(shipmentRow?.sourceItem || shipmentRow?.item || "") ||
        articleFromTable ||
        extractPlanItemArticle(sourceRowFromTable?.item || "") ||
        "",
    ).trim();
    if (!explicitArticle) {
      return attachOrderId(withStrapProduct, shipmentRow, orderIdOverride);
    }
    if (getPlanPreviewArticleCode(withStrapProduct)) {
      return attachOrderId(withStrapProduct, shipmentRow, orderIdOverride);
    }
    return attachOrderId({ ...withStrapProduct, article: explicitArticle }, shipmentRow, orderIdOverride);
  };
}

export async function buildShipmentPrintPlansForSentOrders(sentResults = [], deps = {}) {
  const shipmentSelections = sentResults
    .map((entry) => entry?.selection)
    .filter(Boolean);
  const orderIdByKey = new Map(
    sentResults.map((entry) => [
      `${String(entry?.selection?.row || "").trim()}-${String(entry?.selection?.col || "").trim()}`,
      getSentOrderId(entry?.order),
    ]),
  );
  const enrichPreview = createShipmentPlanPreviewEnricher(deps);
  const enrichWithOrder = (preview, shipmentRow) =>
    enrichPreview(preview, shipmentRow, orderIdByKey.get(preview?._key) || "");

  if (shipmentSelections.length === 1) {
    const s = shipmentSelections[0];
    const preview = await OrderService.previewPlanFromShipment(s.row, s.col);
    if (!preview) return [];
    return attachOrderIdToPlans(
      [enrichWithOrder({ ...preview, _key: `${s.row}-${s.col}` }, s)],
      sentResults,
      deps.productionRows,
    );
  }

  const { plans = [] } = await buildShipmentPreviewPlans(shipmentSelections, {
    enrichPreview: enrichWithOrder,
  });
  return attachOrderIdToPlans(plans, sentResults, deps.productionRows);
}

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
