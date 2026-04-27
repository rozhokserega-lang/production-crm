import { useMemo } from "react";
import { normalizeCatalogDedupKey, normalizeCatalogItemName } from "../app/errorCatalogHelpers";
import { getMaterialLabel } from "../app/orderHelpers";
import { normText } from "../utils/shipmentUtils";

interface SectionArticleRow {
  sectionName: string;
  article: string;
  itemName: string;
  material: string;
}

interface PlanCatalogEntry {
  material: string;
  itemName: string;
}

interface UseShipmentPlanningDerivedDataParams {
  view: string;
  shipmentBoard: Record<string, unknown>;
  laborRows: unknown[];
  rows: unknown[];
  planCatalogRows: unknown[];
  sectionCatalogRows: unknown[];
  sectionArticleRows: unknown[];
  planSection: string;
  planArticle: string;
  normalizeFurnitureKey: (v: string) => string;
}

interface UseShipmentPlanningDerivedDataReturn {
  weeks: string[];
  sectionOptions: string[];
  sectionArticles: SectionArticleRow[];
  articleLookupByItemKey: Map<string, string>;
  resolvedPlanItem: string;
}

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
}: UseShipmentPlanningDerivedDataParams): UseShipmentPlanningDerivedDataReturn {
  const weeks = useMemo(() => {
    if (view === "shipment") {
      const set = new Set<string>();
      const sections = (shipmentBoard.sections || []) as Record<string, unknown>[];
      sections.forEach((s) =>
        ((s.items || []) as Record<string, unknown>[]).forEach((it) =>
          ((it.cells || []) as Record<string, unknown>[]).forEach((c) => {
            if (c.week) set.add(String(c.week));
          }),
        ),
      );
      return [...set].sort((a, b) => Number(a) - Number(b));
    }
    if (view === "labor") {
      return [
        ...new Set(
          (laborRows as Record<string, unknown>[])
            .map((x) => String(x.week || ""))
            .filter(Boolean),
        ),
      ].sort((a, b) => Number(a) - Number(b));
    }
    return [
      ...new Set(
        (rows as Record<string, unknown>[])
          .map((x) => String(x.week || ""))
          .filter(Boolean),
      ),
    ].sort((a, b) => Number(a) - Number(b));
  }, [rows, shipmentBoard, laborRows, view]);

  const planCatalogBySection = useMemo(() => {
    const map: Record<string, PlanCatalogEntry[]> = {};
    const sections = (shipmentBoard.sections || []) as Record<string, unknown>[];
    sections.forEach((s) => {
      const section = String((s as Record<string, unknown>)?.name || "").trim();
      if (!section) return;
      const items = (s.items || []) as Record<string, unknown>[];
      items.forEach((it) => {
        const itemName = String(it?.item || "").trim();
        if (!itemName) return;
        const materialLabel = getMaterialLabel(itemName, String(it?.material || ""));
        if (!map[section]) map[section] = [];
        const exists = map[section].some(
          (x) => normText(x.material) === normText(materialLabel),
        );
        if (!exists) map[section].push({ material: materialLabel, itemName });
      });
      map[section].sort((a, b) => a.material.localeCompare(b.material, "ru"));
    });
    (planCatalogRows || []).forEach((r) => {
      const row = r as Record<string, unknown>;
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
      .map((x) => {
        const row = x as Record<string, unknown>;
        return String(row.section_name || row.sectionName || "").trim();
      })
      .filter(Boolean);
  }, [sectionCatalogRows]);

  const sectionOptions = useMemo(() => {
    return [...sectionCatalogNames, ...shipmentSectionNames, "Прочее"].filter(
      (v, i, a) => a.indexOf(v) === i,
    );
  }, [sectionCatalogNames, shipmentSectionNames]);

  const sectionArticles = useMemo(() => {
    const hasWhiteAliasSection = sectionOptions.includes(`${planSection} белый`);
    const list = (sectionArticleRows || [])
      .map((x) => {
        const row = x as Record<string, unknown>;
        return {
          sectionName: String(row.section_name || row.sectionName || "").trim(),
          article: String(row.article || "").trim(),
          itemName: normalizeCatalogItemName(
            String(row.item_name || row.itemName || "").trim(),
          ),
          material: String(row.material || "").trim(),
        };
      })
      .filter((x) => x.sectionName === planSection && x.article && x.itemName)
      .filter((x) => {
        if (!hasWhiteAliasSection) return true;
        return !/(белый|белые ноги)/i.test(x.itemName);
      })
      .sort((a, b) => a.itemName.localeCompare(b.itemName, "ru"));
    const byItemName = new Map<string, SectionArticleRow>();
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
    const map = new Map<string, string>();
    (sectionArticleRows || []).forEach((x) => {
      const row = x as Record<string, unknown>;
      const article = String(row.article || "").trim();
      const itemName = String(row.item_name || row.itemName || "").trim();
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
