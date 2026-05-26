import { firstSelectedWeek } from "./weekFilterUtils";
import { normalizeCatalogItemName } from "./errorCatalogHelpers";
import { normText, catalogSectionMatchesPlanSection, sectionNamesMatch } from "../utils/shipmentUtils";

export function buildStrapDialogInit({
  strapItems = [],
  strapProductNames = [],
  weekFilter,
  weeks = [],
  strapOptionsByProduct = [],
  defaultOptions = [],
  normalizeProductKey,
}) {
  const defaultProduct = strapItems[0]?.productName || strapProductNames[0] || "Обвязка";
  const defaultWeek = firstSelectedWeek(weekFilter, weeks);
  const options = resolveStrapOptionsForProduct({
    strapOptionsByProduct,
    productName: defaultProduct,
    defaultOptions,
    normalizeProductKey,
  });
  return {
    defaultProduct,
    defaultWeek,
    draft: buildStrapDraft(options, strapItems),
  };
}

export function remapStrapDraftByOptions(options = [], currentDraft = {}) {
  return options.reduce((acc, name) => ({ ...acc, [name]: currentDraft[name] || "" }), {});
}

export function buildCreatePlanDialogInit({
  sectionOptions = [],
  weeks = [],
  sectionArticleRows = [],
  resolvePlanMaterial,
}) {
  const firstSection = sectionOptions[0] || "Прочее";
  const firstWeek = weeks[0] || "";
  const firstArticle = normalizeSectionArticles(sectionArticleRows).find(
    (x) => catalogSectionMatchesPlanSection(x.sectionName, firstSection) && (x.article || x.itemName),
  );
  return {
    section: firstSection,
    article: firstArticle ? planCatalogRowSelectKey(firstArticle) : "",
    material: resolvePlanMaterial(firstArticle),
    week: firstWeek,
    qty: "",
  };
}

export function buildStrapPlanRows({
  options = [],
  draft = {},
  productName = "",
}) {
  return options
    .map((name) => ({ name, qty: Number(String(draft[name] || "").replace(",", ".")) }))
    .filter((x) => Number.isFinite(x.qty) && x.qty > 0)
    .map((x) => ({ ...x, productName }));
}

export function buildStrapPlanCellPayload(row, week, deps = {}) {
  const resolveMaterial = deps.resolveStrapMaterialByProduct;
  const toOrderItem = deps.strapNameToOrderItem;
  const material = typeof resolveMaterial === "function" ? resolveMaterial(row?.productName || "") : "";
  const item = typeof toOrderItem === "function" ? toOrderItem(row?.name) : String(row?.name || "");
  return {
    sectionName: "Обвязка",
    item,
    material,
    week,
    qty: Number(row?.qty || 0),
  };
}

export function buildStrapPreviewPlans(strapSelections = [], generatedAt = "") {
  if (!Array.isArray(strapSelections) || strapSelections.length === 0) return [];
  return strapSelections.map((x, idx) => {
    const product = String(x?.strapProduct || "Обвязка").trim() || "Обвязка";
    const itemName = String(x?.item || "").trim();
    const targetLabel = product ? `для изделия "${product}"` : "";
    return {
      _key: `strap-plan-selected-${idx}-${x?.row}-${x?.col}`,
      isStrapPlan: true,
      generatedAt,
      products: [product],
      rows: [
        {
          part: [itemName, targetLabel].filter(Boolean).join(" - "),
          qty: Number(x?.qty || 0),
        },
      ],
    };
  });
}

function buildStrapDraft(options = [], strapItems = []) {
  const nextDraft = options.reduce((acc, name) => ({ ...acc, [name]: "" }), {});
  strapItems.forEach((x) => {
    if (nextDraft[x.name] !== undefined) nextDraft[x.name] = String(x.qty || "");
  });
  return nextDraft;
}

function resolveStrapOptionsForProduct({
  strapOptionsByProduct = [],
  productName,
  defaultOptions = [],
  normalizeProductKey,
}) {
  if (strapOptionsByProduct.length === 0) return defaultOptions;
  const normalizer = typeof normalizeProductKey === "function" ? normalizeProductKey : (x) => x;
  const productKey = normalizer(productName);
  const hit = strapOptionsByProduct.find((x) => normalizer(x.productName) === productKey);
  return hit?.options || [];
}

function normalizeSectionArticles(rows = []) {
  return rows.map((x) => ({
    sectionName: String(x.section_name || x.sectionName || "").trim(),
    article: String(x.article || "").trim(),
    itemName: String(x.item_name || x.itemName || "").trim(),
    material: String(x.material || "").trim(),
  }));
}

/** Уникальное значение <select> для строки каталога (несколько цветов при одном item_name из конструктора). */
export function planCatalogRowSelectKey(x) {
  const art = String(x?.article || "").trim();
  const matNorm = normText(String(x?.material || x?.table_color || "").trim());
  if (art) return `${art.toUpperCase()}|${matNorm}`;
  const item = String(x?.itemName || x?.item_name || "").trim();
  return `${item}|||${matNorm}`;
}

function planCatalogArticleFromKey(selectKey) {
  const k = String(selectKey || "").trim();
  if (!k) return "";
  if (k.includes("|")) return k.split("|")[0].trim().toUpperCase();
  if (!k.includes("|||")) return k.toUpperCase();
  return "";
}

/** Совпадение ключа селекта с учётом старых значений (только артикул без материала). */
export function matchPlanCatalogRowSelectKey(row, selectKey) {
  const k = String(selectKey || "").trim();
  if (!k) return false;
  if (planCatalogRowSelectKey(row) === k) return true;
  const art = String(row?.article || "").trim().toUpperCase();
  if (art && k.includes("|")) {
    const keyArt = planCatalogArticleFromKey(k);
    if (keyArt && keyArt === art) return true;
  }
  if (!k.includes("|") && !k.includes("|||")) {
    if (art && art === k.toUpperCase()) return true;
  }
  if (k.includes("|||")) {
    const [itemPart, matPart] = k.split("|||");
    const rowItem = normText(String(row?.itemName || row?.item_name || ""));
    const rowMat = normText(String(row?.material || row?.table_color || ""));
    if (itemPart && rowItem === normText(itemPart) && (!matPart || rowMat === normText(matPart))) return true;
  }
  return false;
}

function normalizePlanCatalogRow(x) {
  return {
    sectionName: String(x?.section_name || x?.sectionName || "").trim(),
    article: String(x?.article || "").trim(),
    itemName: normalizeCatalogItemName(String(x?.item_name || x?.itemName || "").trim()),
    material: String(x?.material || x?.table_color || "").trim(),
  };
}

/**
 * Находит строку каталога по секции, ключу селекта «Артикул» и материалу.
 */
export function resolvePlanCatalogSelection({
  planSection = "",
  planArticle = "",
  planMaterial = "",
  sectionArticleRows = [],
  sectionArticles = [],
}) {
  const section = String(planSection || "").trim();
  const selectKey = String(planArticle || "").trim();
  const materialKey = normText(planMaterial);

  const pool = (
    Array.isArray(sectionArticles) && sectionArticles.length
      ? sectionArticles
      : (sectionArticleRows || [])
          .map(normalizePlanCatalogRow)
          .filter((x) => catalogSectionMatchesPlanSection(x.sectionName, section) && x.article && x.itemName)
  ).map((x) => (x.itemName ? x : normalizePlanCatalogRow(x)));

  if (!selectKey && !materialKey) return null;

  const pickBest = (candidates) => {
    if (!candidates.length) return null;
    if (materialKey) {
      const byMat = candidates.filter((r) => normText(r.material) === materialKey);
      if (byMat.length) return byMat[0];
      const fuzzy = candidates.filter((r) => {
        const rm = normText(r.material);
        return rm.includes(materialKey) || materialKey.includes(rm);
      });
      if (fuzzy.length === 1) return fuzzy[0];
    }
    return candidates[0];
  };

  let candidates = pool.filter((r) => matchPlanCatalogRowSelectKey(r, selectKey));
  const hit = pickBest(candidates);
  if (hit) return hit;

  candidates = pool.filter((r) => normText(r.itemName) === normText(selectKey));
  const hitByName = pickBest(candidates);
  if (hitByName) return hitByName;

  const keyArt = planCatalogArticleFromKey(selectKey);
  if (keyArt) {
    candidates = pool.filter((r) => r.article.toUpperCase() === keyArt);
    const hitByArt = pickBest(candidates);
    if (hitByArt) return hitByArt;
  }

  if (materialKey) {
    candidates = pool.filter((r) => normText(r.material) === materialKey);
    if (candidates.length === 1) return candidates[0];
  }

  return null;
}
