import { ceilWholeSheets, effectiveOutputPerSheet, sheetsFromTemplateKits } from "./appUtils";

export function normalizeMaterialKey(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .trim();
}

export function parseMaterialYields(tpl) {
  const raw = tpl?.material_yields ?? tpl?.materialYields;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((y) => ({
      material: String(y?.material || "").trim(),
      kits_per_sheet: Number(y?.kits_per_sheet ?? y?.kitsPerSheet ?? 0) || 0,
    }))
    .filter((y) => y.material && y.kits_per_sheet > 0);
}

export function findFurnitureTemplate(templates, itemName, normalizeKey) {
  const list = Array.isArray(templates) ? templates : [];
  const normalize =
    typeof normalizeKey === "function" ? normalizeKey : (v) => normalizeMaterialKey(v);
  const rawItem = String(itemName || "").trim();
  const itemKey = normalize(rawItem);
  if (!itemKey || !list.length) return null;
  return (
    list.find((t) => normalize(String(t?.product_name || t?.productName || "")) === itemKey) ||
    list.find((t) => {
      const k = normalize(String(t?.product_name || t?.productName || ""));
      return k && (itemKey.includes(k) || k.includes(itemKey));
    }) ||
    null
  );
}

export function resolveKitsPerSheetFromTemplate(tpl, materialName = "") {
  if (!tpl) return 0;
  const materialKey = normalizeMaterialKey(materialName);
  const yields = parseMaterialYields(tpl);
  if (materialKey && yields.length) {
    const hit = yields.find((y) => normalizeMaterialKey(y.material) === materialKey);
    if (hit) return hit.kits_per_sheet;
  }
  return Number(tpl?.kits_per_sheet ?? tpl?.kitsPerSheet ?? 0) || 0;
}

export function resolveOutputPerSheetFromTemplate(tpl, materialName = "") {
  return effectiveOutputPerSheet(resolveKitsPerSheetFromTemplate(tpl, materialName));
}

export function resolveKitsPerSheetForItem(templates, itemName, materialName = "", normalizeKey) {
  const tpl = findFurnitureTemplate(templates, itemName, normalizeKey);
  return resolveOutputPerSheetFromTemplate(tpl, materialName);
}

function isCombinedMaterialLabel(material) {
  const m = String(material || "").trim();
  if (!m) return false;
  return /[/,;+]/.test(m) || /\s+и\s+/i.test(m);
}

/**
 * Нужно ли считать расход по всем декорам шаблона (Color Block и т.п.).
 */
export function isMultiDecorSheetProduct(tpl, cellMaterial = "") {
  const yields = parseMaterialYields(tpl);
  if (yields.length <= 1) return false;
  const cellKey = normalizeMaterialKey(cellMaterial);
  if (!cellKey) return true;
  if (isCombinedMaterialLabel(cellMaterial)) return true;
  const exact = yields.some((y) => normalizeMaterialKey(y.material) === cellKey);
  return !exact;
}

/**
 * Листы по каждому материалу для заказа/ячейки. Для мульти-декора — все строки material_yields.
 */
export function resolveSheetNeedsByMaterials(templates, itemName, qty, cellMaterial = "", normalizeKey) {
  const q = Number(qty || 0);
  if (!(q > 0)) return [];
  const tpl = findFurnitureTemplate(templates, itemName, normalizeKey);
  const yields = parseMaterialYields(tpl);
  const material = String(cellMaterial || "").trim();

  if (yields.length > 1 && isMultiDecorSheetProduct(tpl, material)) {
    return yields
      .map((y) => ({
        material: y.material,
        sheets: sheetsFromTemplateKits(y.kits_per_sheet, q),
      }))
      .filter((x) => x.sheets > 0);
  }

  const kits = resolveKitsPerSheetFromTemplate(tpl, material);
  const sheets = sheetsFromTemplateKits(kits, q);
  if (!(sheets > 0)) return [];
  const label = yields.find((y) => normalizeMaterialKey(y.material) === normalizeMaterialKey(material))?.material
    || yields[0]?.material
    || material
    || "—";
  return [{ material: label, sheets }];
}

export function buildMaterialYieldsFromVariants(variants, parseNum) {
  const parse = typeof parseNum === "function" ? parseNum : (v) => Number(v) || 0;
  const seen = new Set();
  const out = [];
  for (const v of Array.isArray(variants) ? variants : []) {
    const material = String(v?.color || v?.material || "").trim();
    const kits = parse(v?.kitsPerSheet ?? v?.kits_per_sheet ?? 0);
    if (!material || !(kits > 0)) continue;
    const key = normalizeMaterialKey(material);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ material, kits_per_sheet: kits });
  }
  return out;
}
