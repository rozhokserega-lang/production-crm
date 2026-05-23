import { extractDetailSizeToken } from "../utils/furnitureUtils";

/** Размер из названия «Крышки (736_350)» или явные w/h. */
export function parseCuttingCatalogDims(item) {
  const w = Number(item?.w) || 0;
  const h = Number(item?.h) || 0;
  if (w > 0 && h > 0) return { w: Math.round(w), h: Math.round(h) };

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

/** Детали конструктора мебели → строки каталога раскроя. */
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
export function expandCatalogKitToCuttingItems(kit, setsCount, materialOverride = "") {
  const sets = Math.max(1, Math.round(Number(setsCount) || 1));
  const defaultMaterial = String(materialOverride || kit?.defaultMaterial || "").trim();
  const out = [];

  for (const raw of kit?.items || []) {
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

export function countCatalogKitPieces(kit, setsCount = 1) {
  return expandCatalogKitToCuttingItems(kit, setsCount).reduce((s, it) => s + (it.qty || 0), 0);
}
