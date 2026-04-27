import { OrderService } from "../services/orderService";
import { supabaseCall } from "../api";

export function resolveArticleByItemKey(
  itemName: string,
  articleLookupByItemKey: Map<string, string> = new Map(),
  normalizeItemKey?: (key: string) => string,
): string {
  const item = String(itemName || "").trim();
  const key = typeof normalizeItemKey === "function" ? normalizeItemKey(item) : item.toLowerCase();
  let article = articleLookupByItemKey.get(key) || "";
  if (!article && key) {
    const match = [...articleLookupByItemKey.entries()].find(
      ([itemKey]) => key.includes(itemKey) || itemKey.includes(key),
    );
    if (match) article = match[1];
  }
  return String(article || "").trim();
}

interface ShipmentSelection {
  item?: string;
  qty?: number;
}

interface ExportRowsResult {
  rows: [string, number][];
  missingItems: string[];
}

export function buildShipmentExportRows(
  selectedShipments: ShipmentSelection[] = [],
  deps: { articleLookupByItemKey?: Map<string, string>; normalizeItemKey?: (key: string) => string } = {},
): ExportRowsResult {
  const byArticle = new Map<string, number>();
  const missingItems: string[] = [];
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
  const rows: [string, number][] = [...byArticle.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "ru"))
    .map(([article, qty]) => [article, qty]);
  return { rows, missingItems };
}

interface ImportPlanRow {
  article: string;
  qty: number;
}

export function parseImportPlanRows(sheetRows: unknown[][] = []): ImportPlanRow[] {
  return sheetRows
    .map((r) => ({
      article: String(r?.[0] || "").trim(),
      qty: Number(String(r?.[1] || "").replace(",", ".")),
    }))
    .filter((x) => x.article && Number.isFinite(x.qty) && x.qty > 0);
}

interface ArticleMapEntry {
  sectionName: string;
  itemName: string;
  material: string;
}

export function buildImportArticleMap(importCatalogRows: Record<string, unknown>[] = []): Map<string, ArticleMapEntry> {
  const articleMap = new Map<string, ArticleMapEntry>();
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

interface ApplyImportResult {
  imported: number;
  missing: string[];
  marked: number;
}

export async function applyImportPlanRows(
  importRows: ImportPlanRow[] = [],
  articleMap: Map<string, ArticleMapEntry> = new Map(),
  deps: { planNumber?: string; markMissingAsPlanRows?: boolean } = {},
): Promise<ApplyImportResult> {
  const week = String(deps.planNumber || "").trim();
  const markMissingAsPlanRows = deps.markMissingAsPlanRows !== false;
  const missing: string[] = [];
  let imported = 0;
  let marked = 0;
  const missingAgg = new Map<string, number>();
  if (!week) {
    return { imported, missing, marked };
  }
  for (const row of importRows) {
    const articleRaw = String(row?.article || "").trim();
    const mapped = articleMap.get(articleRaw.toUpperCase());
    if (!mapped) {
      missing.push(articleRaw);
      if (markMissingAsPlanRows) missingAgg.set(articleRaw, (missingAgg.get(articleRaw) || 0) + Number(row.qty || 0));
      continue;
    }
    await OrderService.createShipmentPlanCell({
      sectionName: mapped.sectionName,
      item: mapped.itemName,
      material: mapped.material,
      week,
      qty: row.qty,
    });
    imported += 1;
  }
  if (markMissingAsPlanRows && missingAgg.size > 0) {
    for (const [articleRaw, qty] of missingAgg.entries()) {
      await OrderService.createShipmentPlanCell({
        sectionName: "Не сопоставлено",
        item: `[НЕ НАЙДЕН АРТИКУЛ] ${articleRaw}`,
        material: "Не указан",
        week,
        qty,
      });
      marked += 1;
    }
  }
  return { imported, missing, marked };
}

export async function loadImportCatalogRows(
  deps: { sectionArticleRows?: Record<string, unknown>[] } = {},
): Promise<Record<string, unknown>[]> {
  const sectionArticleRows = Array.isArray(deps.sectionArticleRows) ? deps.sectionArticleRows : [];
  try {
    const catalogData = await supabaseCall("webGetArticlesForImport");
    return Array.isArray(catalogData) ? catalogData : [];
  } catch (_) {
    try {
      const catalogData = await OrderService.getArticlesForImport();
      return Array.isArray(catalogData) ? catalogData : [];
    } catch (_) {
      return sectionArticleRows;
    }
  }
}

export function formatShipmentExportPartialError(missingCount = 0): string {
  return `Экспорт выполнен частично: не найден артикул для ${Number(missingCount) || 0} позиций.`;
}

export function formatImportShipmentPartialError(imported = 0, missing: string[] = [], marked = 0): string {
  const missingList = Array.isArray(missing) ? missing : [];
  const markedCount = Number(marked) || 0;
  const markedHint = markedCount > 0 ? ` Помечено в плане: ${markedCount}.` : "";
  return (
    `Импорт выполнен частично: ${Number(imported) || 0} строк(и) добавлено, не найдены артикулы: ` +
    `${missingList.slice(0, 8).join(", ")}${missingList.length > 8 ? "..." : ""}.${markedHint}`
  );
}

export function getShipmentExportNoArticlesError(): string {
  return "Не найдено ни одного артикула для экспорта.";
}

export function getImportPlanNoValidRowsError(): string {
  return "Не найдено валидных строк. Ожидается: колонка A — артикул, B — количество.";
}

export function formatShipmentImportError(errMsg = ""): string {
  return `Ошибка импорта Excel: ${String(errMsg || "").trim()}`;
}
