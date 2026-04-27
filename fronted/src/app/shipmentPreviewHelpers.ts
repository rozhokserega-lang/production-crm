import { OrderService } from "../services/orderService";

export function enrichPreviewFromFurniture(
  preview: Record<string, unknown> | null | undefined,
  deps: Record<string, unknown> = {},
): Record<string, unknown> | null | undefined {
  if (!preview || preview.isStrapPlan) return preview;
  const existingRows = Array.isArray(preview.rows)
    ? (preview.rows as Record<string, unknown>[]).filter((row) => String(row?.part || "").trim())
    : [];
  if (existingRows.length > 0) return preview;
  const resolveTemplate = deps.resolveFurnitureTemplateForPreview as ((preview: Record<string, unknown>, templates: unknown) => unknown) | undefined;
  const buildRows = deps.buildPreviewRowsFromFurnitureTemplate as ((template: unknown, qty: number) => unknown[]) | undefined;
  if (typeof resolveTemplate !== "function" || typeof buildRows !== "function") return preview;
  const template = resolveTemplate(preview, deps.furnitureTemplates);
  if (!template) return preview;
  const rows = buildRows(template, preview.qty as number);
  if (!Array.isArray(rows) || rows.length === 0) return preview;
  return { ...preview, rows };
}

export function enrichPreviewWithStrapProduct(
  preview: Record<string, unknown> | null | undefined,
  shipmentRow: Record<string, unknown>,
  deps: Record<string, unknown> = {},
): Record<string, unknown> | null | undefined {
  if (!preview) return preview;
  const canonicalName = deps.canonicalStrapProductName as ((name: string) => string) | undefined;
  const normalizeText = deps.normalizeFurnitureKey as ((v: string) => string) | undefined;
  const getArticleCode = deps.getPlanPreviewArticleCode as ((preview: Record<string, unknown>) => string) | undefined;
  const resolveFallbackArticle = deps.resolvePlanPreviewArticleByName as ((preview: Record<string, unknown>, lookup: Map<string, string>) => string) | undefined;
  const normalizeProductKey = deps.normalizeStrapProductKey as ((v: string) => string) | undefined;
  const extractSizeToken = deps.extractDetailSizeToken as ((v: string) => string) | undefined;
  const shipmentHint = typeof canonicalName === "function"
    ? canonicalName(String(shipmentRow?.strapProduct || "").trim())
    : String(shipmentRow?.strapProduct || "").trim();
  const sectionKey = typeof normalizeText === "function"
    ? normalizeText(shipmentRow?.section as string || "")
    : String(shipmentRow?.section || "").toLowerCase();
  if (!sectionKey.includes("обвяз") && !shipmentHint) return preview;
  const articleCode = String(
    (typeof getArticleCode === "function" ? getArticleCode(preview) : "") ||
    (typeof resolveFallbackArticle === "function"
      ? resolveFallbackArticle(preview, deps.articleLookupByItemKey as Map<string, string>)
      : "") ||
    "",
  ).trim().toUpperCase();
  const strapProductsByArticleCode = deps.strapProductsByArticleCode as Map<string, string[]> | undefined;
  const productsFromArticle = articleCode && strapProductsByArticleCode
    ? (strapProductsByArticleCode.get(articleCode) || []).filter(Boolean)
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
  const token = (typeof extractSizeToken === "function" && extractSizeToken(shipmentRow?.item as string || "")) ||
    (typeof extractSizeToken === "function" && extractSizeToken(preview?.firstName as string || "")) ||
    (typeof extractSizeToken === "function" && extractSizeToken(preview?.detailedName as string || "")) ||
    "";
  const strapProductBySizeToken = deps.strapProductBySizeToken as Map<string, string> | undefined;
  const productFromSize = token && strapProductBySizeToken
    ? String(
        strapProductBySizeToken.get(
          typeof normalizeProductKey === "function" ? normalizeProductKey(token) : token.toLowerCase(),
        ) || "",
      ).trim()
    : "";
  const productFromDialog = typeof canonicalName === "function"
    ? canonicalName(String(deps.strapTargetProduct as string || "").trim())
    : String(deps.strapTargetProduct as string || "").trim();
  const productName = productFromArticle || shipmentHint || productFromSize || productFromDialog;
  if (!productName) return preview;
  return {
    ...preview,
    strapTargetProduct: productName,
  };
}

interface ShipmentSelection {
  row: string;
  col: string;
  [key: string]: unknown;
}

interface PreviewPlan {
  plan?: Record<string, unknown>;
  row?: string;
  col?: string;
}

interface BuildPreviewResult {
  plans: Record<string, unknown>[];
  failedCount?: number;
  batchError?: unknown;
}

export async function buildShipmentPreviewPlans(
  shipmentSelections: ShipmentSelection[] = [],
  deps: { enrichPreview?: (preview: Record<string, unknown>, selection: Record<string, unknown>) => Record<string, unknown> } = {},
): Promise<BuildPreviewResult> {
  const byKey = new Map(shipmentSelections.map((x) => [`${x.row}-${x.col}`, x]));
  const enrichPreview = deps.enrichPreview;
  if (typeof enrichPreview !== "function") {
    return { plans: [] };
  }
  let plans: Record<string, unknown>[] = [];
  try {
    const batch = await OrderService.previewPlansBatch(
      shipmentSelections.map((x) => ({ row: x.row, col: x.col })),
    );
    const batchData = (batch || {}) as Record<string, unknown>;
    const batchPlans = Array.isArray(batchData.plans) ? (batchData.plans as PreviewPlan[]) : [];
    plans = batchPlans
      .map((p) => ({ ...(p.plan || {}), _key: `${p.row}-${p.col}` }))
      .map((p) => enrichPreview(p, byKey.get(p._key as string) || {}));
    return { plans };
  } catch (batchError) {
    const settled = await Promise.allSettled(
      shipmentSelections.map((s) =>
        OrderService.previewPlanFromShipment(s.row, s.col)
          .then((plan) => ({ ...(plan as Record<string, unknown>), _key: `${s.row}-${s.col}` })),
      ),
    );
    plans = settled
      .filter((x) => x.status === "fulfilled" && x.value)
      .map((x) => enrichPreview((x as PromiseFulfilledResult<Record<string, unknown>>).value, byKey.get((x as PromiseFulfilledResult<Record<string, unknown>>).value?._key as string) || {}));
    const failedCount = settled.length - plans.length;
    return { plans, failedCount, batchError };
  }
}
