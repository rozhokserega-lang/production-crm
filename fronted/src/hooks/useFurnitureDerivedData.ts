import { useEffect, useMemo } from "react";
import {
  buildFurnitureTemplates,
  extractDetailSizeToken,
  normalizeDetailPatternKey,
  normalizeStrapProductKey,
  parseFurnitureSheet,
  toNum,
} from "../utils/furnitureUtils";

interface FurnitureSheetCell {
  value?: unknown;
  formula?: string;
}

interface FurnitureSheetData {
  headers: string[];
  rows: FurnitureSheetCell[][];
}

interface FurnitureTemplateDetail {
  detailName: string;
  perUnit: number;
  [key: string]: unknown;
}

interface FurnitureTemplate {
  productName: string;
  details: FurnitureTemplateDetail[];
  [key: string]: unknown;
}

interface FurnitureGeneratedDetail extends FurnitureTemplateDetail {
  qty: number;
  linkedArticles: string[];
}

interface FurnitureArticleGroup {
  productName: string;
  rows: { productName: string; sectionName: string; article: string; itemName: string; color: string }[];
}

interface UseFurnitureDerivedDataParams {
  view: string;
  query: string;
  furnitureWorkbook: unknown;
  furnitureActiveSheet: string;
  furnitureSelectedProduct: string;
  setFurnitureSelectedProduct: (v: string) => void;
  furnitureSelectedQty: unknown;
  furnitureDetailArticleRows: unknown[];
  furnitureArticleRows: unknown[];
}

interface UseFurnitureDerivedDataReturn {
  furnitureSheetData: FurnitureSheetData;
  furnitureTemplates: FurnitureTemplate[];
  furnitureSelectedTemplate: FurnitureTemplate | null;
  furnitureQtyNumber: number;
  furnitureGeneratedDetails: FurnitureGeneratedDetail[];
  furnitureArticleGroups: FurnitureArticleGroup[];
}

export function useFurnitureDerivedData({
  view,
  query,
  furnitureWorkbook,
  furnitureActiveSheet,
  furnitureSelectedProduct,
  setFurnitureSelectedProduct,
  furnitureSelectedQty,
  furnitureDetailArticleRows,
  furnitureArticleRows,
}: UseFurnitureDerivedDataParams): UseFurnitureDerivedDataReturn {
  const furnitureSheetData = useMemo(() => {
    if (!furnitureWorkbook || !furnitureActiveSheet) return { headers: [], rows: [] };
    const parsed = parseFurnitureSheet(
      furnitureWorkbook as never,
      furnitureActiveSheet,
    );
    const q = String(query || "").trim().toLowerCase();
    if (!q) return parsed;
    const rows = parsed.rows.filter((row) =>
      row.some(
        (cell) =>
          String(cell?.value || "").toLowerCase().includes(q) ||
          String(cell?.formula || "").toLowerCase().includes(q),
      ),
    );
    return { headers: parsed.headers, rows };
  }, [furnitureWorkbook, furnitureActiveSheet, query]);

  const furnitureTemplates = useMemo(() => {
    if (!furnitureWorkbook || !furnitureActiveSheet) return [];
    return buildFurnitureTemplates(
      furnitureWorkbook as never,
      furnitureActiveSheet,
    ) as unknown as FurnitureTemplate[];
  }, [furnitureWorkbook, furnitureActiveSheet]);

  const furnitureSelectedTemplate = useMemo(() => {
    return furnitureTemplates.find((x) => x.productName === furnitureSelectedProduct) || null;
  }, [furnitureTemplates, furnitureSelectedProduct]);

  const furnitureQtyNumber = useMemo(() => {
    const n = toNum(furnitureSelectedQty);
    return n > 0 ? n : 0;
  }, [furnitureSelectedQty]);

  const furnitureGeneratedDetails = useMemo(() => {
    if (!furnitureSelectedTemplate || furnitureQtyNumber <= 0) return [];
    const productKey = normalizeStrapProductKey(
      furnitureSelectedTemplate.productName || "",
    );
    const detailMapBySize = new Map<string, Set<string>>();
    const detailMapByPattern = new Map<string, Set<string>>();
    (furnitureDetailArticleRows || []).forEach((r) => {
      const row = r as Record<string, unknown>;
      const isActive = row?.is_active ?? row?.isActive;
      if (isActive === false) return;
      const pKey = normalizeStrapProductKey(
        String(row.product_name || row.productName || ""),
      );
      if (pKey !== productKey) return;
      const pattern = normalizeDetailPatternKey(
        String(row.detail_name_pattern || row.detailNamePattern || ""),
      );
      const sizeToken = extractDetailSizeToken(
        String(row.detail_name_pattern || row.detailNamePattern || ""),
      );
      const article = String(row.article || "").trim();
      if (!pattern || !article) return;
      if (sizeToken) {
        if (!detailMapBySize.has(sizeToken))
          detailMapBySize.set(sizeToken, new Set<string>());
        detailMapBySize.get(sizeToken)!.add(article);
      }
      if (!detailMapByPattern.has(pattern))
        detailMapByPattern.set(pattern, new Set<string>());
      detailMapByPattern.get(pattern)!.add(article);
    });
    return (furnitureSelectedTemplate.details || []).map((d) => {
      const raw = d.perUnit * furnitureQtyNumber;
      const qty = Math.round(raw * 1000) / 1000;
      const detailKey = normalizeDetailPatternKey(d.detailName || "");
      const detailSizeToken = extractDetailSizeToken(d.detailName || "");
      const matchedArticles: string[] = [];
      if (detailSizeToken && detailMapBySize.has(detailSizeToken)) {
        matchedArticles.push(...Array.from(detailMapBySize.get(detailSizeToken)!));
      } else {
        detailMapByPattern.forEach((articles, pattern) => {
          if (detailKey.includes(pattern) || pattern.includes(detailKey)) {
            matchedArticles.push(...Array.from(articles));
          }
        });
      }
      if (matchedArticles.length === 0) {
        detailMapByPattern.forEach((articles, pattern) => {
          if (detailKey.includes(pattern) || pattern.includes(detailKey)) {
            matchedArticles.push(...Array.from(articles));
          }
        });
      }
      return {
        ...d,
        qty,
        linkedArticles: [...new Set(matchedArticles)].sort((a, b) =>
          a.localeCompare(b, "ru"),
        ),
      };
    });
  }, [furnitureDetailArticleRows, furnitureSelectedTemplate, furnitureQtyNumber]);

  const furnitureArticleGroups = useMemo(() => {
    if (view !== "furniture") return [];
    const q = String(query || "").trim().toLowerCase();
    const grouped = new Map<string, FurnitureArticleGroup["rows"]>();
    (furnitureArticleRows || []).forEach((r) => {
      const row = r as Record<string, unknown>;
      const productName = String(row.product_name || row.productName || "").trim();
      const sectionName = String(row.section_name || row.sectionName || "").trim();
      const article = String(row.article || "").trim();
      const itemName = String(row.item_name || row.itemName || "").trim();
      const color = String(row.table_color || row.tableColor || "").trim();
      if (!productName || !article) return;
      const text = `${productName} ${sectionName} ${article} ${itemName} ${color}`.toLowerCase();
      if (q && !text.includes(q)) return;
      if (!grouped.has(productName)) grouped.set(productName, []);
      grouped.get(productName)!.push({ productName, sectionName, article, itemName, color });
    });
    return [...grouped.entries()]
      .map(([productName, rows]) => ({
        productName,
        rows: rows.sort((a, b) => a.itemName.localeCompare(b.itemName, "ru")),
      }))
      .sort((a, b) => a.productName.localeCompare(b.productName, "ru"));
  }, [furnitureArticleRows, query, view]);

  useEffect(() => {
    if (view !== "furniture") return;
    if (!furnitureTemplates.length) return;
    if (furnitureTemplates.some((x) => x.productName === furnitureSelectedProduct)) return;
    setFurnitureSelectedProduct(String(furnitureTemplates[0].productName || ""));
  }, [view, furnitureTemplates, furnitureSelectedProduct, setFurnitureSelectedProduct]);

  return {
    furnitureSheetData,
    furnitureTemplates,
    furnitureSelectedTemplate,
    furnitureQtyNumber,
    furnitureGeneratedDetails,
    furnitureArticleGroups,
  };
}
