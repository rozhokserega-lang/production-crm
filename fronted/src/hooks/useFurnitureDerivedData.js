import { useEffect, useMemo } from "react";
import {
  buildFurnitureTemplates,
  extractDetailSizeToken,
  normalizeDetailPatternKey,
  normalizeStrapProductKey,
  parseFurnitureSheet,
  toNum,
} from "../utils/furnitureUtils";

export function useFurnitureDerivedData({
  view,
  query,
  furnitureWorkbook,
  furnitureActiveSheet,
  furnitureCustomTemplates,
  furnitureSelectedProduct,
  setFurnitureSelectedProduct,
  furnitureSelectedQty,
  furnitureDetailArticleRows,
  furnitureArticleRows,
}) {
  const furnitureSheetData = useMemo(() => {
    if (!furnitureWorkbook || !furnitureActiveSheet) return { headers: [], rows: [] };
    const parsed = parseFurnitureSheet(furnitureWorkbook, furnitureActiveSheet);
    const q = String(query || "").trim().toLowerCase();
    if (!q) return parsed;
    const rows = parsed.rows.filter((row) =>
      row.some(
        (cell) =>
          String(cell?.value || "").toLowerCase().includes(q) || String(cell?.formula || "").toLowerCase().includes(q),
      ),
    );
    return { headers: parsed.headers, rows };
  }, [furnitureWorkbook, furnitureActiveSheet, query]);

  const furnitureTemplates = useMemo(() => {
    const base = furnitureWorkbook && furnitureActiveSheet
      ? buildFurnitureTemplates(furnitureWorkbook, furnitureActiveSheet)
      : [];

    const custom = (Array.isArray(furnitureCustomTemplates) ? furnitureCustomTemplates : [])
      .map((t) => ({
        productName: String(t.product_name || t.productName || "").trim(),
        productColor: String(t.product_color || t.productColor || "").trim(),
        baseQty: 1,
        details: Array.isArray(t.details)
          ? t.details.map((d) => ({
              color: String(d?.color || "").trim(),
              detailName: String(d?.detailName || d?.detail_name || "").trim(),
              sampleQty: Number(d?.sampleQty || d?.sample_qty || 0) || 0,
              perUnit: Number(d?.perUnit || d?.per_unit || 0) || 0,
            })).filter((d) => d.detailName && d.perUnit > 0)
          : [],
      }))
      .filter((t) => t.productName && Array.isArray(t.details) && t.details.length > 0);

    const merged = [...base];
    const existing = new Set(base.map((x) => String(x?.productName || "").trim()));
    custom.forEach((t) => {
      if (!existing.has(t.productName)) merged.push(t);
    });
    return merged;
  }, [furnitureWorkbook, furnitureActiveSheet, furnitureCustomTemplates]);

  const furnitureSelectedTemplate = useMemo(() => {
    return furnitureTemplates.find((x) => x.productName === furnitureSelectedProduct) || null;
  }, [furnitureTemplates, furnitureSelectedProduct]);

  const furnitureQtyNumber = useMemo(() => {
    const n = toNum(furnitureSelectedQty);
    return n > 0 ? n : 0;
  }, [furnitureSelectedQty]);

  const furnitureGeneratedDetails = useMemo(() => {
    if (!furnitureSelectedTemplate || furnitureQtyNumber <= 0) return [];
    const productKey = normalizeStrapProductKey(furnitureSelectedTemplate.productName || "");
    const detailMapBySize = new Map();
    const detailMapByPattern = new Map();
    (furnitureDetailArticleRows || []).forEach((r) => {
      const isActive = r?.is_active ?? r?.isActive;
      if (isActive === false) return;
      const pKey = normalizeStrapProductKey(r.product_name || r.productName || "");
      if (pKey !== productKey) return;
      const pattern = normalizeDetailPatternKey(r.detail_name_pattern || r.detailNamePattern || "");
      const sizeToken = extractDetailSizeToken(r.detail_name_pattern || r.detailNamePattern || "");
      const article = String(r.article || "").trim();
      if (!pattern || !article) return;
      if (sizeToken) {
        if (!detailMapBySize.has(sizeToken)) detailMapBySize.set(sizeToken, new Set());
        detailMapBySize.get(sizeToken).add(article);
      }
      if (!detailMapByPattern.has(pattern)) detailMapByPattern.set(pattern, new Set());
      detailMapByPattern.get(pattern).add(article);
    });
    return (furnitureSelectedTemplate.details || []).map((d) => {
      const raw = d.perUnit * furnitureQtyNumber;
      const qty = Math.round(raw * 1000) / 1000;
      const detailKey = normalizeDetailPatternKey(d.detailName || "");
      const detailSizeToken = extractDetailSizeToken(d.detailName || "");
      const matchedArticles = [];
      if (detailSizeToken && detailMapBySize.has(detailSizeToken)) {
        matchedArticles.push(...Array.from(detailMapBySize.get(detailSizeToken)));
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
        linkedArticles: [...new Set(matchedArticles)].sort((a, b) => a.localeCompare(b, "ru")),
      };
    });
  }, [furnitureDetailArticleRows, furnitureSelectedTemplate, furnitureQtyNumber]);

  const furnitureArticleSearchRows = useMemo(() => {
    const result = [];
    (furnitureDetailArticleRows || []).forEach((r) => {
      const isActive = r?.is_active ?? r?.isActive;
      if (isActive === false) return;
      const productName = String(r.product_name || r.productName || "").trim();
      const detailPattern = String(r.detail_name_pattern || r.detailNamePattern || "").trim();
      const article = String(r.article || "").trim();
      if (!productName || !article) return;
      result.push({
        productName,
        productKey: normalizeStrapProductKey(productName),
        detailPattern,
        article,
      });
    });
    return result;
  }, [furnitureDetailArticleRows]);

  const furnitureArticleGroups = useMemo(() => {
    if (view !== "furniture") return [];
    const q = String(query || "").trim().toLowerCase();
    const grouped = new Map();
    (furnitureArticleRows || []).forEach((r) => {
      const productName = String(r.product_name || r.productName || "").trim();
      const sectionName = String(r.section_name || r.sectionName || "").trim();
      const article = String(r.article || "").trim();
      const itemName = String(r.item_name || r.itemName || "").trim();
      const color = String(r.table_color || r.tableColor || "").trim();
      if (!productName || !article) return;
      const text = `${productName} ${sectionName} ${article} ${itemName} ${color}`.toLowerCase();
      if (q && !text.includes(q)) return;
      if (!grouped.has(productName)) grouped.set(productName, []);
      grouped.get(productName).push({ productName, sectionName, article, itemName, color });
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
    furnitureArticleSearchRows,
    furnitureArticleGroups,
  };
}
