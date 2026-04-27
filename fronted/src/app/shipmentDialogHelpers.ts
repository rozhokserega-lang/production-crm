interface StrapItem {
  name?: string;
  qty?: number;
  productName?: string;
}

interface StrapDialogInitParams {
  strapItems?: StrapItem[];
  strapProductNames?: string[];
  weekFilter?: string;
  weeks?: string[];
  strapOptionsByProduct?: { productName: string; options: string[] }[];
  defaultOptions?: string[];
  normalizeProductKey?: (name: string) => string;
}

export function buildStrapDialogInit({
  strapItems = [],
  strapProductNames = [],
  weekFilter,
  weeks = [],
  strapOptionsByProduct = [],
  defaultOptions = [],
  normalizeProductKey,
}: StrapDialogInitParams): {
  defaultProduct: string;
  defaultWeek: string;
  draft: Record<string, string>;
} {
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

export function remapStrapDraftByOptions(
  options: string[] = [],
  currentDraft: Record<string, string> = {},
): Record<string, string> {
  return options.reduce((acc, name) => ({ ...acc, [name]: currentDraft[name] || "" }), {} as Record<string, string>);
}

interface CreatePlanDialogInitParams {
  sectionOptions?: string[];
  weeks?: string[];
  sectionArticleRows?: Record<string, unknown>[];
  resolvePlanMaterial: (row: Record<string, unknown>) => string;
}

export function buildCreatePlanDialogInit({
  sectionOptions = [],
  weeks = [],
  sectionArticleRows = [],
  resolvePlanMaterial,
}: CreatePlanDialogInitParams): {
  section: string;
  article: string;
  material: string;
  week: string;
  qty: string;
} {
  const firstSection = sectionOptions[0] || "Прочее";
  const firstWeek = weeks[0] || "";
  const firstArticle = normalizeSectionArticles(sectionArticleRows).find(
    (x) => x.sectionName === firstSection && x.article,
  );
  return {
    section: firstSection,
    article: firstArticle?.itemName || "",
    material: resolvePlanMaterial((firstArticle || {}) as Record<string, unknown>),
    week: firstWeek,
    qty: "",
  };
}

interface StrapPlanRow {
  name: string;
  qty: number;
  productName: string;
}

export function buildStrapPlanRows({
  options = [],
  draft = {},
  productName = "",
}: {
  options?: string[];
  draft?: Record<string, string>;
  productName?: string;
}): StrapPlanRow[] {
  return options
    .map((name) => ({ name, qty: Number(String(draft[name] || "").replace(",", ".")) }))
    .filter((x) => Number.isFinite(x.qty) && x.qty > 0)
    .map((x) => ({ ...x, productName }));
}

export function buildStrapPlanCellPayload(
  row: StrapPlanRow,
  week: string,
  deps: {
    resolveStrapMaterialByProduct?: (productName: string) => string;
    strapNameToOrderItem?: (name: string) => string;
  } = {},
): Record<string, unknown> {
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

interface StrapSelection {
  strapProduct?: string;
  item?: string;
  row?: string;
  col?: string;
  qty?: number;
}

interface StrapPreviewPlan {
  _key: string;
  isStrapPlan: boolean;
  generatedAt: string;
  products: string[];
  rows: { part: string; qty: number }[];
}

export function buildStrapPreviewPlans(
  strapSelections: StrapSelection[] = [],
  generatedAt = "",
): StrapPreviewPlan[] {
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

function buildStrapDraft(options: string[] = [], strapItems: StrapItem[] = []): Record<string, string> {
  const nextDraft = options.reduce((acc, name) => ({ ...acc, [name]: "" }), {} as Record<string, string>);
  strapItems.forEach((x) => {
    if (nextDraft[x.name!] !== undefined) nextDraft[x.name!] = String(x.qty || "");
  });
  return nextDraft;
}

function resolveStrapOptionsForProduct({
  strapOptionsByProduct = [],
  productName,
  defaultOptions = [],
  normalizeProductKey,
}: {
  strapOptionsByProduct?: { productName: string; options: string[] }[];
  productName: string;
  defaultOptions?: string[];
  normalizeProductKey?: (name: string) => string;
}): string[] {
  if (strapOptionsByProduct.length === 0) return defaultOptions;
  const normalizer = typeof normalizeProductKey === "function" ? normalizeProductKey : (x: string) => x;
  const productKey = normalizer(productName);
  const hit = strapOptionsByProduct.find((x) => normalizer(x.productName) === productKey);
  return hit?.options || [];
}

interface NormalizedSectionArticle {
  sectionName: string;
  article: string;
  itemName: string;
  material: string;
}

function normalizeSectionArticles(rows: Record<string, unknown>[] = []): NormalizedSectionArticle[] {
  return rows.map((x) => ({
    sectionName: String(x.section_name || x.sectionName || "").trim(),
    article: String(x.article || "").trim(),
    itemName: String(x.item_name || x.itemName || "").trim(),
    material: String(x.material || "").trim(),
  }));
}
