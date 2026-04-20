export function resolveArticleByItemKey(itemName, articleLookupByItemKey = new Map(), normalizeItemKey) {
  const item = String(itemName || "").trim();
  const key = typeof normalizeItemKey === "function" ? normalizeItemKey(item) : item.toLowerCase();
  let article = articleLookupByItemKey.get(key) || "";
  if (!article && key) {
    const match = [...articleLookupByItemKey.entries()].find(([itemKey]) => key.includes(itemKey) || itemKey.includes(key));
    if (match) article = match[1];
  }
  return String(article || "").trim();
}

export function buildShipmentExportRows(selectedShipments = [], deps = {}) {
  const byArticle = new Map();
  const missingItems = [];
  selectedShipments.forEach((shipment) => {
    const item = String(shipment?.item || "").trim();
    const article = resolveArticleByItemKey(item, deps.articleLookupByItemKey, deps.normalizeItemKey);
    if (!article) {
      missingItems.push(item || "Без названия");
      return;
    }
    const qty = Number(shipment?.qty || 0);
    byArticle.set(article, (byArticle.get(article) || 0) + (Number.isFinite(qty) ? qty : 0));
  });
  const rows = [...byArticle.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "ru"))
    .map(([article, qty]) => [article, qty]);
  return { rows, missingItems };
}

export function parseImportPlanRows(sheetRows = []) {
  return sheetRows
    .map((r) => ({
      article: String(r?.[0] || "").trim(),
      qty: Number(String(r?.[1] || "").replace(",", ".")),
    }))
    .filter((x) => x.article && Number.isFinite(x.qty) && x.qty > 0);
}

export function buildImportArticleMap(importCatalogRows = []) {
  const articleMap = new Map();
  importCatalogRows.forEach((x) => {
    const article = String(x.article || "").trim();
    const sectionName = String(x.section_name || x.sectionName || "").trim();
    const itemName = String(x.item_name || x.itemName || "").trim();
    const material = String(x.material || "").trim();
    if (!article || !sectionName || !itemName) return;
    const key = article.toUpperCase();
    if (!articleMap.has(key)) {
      articleMap.set(key, { sectionName, itemName, material });
    }
  });
  return articleMap;
}

export async function applyImportPlanRows(importRows = [], articleMap = new Map(), deps = {}) {
  const callBackend = deps.callBackend;
  const week = String(deps.planNumber || "").trim();
  const missing = [];
  let imported = 0;
  if (typeof callBackend !== "function" || !week) {
    return { imported, missing };
  }
  for (const row of importRows) {
    const mapped = articleMap.get(String(row?.article || "").trim().toUpperCase());
    if (!mapped) {
      missing.push(String(row?.article || "").trim());
      continue;
    }
    await callBackend("webCreateShipmentPlanCell", {
      sectionName: mapped.sectionName,
      item: mapped.itemName,
      material: mapped.material,
      week,
      qty: row.qty,
    });
    imported += 1;
  }
  return { imported, missing };
}

export async function loadImportCatalogRows(deps = {}) {
  const supabaseCall = deps.supabaseCall;
  const callBackend = deps.callBackend;
  const sectionArticleRows = Array.isArray(deps.sectionArticleRows) ? deps.sectionArticleRows : [];
  try {
    // Prefer full article map from Supabase even when UI runs in GAS mode.
    const catalogData = await supabaseCall("webGetArticlesForImport");
    return Array.isArray(catalogData) ? catalogData : [];
  } catch (_) {
    try {
      const catalogData = await callBackend("webGetArticlesForImport");
      return Array.isArray(catalogData) ? catalogData : [];
    } catch (_) {
      // Final fallback to already loaded UI catalog.
      return sectionArticleRows;
    }
  }
}

export function formatShipmentExportPartialError(missingCount = 0) {
  return `Экспорт выполнен частично: не найден артикул для ${Number(missingCount) || 0} позиций.`;
}

export function formatImportShipmentPartialError(imported = 0, missing = []) {
  const missingList = Array.isArray(missing) ? missing : [];
  return `Импорт выполнен частично: ${Number(imported) || 0} строк(и) добавлено, не найдены артикулы: ` +
    `${missingList.slice(0, 8).join(", ")}${missingList.length > 8 ? "..." : ""}`;
}

export function getShipmentExportNoArticlesError() {
  return "Не найдено ни одного артикула для экспорта.";
}

export function getImportPlanNoValidRowsError() {
  return "Не найдено валидных строк. Ожидается: колонка A — артикул, B — количество.";
}

export function formatShipmentImportError(errMsg = "") {
  return `Ошибка импорта Excel: ${String(errMsg || "").trim()}`;
}
