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
  const defaultWeek = weekFilter !== "all" ? String(weekFilter) : String(weeks[0] || "").trim();
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
    (x) => x.sectionName === firstSection && x.article,
  );
  return {
    section: firstSection,
    article: firstArticle?.itemName || "",
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
