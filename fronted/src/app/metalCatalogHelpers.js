import { deriveStageRouteFromGraph, processGraphFromCatalogRow } from "./metalProcessGraph";

export const UNCategorized_LABEL = "Без категории";

export function normalizeCatalogCategory(value) {
  const text = String(value || "").trim();
  return text || UNCategorized_LABEL;
}

export function mapMetalCatalogCategoryRow(row) {
  const processGraph = processGraphFromCatalogRow(row);
  return {
    name: normalizeCatalogCategory(row?.name),
    isHidden: Boolean(row?.is_hidden ?? row?.isHidden ?? false),
    sortOrder: Number(row?.sort_order ?? row?.sortOrder ?? 0) || 0,
    stageRoute: deriveStageRouteFromGraph(processGraph),
    processGraph,
    itemCount: Number(row?.item_count ?? row?.itemCount ?? 0) || 0,
    updatedAt: String(row?.updated_at ?? row?.updatedAt ?? "").trim(),
  };
}

export function groupCatalogRowsByCategory(rows, categories = [], { showHidden = false } = {}) {
  const hidden = new Set(
    (Array.isArray(categories) ? categories : [])
      .filter((cat) => cat?.isHidden)
      .map((cat) => normalizeCatalogCategory(cat?.name)),
  );
  const order = new Map(
    (Array.isArray(categories) ? categories : []).map((cat, idx) => [
      normalizeCatalogCategory(cat?.name),
      Number(cat?.sortOrder ?? idx) || idx,
    ]),
  );
  const groups = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const category = normalizeCatalogCategory(row?.category);
    if (hidden.has(category) && !showHidden) continue;
    if (!groups.has(category)) {
      groups.set(category, []);
    }
    groups.get(category).push(row);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      const ao = order.has(a) ? order.get(a) : 9999;
      const bo = order.has(b) ? order.get(b) : 9999;
      if (ao !== bo) return ao - bo;
      return a.localeCompare(b, "ru");
    })
    .map(([name, groupRows]) => ({
      name,
      isHidden: hidden.has(name),
      rows: groupRows.sort((x, y) => String(x.article).localeCompare(String(y.article), "ru")),
    }));
}

export function findCategoryMeta(categories, categoryName) {
  const key = normalizeCatalogCategory(categoryName);
  return (Array.isArray(categories) ? categories : []).find(
    (cat) => normalizeCatalogCategory(cat?.name) === key,
  );
}
