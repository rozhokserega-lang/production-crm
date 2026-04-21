import { useMemo } from "react";
import { normalizeCatalogDedupKey, normalizeCatalogItemName } from "../app/errorCatalogHelpers";
import { getMaterialLabel } from "../app/orderHelpers";
import { normText } from "../utils/shipmentUtils";

export function useShipmentPlanningDerivedData({
  view,
  shipmentBoard,
  laborRows,
  rows,
  planCatalogRows,
  sectionCatalogRows,
  sectionArticleRows,
  planSection,
  planArticle,
  normalizeFurnitureKey,
}) {
  const weeks = useMemo(() => {
    if (view === "shipment") {
      const set = new Set();
      (shipmentBoard.sections || []).forEach((s) =>
        (s.items || []).forEach((it) => (it.cells || []).forEach((c) => c.week && set.add(String(c.week)))),
      );
      return [...set].sort((a, b) => Number(a) - Number(b));
    }
    if (view === "labor") {
      return [...new Set(laborRows.map((x) => String(x.week || "")).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
    }
    return [...new Set(rows.map((x) => String(x.week || "")).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
  }, [rows, shipmentBoard, laborRows, view]);

  const planCatalogBySection = useMemo(() => {
    const map = {};
    (shipmentBoard.sections || []).forEach((s) => {
      const section = String(s?.name || "").trim();
      if (!section) return;
      (s.items || []).forEach((it) => {
        const itemName = String(it?.item || "").trim();
        if (!itemName) return;
        const materialLabel = getMaterialLabel(itemName, it?.material);
        if (!map[section]) map[section] = [];
        const exists = map[section].some((x) => normText(x.material) === normText(materialLabel));
        if (!exists) map[section].push({ material: materialLabel, itemName });
      });
      map[section].sort((a, b) => a.material.localeCompare(b.material, "ru"));
    });
    (planCatalogRows || []).forEach((row) => {
      const section = String(row?.section_name || row?.sectionName || "").trim();
      const itemName = String(row?.item_name || row?.itemName || "").trim();
      const material = String(row?.material || "").trim();
      if (!section || !itemName || !material) return;
      if (!map[section]) map[section] = [];
      const exists = map[section].some((x) => normText(x.material) === normText(material));
      if (!exists) map[section].push({ material, itemName });
    });
    Object.keys(map).forEach((section) => {
      map[section].sort((a, b) => a.material.localeCompare(b.material, "ru"));
    });
    return map;
  }, [shipmentBoard, planCatalogRows]);

  const shipmentSectionNames = useMemo(() => {
    const names = Object.keys(planCatalogBySection).filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, "ru"));
  }, [planCatalogBySection]);

  const sectionCatalogNames = useMemo(() => {
    return (sectionCatalogRows || [])
      .map((x) => String(x.section_name || x.sectionName || "").trim())
      .filter(Boolean);
  }, [sectionCatalogRows]);

  const sectionOptions = useMemo(() => {
    return [...sectionCatalogNames, ...shipmentSectionNames, "Прочее"].filter((v, i, a) => a.indexOf(v) === i);
  }, [sectionCatalogNames, shipmentSectionNames]);

  const sectionArticles = useMemo(() => {
    const hasWhiteAliasSection = sectionOptions.includes(`${planSection} белый`);
    const list = (sectionArticleRows || [])
      .map((x) => ({
        sectionName: String(x.section_name || x.sectionName || "").trim(),
        article: String(x.article || "").trim(),
        itemName: normalizeCatalogItemName(String(x.item_name || x.itemName || "").trim()),
        material: String(x.material || "").trim(),
      }))
      .filter((x) => x.sectionName === planSection && x.article && x.itemName)
      .filter((x) => {
        if (!hasWhiteAliasSection) return true;
        return !/(белый|белые ноги)/i.test(x.itemName);
      })
      .sort((a, b) => a.itemName.localeCompare(b.itemName, "ru"));
    const byItemName = new Map();
    list.forEach((row) => {
      const dedupKey = normalizeCatalogDedupKey(row.itemName);
      if (!byItemName.has(dedupKey)) byItemName.set(dedupKey, row);
    });
    return [...byItemName.values()];
  }, [sectionArticleRows, planSection, sectionOptions]);

  const selectedArticleRow = useMemo(() => {
    return sectionArticles.find((x) => x.itemName === planArticle) || null;
  }, [sectionArticles, planArticle]);

  const articleLookupByItemKey = useMemo(() => {
    const map = new Map();
    (sectionArticleRows || []).forEach((x) => {
      const article = String(x.article || "").trim();
      const itemName = String(x.item_name || x.itemName || "").trim();
      if (!article || !itemName) return;
      const key = normalizeFurnitureKey(itemName);
      if (!key || map.has(key)) return;
      map.set(key, article);
    });
    return map;
  }, [sectionArticleRows, normalizeFurnitureKey]);

  const resolvedPlanItem = useMemo(() => {
    return String(selectedArticleRow?.itemName || "").trim();
  }, [selectedArticleRow]);

  return {
    weeks,
    sectionOptions,
    sectionArticles,
    articleLookupByItemKey,
    resolvedPlanItem,
  };
}
