import { OrderService } from "../services/orderService";
import { formatDateTimeForPrint } from "./appUtils";
import { enrichPreviewFromFurniture, enrichPreviewWithStrapProduct } from "./shipmentPreviewHelpers";
import { extractPlanItemArticle, getPlanPreviewArticleCode } from "./orderHelpers";
import { resolvePlanPreviewArticleByName } from "./planPreviewHelpers";
import { buildStrapDisplayDeps } from "./strapDisplayHelpers";
import {
  canonicalStrapProductName,
  extractDetailSizeToken,
  normalizeStrapProductKey,
} from "../utils/furnitureUtils";
import { extractStrapTargetProduct } from "./orderHelpers";

function enrichWorkshopPreviewWithStrap(preview, order, deps = {}) {
  const strapDisplayDeps = deps.strapDisplayDeps || buildStrapDisplayDeps(deps.furnitureDetailArticleRows);
  const shipmentRow = {
    item: order?.item,
    sourceItem: order?.item,
    week: order?.week || preview?.planNumber,
    planNumber: preview?.planNumber,
    material: order?.material || order?.colorName || preview?.colorName,
    strapProduct: order?.strapProduct || order?.strap_product,
    section: order?.section || order?.sectionName,
  };
  return enrichPreviewWithStrapProduct(preview, shipmentRow, {
    canonicalStrapProductName,
    normalizeFurnitureKey: deps.normalizeFurnitureKey,
    getPlanPreviewArticleCode,
    resolvePlanPreviewArticleByName,
    articleLookupByItemKey: deps.articleLookupByItemKey,
    strapProductsByArticleCode: deps.strapProductsByArticleCode,
    normalizeStrapProductKey,
    extractDetailSizeToken,
    extractStrapTargetProduct,
    strapProductBySizeToken: strapDisplayDeps.strapProductBySizeToken,
    strapTargetProduct: deps.strapTargetProduct,
  });
}

export async function buildWorkshopPlanPreview(order, qtyReady, deps = {}) {
  const readyQty = Math.max(1, Number(qtyReady || 0) || 1);
  const sourceRow = String(order?.source_row_id ?? order?.sourceRowId ?? "").trim();
  const week = String(order?.week ?? "").trim();
  const sourceCol = String(
    order?.source_col_id ?? order?.sourceColId ?? week,
  ).trim();

  let preview = null;

  if (sourceRow && sourceCol) {
    try {
      preview = await OrderService.previewPlanFromShipment(sourceRow, sourceCol);
    } catch (_) {
      preview = null;
    }
  }

  if (!preview || typeof preview !== "object") {
    const item = String(order?.item || "").trim();
    preview = {
      detailedName: item,
      firstName: item,
      colorName: String(order?.material || order?.colorName || "").trim(),
      qty: readyQty,
      planNumber: week || "-",
      rows: [{ part: item, qty: readyQty }],
      generatedAt: formatDateTimeForPrint(new Date()),
    };
  }

  preview = {
    ...preview,
    qty: readyQty,
    planNumber: week || preview.planNumber || "-",
    generatedAt: formatDateTimeForPrint(new Date()),
    article: String(
      order?.productArticle ||
        order?.product_article ||
        extractPlanItemArticle(String(order?.item || "")) ||
        preview?.article ||
        "",
    ).trim(),
    orderId: String(order?.orderId || order?.order_id || "")
      .trim()
      .toUpperCase(),
    _key: `workshop-${String(order?.orderId || order?.order_id || "")}-${readyQty}`,
  };

  let enriched = enrichPreviewFromFurniture(preview, {
    shipmentRow: {
      item: order?.item,
      sourceItem: order?.item,
      week: order?.week || preview?.planNumber,
      planNumber: preview?.planNumber,
      material: order?.material || order?.colorName || preview?.colorName,
      strapProduct: order?.strapProduct || order?.strap_product,
      section: order?.section || order?.sectionName,
    },
    furnitureTemplates: deps.furnitureTemplates,
    resolveFurnitureTemplateForPreview: deps.resolveFurnitureTemplateForPreview,
    buildPreviewRowsFromFurnitureTemplate: deps.buildPreviewRowsFromFurnitureTemplate,
    normalizeFurnitureKey: deps.normalizeFurnitureKey,
    furnitureLoading: deps.furnitureLoading,
    furnitureError: deps.furnitureError,
  });
  enriched = enrichWorkshopPreviewWithStrap(enriched, order, deps);

  const originalQty = Math.max(1, Number(order?.qty || 0) || readyQty);
  if (originalQty === readyQty || !Array.isArray(enriched?.rows) || !enriched.rows.length) {
    return enriched;
  }

  const ratio = readyQty / originalQty;
  return {
    ...enriched,
    qty: readyQty,
    rows: enriched.rows.map((row) => {
      const raw = String(row?.qty ?? "").trim().replace(",", ".");
      const n = Number(raw);
      if (!Number.isFinite(n)) return row;
      const scaled = Math.round(n * ratio * 1000) / 1000;
      const normalizedQty = Number.isInteger(scaled) ? String(Math.trunc(scaled)) : String(scaled).replace(".", ",");
      return { ...row, qty: normalizedQty };
    }),
  };
}
