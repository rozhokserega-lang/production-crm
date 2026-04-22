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

export function embedPlanItemArticle(itemName, articleCode) {
  const item = String(itemName || "").trim();
  const article = String(articleCode || "").trim();
  if (!item || !article) return item;
  return `${item} {{ART:${article}}}`;
}

export function stripPlanItemMeta(itemName) {
  return String(itemName || "").replace(ITEM_ARTICLE_META_RE, "").replace(/\s{2,}/g, " ").trim();
}

export function extractPlanItemArticle(itemName) {
  const m = String(itemName || "").match(ITEM_ARTICLE_META_RE);
  return String(m?.[1] || "").trim();
}
