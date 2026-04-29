import { useCallback, useEffect } from "react";
import { resolveFurnitureTemplateForPreview } from "../utils/furnitureUtils";
import { enrichPreviewFromFurniture } from "../app/shipmentPreviewHelpers";

export function useFurniturePreviewSync({
  sectionArticleRows,
  furnitureTemplates,
  furnitureLoading,
  furnitureError,
  setPlanPreviews,
  buildPreviewRowsFromFurnitureTemplate,
  normalizeFurnitureKey,
}) {
  const resolveFurnitureTemplateForPreviewByArticle = useCallback((preview, templates) => {
    const list = Array.isArray(templates) ? templates : [];
    if (!preview || list.length === 0) return null;
    const article = String(preview?.article || "").trim();
    if (article) {
      const row = (sectionArticleRows || []).find((x) => String(x?.article || "").trim() === article) || null;
      const itemName = String(row?.item_name || row?.itemName || "").trim();
      if (itemName) {
        const key = normalizeFurnitureKey(itemName);
        const byExact = list.find((t) => normalizeFurnitureKey(t?.productName || "") === key);
        if (byExact) return byExact;
        const byContains = list.find((t) => {
          const k = normalizeFurnitureKey(t?.productName || "");
          return k && (key.includes(k) || k.includes(key));
        });
        if (byContains) return byContains;
      }
    }
    return resolveFurnitureTemplateForPreview(preview, list);
  }, [sectionArticleRows, normalizeFurnitureKey]);

  // If previews were opened before templates loaded, enrich them in place once templates arrive.
  useEffect(() => {
    if (!Array.isArray(furnitureTemplates) || furnitureTemplates.length === 0) return;
    setPlanPreviews((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;
      let changed = false;
      const next = prev.map((p) => {
        const enriched = enrichPreviewFromFurniture(p, {
          furnitureTemplates,
          resolveFurnitureTemplateForPreview: resolveFurnitureTemplateForPreviewByArticle,
          buildPreviewRowsFromFurnitureTemplate,
          normalizeFurnitureKey,
          furnitureLoading,
          furnitureError,
        });
        if (enriched !== p) changed = true;
        return enriched;
      });
      return changed ? next : prev;
    });
  }, [
    furnitureTemplates,
    furnitureLoading,
    furnitureError,
    setPlanPreviews,
    resolveFurnitureTemplateForPreviewByArticle,
    buildPreviewRowsFromFurnitureTemplate,
    normalizeFurnitureKey,
  ]);

  return { resolveFurnitureTemplateForPreviewByArticle };
}
