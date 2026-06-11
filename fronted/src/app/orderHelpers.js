export function shipmentOrderKey(sourceRow, week) {
  return `${String(sourceRow || "").trim()}|${String(week || "").trim()}`;
}

export function orderUpdatedTs(o) {
  return new Date(o?.updatedAt || o?.updated_at || o?.createdAt || o?.created_at || 0).getTime();
}

export function mergeOrderPreferNewer(map, key, o) {
  if (!key || !o) return;
  const prev = map.get(key);
  if (!prev || orderUpdatedTs(o) >= orderUpdatedTs(prev)) map.set(key, o);
}

export function getMaterialLabel(item, material) {
  const direct = String(material || "").trim();
  if (direct) return direct;
  const name = String(item || "").trim();
  if (!name) return "Материал не указан";
  const parts = name
    .split(".")
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  const tail = String(parts[parts.length - 1] || "").trim();
  return tail || "Материал не указан";
}

export function hasArticleLikeCode(row) {
  const raw = String(
    row?.product_article ||
      row?.productArticle ||
    row?.article_code ||
      row?.articleCode ||
      row?.article ||
      row?.mapped_article_code ||
      row?.mappedArticleCode ||
      "",
  ).trim();
  if (!raw) return false;
  const compact = raw.replace(/\s+/g, "");
  return /^[A-Za-z0-9][A-Za-z0-9._-]{2,}$/.test(compact);
}

export function getPlanPreviewArticleCode(planPreview) {
  const direct = String(
    planPreview?.product_article ||
      planPreview?.productArticle ||
    planPreview?.article_code ||
      planPreview?.articleCode ||
      planPreview?.article ||
      planPreview?.mapped_article_code ||
      planPreview?.mappedArticleCode ||
      "",
  ).trim();
  if (direct) return direct;
  const rows = Array.isArray(planPreview?.rows) ? planPreview.rows : [];
  for (const r of rows) {
    const rowCode = String(
      r?.product_article ||
        r?.productArticle ||
      r?.article_code ||
        r?.articleCode ||
        r?.article ||
        r?.mapped_article_code ||
        r?.mappedArticleCode ||
        "",
    ).trim();
    if (rowCode) return rowCode;
  }
  return "";
}

const ITEM_ARTICLE_META_RE = /\{\{ART:([A-Za-z0-9._-]+)\}\}/i;
const ITEM_ARTICLE_PREFIX_RE = /^\s*([A-Za-z0-9][A-Za-z0-9._-]{2,})\s*::\s*/i;
const ITEM_QR_QTY_META_RE = /\{\{QRQTY:([0-9]+(?:[.,][0-9]+)?)\}\}/i;
const ITEM_QR_QTY_PREFIX_RE = /(?:^|\s)QTY\s*=\s*([0-9]+(?:[.,][0-9]+)?)\s*::/i;
const ITEM_STRAP_FOR_META_RE = /\{\{STRAP_FOR:([^}]+)\}\}/i;

export function embedPlanItemArticle(itemName, articleCode, qrQty) {
  const item = String(itemName || "").trim();
  const article = String(articleCode || "").trim();
  const qrQtyNum = Number(String(qrQty ?? "").replace(",", "."));
  const hasQrQty = Number.isFinite(qrQtyNum) && qrQtyNum > 0;
  if (!item) return item;
  const qtyPrefix = hasQrQty ? `QTY=${Number.isInteger(qrQtyNum) ? Math.trunc(qrQtyNum) : qrQtyNum} :: ` : "";
  const qtyMeta = hasQrQty ? ` {{QRQTY:${Number.isInteger(qrQtyNum) ? Math.trunc(qrQtyNum) : qrQtyNum}}}` : "";
  if (!article) return `${qtyPrefix}${item}${qtyMeta}`.trim();
  // Keep both a visible prefix and a hidden marker:
  // some backends may strip "{{...}}" metadata, but keep plain text.
  return `${article} :: ${qtyPrefix}${item} {{ART:${article}}}${qtyMeta}`;
}

export function stripStrapTargetMeta(itemName) {
  return String(itemName || "")
    .replace(ITEM_STRAP_FOR_META_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function embedStrapTargetProduct(itemName, productName) {
  const item = stripStrapTargetMeta(stripPlanItemMeta(itemName));
  const product = String(productName || "").trim();
  if (!item || !product) return item;
  return `${item} {{STRAP_FOR:${product}}}`;
}

export function extractStrapTargetProduct(itemName) {
  const m = String(itemName || "").match(ITEM_STRAP_FOR_META_RE);
  return m?.[1] ? String(m[1]).trim() : "";
}

/** Нормализованный код планки обвязки (1158_56 и т.п.). */
export function normalizeStrapItemCode(raw) {
  return stripPlanItemMeta(String(raw || ""))
    .trim()
    .replace(/x/gi, "_")
    .replace(/,/g, ".");
}

const FACADE_STRAP_ITEM_CODES = new Set(["396_305", "153_320"]);

export function isFacadeStrapItemCode(raw) {
  const code = normalizeStrapItemCode(raw);
  if (FACADE_STRAP_ITEM_CODES.has(code)) return true;
  return /^фасад/i.test(code);
}

/** Подпись изделия на печатном листе обвязки. */
export function formatStrapPlanTargetCaption(strapTargetProduct, planWeek, strapItemCode = "") {
  const target = String(strapTargetProduct || "").trim();
  if (!target) return "";
  const week = String(planWeek || "").trim().toLowerCase();
  const targetNorm = target.toLowerCase().replace(/[ё]/g, "е");
  if (week === "обвязка" && targetNorm === "авелла" && isFacadeStrapItemCode(strapItemCode)) {
    return "Фасады для Сиена";
  }
  return `Обвязка для изделия: ${target}`;
}

export function resolveStrapTargetProductFromShipmentRow(shipmentRow = {}) {
  const fromField = String(shipmentRow?.strapProduct || "").trim();
  if (fromField) return fromField;
  const rawItem = String(shipmentRow?.sourceItem || shipmentRow?.item || "").trim();
  return extractStrapTargetProduct(rawItem);
}

export function stripPlanItemMeta(itemName) {
  return stripStrapTargetMeta(
    String(itemName || "")
      .replace(ITEM_ARTICLE_META_RE, "")
      .replace(ITEM_ARTICLE_PREFIX_RE, "")
      .replace(ITEM_QR_QTY_META_RE, "")
      .replace(ITEM_QR_QTY_PREFIX_RE, "")
      .replace(/\s{2,}/g, " ")
      .trim(),
  );
}

export function extractPlanItemArticle(itemName) {
  const m = String(itemName || "").match(ITEM_ARTICLE_META_RE);
  if (m?.[1]) return String(m[1]).trim();
  const pref = String(itemName || "").match(ITEM_ARTICLE_PREFIX_RE);
  return String(pref?.[1] || "").trim();
}

export function extractPlanItemQrQty(itemName) {
  const meta = String(itemName || "").match(ITEM_QR_QTY_META_RE);
  if (meta?.[1]) {
    const n = Number(String(meta[1]).replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n;
  }
  const pref = String(itemName || "").match(ITEM_QR_QTY_PREFIX_RE);
  if (pref?.[1]) {
    const n = Number(String(pref[1]).replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/** Человекочитаемое название позиции с вшитым артикулом/QTY (система хранения). */
export function formatEmbeddedPlanItem(itemName) {
  const raw = String(itemName || "").trim();
  const title = stripPlanItemMeta(raw) || raw || "—";
  const article = extractPlanItemArticle(raw);
  const qrQty = extractPlanItemQrQty(raw);
  return { title, article, qrQty, raw };
}
