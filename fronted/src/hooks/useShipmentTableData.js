import { useMemo } from "react";
import { extractPlanItemArticle, stripPlanItemMeta } from "../app/orderHelpers";

export function useShipmentTableData({
  view,
  shipmentRenderSections,
  shipmentOrderMaps,
  visibleCellsForItem,
  getShipmentStageKey,
  stageBg,
  stageLabel,
  normalizeFurnitureKey,
  hiddenShipmentGroups,
}) {
  const shipmentTableRows = useMemo(() => {
    if (view !== "shipment") return [];
    const rowsFlat = [];
    shipmentRenderSections.forEach((section) => {
      (section.items || []).forEach((it) => {
        visibleCellsForItem(it).forEach((c) => {
          const sourceRow = it.sourceRowId != null ? String(it.sourceRowId) : String(it.row);
          const sourceCol = c.sourceColId != null ? String(c.sourceColId) : String(c.col);
          const stageKey = getShipmentStageKey(c, sourceRow, shipmentOrderMaps, it.item);
          const displayBg = stageBg(stageKey, c.bg || "#ffffff");
          rowsFlat.push({
            key: `${sourceRow}-${sourceCol}`,
            section: section.name,
            sourceItem: String(it.item || ""),
            item: stripPlanItemMeta(it.item),
            productArticle: String(
              it.productArticle || it.article_code || it.articleCode || it.article || it.mapped_article_code || it.mappedArticleCode || "",
            ).trim() || extractPlanItemArticle(it.item),
            strapProduct: String(it.strapProduct || ""),
            material: it.material || "",
            week: c.week || "-",
            qty: Number(c.qty || 0),
            sheets: Number(c.sheetsNeeded || 0),
            outputPerSheet: Number(c.outputPerSheet || 0),
            availableSheets: Number(c.availableSheets || 0),
            bg: displayBg,
            status: stageLabel(stageKey),
            stageKey,
            canSendToWork: !!c.canSendToWork,
            inWork: !!c.inWork,
            sourceRow,
            sourceCol,
          });
        });
      });
    });
    return rowsFlat;
  }, [
    view,
    shipmentRenderSections,
    shipmentOrderMaps,
    visibleCellsForItem,
    getShipmentStageKey,
    stageBg,
    stageLabel,
  ]);

  const shipmentMaterialBalance = useMemo(() => {
    const byMaterial = new Map();
    shipmentTableRows.forEach((row) => {
      // Count only rows that are truly waiting to be launched.
      if (row.stageKey !== "awaiting") return;
      const material = String(row.material || "Материал не указан").trim();
      const key = normalizeFurnitureKey(material);
      const needed = Number(row.sheets || 0);
      const available = Number(row.availableSheets || 0);
      if (!byMaterial.has(key)) byMaterial.set(key, { material, needed: 0, available: 0 });
      const bucket = byMaterial.get(key);
      bucket.needed += needed;
      bucket.available = Math.max(bucket.available, available);
    });
    return byMaterial;
  }, [shipmentTableRows, normalizeFurnitureKey]);

  const shipmentTableRowsWithStockStatus = useMemo(() => {
    return shipmentTableRows.map((row) => {
      const key = normalizeFurnitureKey(row.material || "");
      const totals = shipmentMaterialBalance.get(key) || { needed: 0, available: 0 };
      const deficit = Math.max(0, Number(totals.needed || 0) - Number(totals.available || 0));
      return {
        ...row,
        materialNeededTotal: Number(totals.needed || 0),
        materialAvailableTotal: Number(totals.available || 0),
        materialDeficit: deficit,
        materialHasDeficit: deficit > 0,
      };
    });
  }, [shipmentTableRows, shipmentMaterialBalance, normalizeFurnitureKey]);

  const shipmentTableGroupNames = useMemo(() => {
    return [...new Set(shipmentTableRowsWithStockStatus.map((row) => String(row.section || "Прочее")))].sort((a, b) =>
      a.localeCompare(b, "ru"),
    );
  }, [shipmentTableRowsWithStockStatus]);

  const visibleShipmentTableRows = useMemo(() => {
    return shipmentTableRowsWithStockStatus.filter(
      (row) => !hiddenShipmentGroups[String(row.section || "Прочее")],
    );
  }, [shipmentTableRowsWithStockStatus, hiddenShipmentGroups]);

  const shipmentPlanDeficits = useMemo(() => {
    return [...shipmentMaterialBalance.values()]
      .map((x) => ({
        material: x.material,
        needed: Number(x.needed || 0),
        available: Number(x.available || 0),
        deficit: Math.max(0, Number(x.needed || 0) - Number(x.available || 0)),
      }))
      .filter((x) => x.deficit > 0)
      .sort((a, b) => b.deficit - a.deficit || a.material.localeCompare(b.material, "ru"));
  }, [shipmentMaterialBalance]);

  return {
    shipmentTableRows,
    shipmentMaterialBalance,
    shipmentTableRowsWithStockStatus,
    shipmentTableGroupNames,
    visibleShipmentTableRows,
    shipmentPlanDeficits,
  };
}
