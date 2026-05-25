import { extractDetailSizeToken } from "../utils/furnitureUtils";

function readExplicitDim(value) {
  if (value === "" || value == null) return 0;
  const n = Math.round(Number(value) || 0);
  return n > 0 ? n : 0;
}

/** Размер для раскроя: явные w/h важнее размера в названии «(736_350)». */
export function parseCuttingCatalogDims(item) {
  const w = readExplicitDim(item?.w);
  const h = readExplicitDim(item?.h);
  if (w > 0 && h > 0) return { w, h };

  const token = extractDetailSizeToken(item?.itemName || item?.detailName || "");
  if (!token) return null;
  const [tw, th] = token.split("_").map((n) => Math.round(Number(n) || 0));
  if (tw <= 0 || th <= 0) return null;
  return { w: tw, h: th };
}

export function normalizeCatalogItem(raw) {
  const itemName = String(raw?.itemName || raw?.detailName || "").trim();
  const dims = parseCuttingCatalogDims(raw);
  if (!itemName || !dims) return null;

  return {
    itemName,
    w: dims.w,
    h: dims.h,
    perUnit: Math.max(1, Math.round(Number(raw?.perUnit ?? raw?.qty ?? 1) || 1)),
    material: String(raw?.material || "").trim(),
  };
}

/** Строки редактора каталога раскроя. */
export function catalogItemsToEditorRows(items = []) {
  const source = items.length ? items : [{ itemName: "", w: "", h: "", perUnit: 1, material: "" }];
  return source.map((it) => {
    const norm = normalizeCatalogItem(it);
    return {
      itemName: norm?.itemName || String(it?.itemName || "").trim(),
      w: norm?.w ?? "",
      h: norm?.h ?? "",
      perUnit: norm?.perUnit ?? it?.perUnit ?? 1,
      material: norm?.material || it?.material || "",
    };
  });
}

/** Детали конструктора мебели → строки каталога раскроя (конструктор не меняется). */
export function furnitureTemplateToCatalogItems(template) {
  if (!template?.details?.length) return [];
  return template.details
    .map((d) => normalizeCatalogItem({
      itemName: d.detailName,
      w: d.w,
      h: d.h,
      perUnit: d.perUnit,
      material: d.material,
    }))
    .filter(Boolean);
}

/** Комплект × кол-во комплектов → позиции для cutting_jobs.items */
export function expandCatalogKitToCuttingItems(kit, setsCount, materialOverride = "", editorRows = null) {
  const sets = Math.max(1, Math.round(Number(setsCount) || 1));
  const defaultMaterial = String(materialOverride || kit?.defaultMaterial || "").trim();
  const rawItems = Array.isArray(editorRows) ? editorRows : (kit?.items || []);
  const out = [];

  for (const raw of rawItems) {
    const norm = normalizeCatalogItem(raw);
    if (!norm) continue;
    out.push({
      itemName: norm.itemName,
      w: norm.w,
      h: norm.h,
      qty: norm.perUnit * sets,
      material: norm.material || defaultMaterial,
    });
  }

  return out;
}

export function countCatalogKitPieces(kit, setsCount = 1, editorRows = null) {
  return expandCatalogKitToCuttingItems(kit, setsCount, "", editorRows)
    .reduce((s, it) => s + (it.qty || 0), 0);
}

/** Есть ли отличия размеров раскроя от сохранённого комплекта. */
export function catalogKitSizesChanged(catalogItems = [], editorRows = []) {
  const base = catalogItemsToEditorRows(catalogItems);
  if (base.length !== editorRows.length) return true;
  return editorRows.some((row, idx) => {
    const a = normalizeCatalogItem(base[idx]);
    const b = normalizeCatalogItem(row);
    if (!a || !b) return false;
    return a.w !== b.w || a.h !== b.h;
  });
}
