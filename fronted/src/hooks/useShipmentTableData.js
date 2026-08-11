import { useMemo } from "react";
import { extractPlanItemArticle, shipmentOrderKey, stripPlanItemMeta } from "../app/orderHelpers";
import { ceilWholeSheets } from "../app/appUtils";
import { resolvePlanItemSheets } from "../app/planSheetEstimation";
import { applyLoftPairedSheetAdjustment } from "../app/loftPairedSheetEstimation";
import {
  annotateRowsWithMaterialCoverage,
  buildShipmentMaterialPlan,
} from "../app/shipmentMaterialPlanHelpers";
import { shipmentOrderItemWeekKey } from "../utils/shipmentUtils";

function formatShipmentTableItemLabel(item, sectionName) {
  const raw = stripPlanItemMeta(String(item || "")).trim();
  if (!raw) return "";
  if (
    String(sectionName || "").trim().toLowerCase() === "обвязка"
    || /^\d{3,4}_\d{2,3}$/.test(raw)
  ) {
    const sizeMatch = raw.match(/^(\d{3,4}_\d{2,3})$/);
    if (sizeMatch) return `Обвязка (${sizeMatch[1]})`;
  }
  return raw;
}

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
  furnitureCustomTemplates,
  warehouseRows,
}) {
  const shipmentTableRows = useMemo(() => {
    if (view !== "shipment" && view !== "warehouse") return [];
    const n = (v) => (typeof normalizeFurnitureKey === "function" ? normalizeFurnitureKey(v) : String(v || "").toLowerCase().trim());
    const templates = Array.isArray(furnitureCustomTemplates) ? furnitureCustomTemplates : [];
    const resolveSheets = ({
      itemName,
      sectionName,
      materialName,
      qty,
      articleCode,
    }) => {
      const rawItem = stripPlanItemMeta(String(itemName || "")).trim();
      if (!rawItem) return { sheets: 0, outputPerSheet: 0 };
      const primary = resolvePlanItemSheets({
        itemName: rawItem,
        sectionName,
        materialName,
        qty,
        articleCode,
        templates,
        normalizeKey: n,
      });
      if (primary.sheets > 0) return primary;
      const materialKey = n(materialName);
      if (materialKey) {
        const parts = rawItem.split(".").map((x) => String(x || "").trim()).filter(Boolean);
        if (parts.length >= 2 && n(parts[parts.length - 1]) === materialKey) {
          return resolvePlanItemSheets({
            itemName: parts.slice(0, -1).join(". "),
            sectionName,
            materialName,
            qty,
            articleCode,
            templates,
            normalizeKey: n,
          });
        }
      }
      return { sheets: 0, outputPerSheet: 0 };
    };
    const rowsFlat = [];
    shipmentRenderSections.forEach((section) => {
      (section.items || []).forEach((it) => {
        visibleCellsForItem(it).forEach((c) => {
          const sourceRow = it.sourceRowId != null ? String(it.sourceRowId) : String(it.row);
          const sourceCol = c.sourceColId != null ? String(c.sourceColId) : String(c.col);
          const stageKey = getShipmentStageKey(c, sourceRow, shipmentOrderMaps, it.item, it.material);
          const sourceItem = String(it.item || "");
          const week = c.week || "-";
          const relatedOrder =
            shipmentOrderMaps?.byRowWeek?.get(shipmentOrderKey(sourceRow, week)) ||
            shipmentOrderMaps?.byItemWeek?.get(shipmentOrderItemWeekKey(sourceItem, week, it.material || "")) ||
            shipmentOrderMaps?.byItemWeek?.get(shipmentOrderItemWeekKey(sourceItem, week)) ||
            null;
          const displayBg = stageBg(stageKey, c.bg || "#ffffff");
          const qty = Number(c.qty || 0);
          const sheetsRaw = ceilWholeSheets(c.sheetsNeeded || 0);
          const outputRaw = Number(c.outputPerSheet || 0);
          const productArticle = String(
            it.productArticle || it.article_code || it.articleCode || it.article || it.mapped_article_code || it.mappedArticleCode || "",
          ).trim() || extractPlanItemArticle(it.item);
          const fallback =
            !(sheetsRaw > 0) && !(outputRaw > 0)
              ? resolveSheets({
                  itemName: it.item,
                  sectionName: section.name,
                  materialName: it.material || "",
                  qty,
                  articleCode: productArticle,
                })
              : { sheets: 0, outputPerSheet: 0 };
          const outputPerSheet = outputRaw > 0 ? outputRaw : Number(fallback.outputPerSheet || 0);
          const sheets =
            sheetsRaw > 0
              ? sheetsRaw
              : fallback.sheets > 0
                ? fallback.sheets
                : outputPerSheet > 0 && qty > 0
                  ? ceilWholeSheets(qty / outputPerSheet)
                  : 0;
          rowsFlat.push({
            key: `${sourceRow}-${sourceCol}`,
            section: section.name,
            sourceItem,
            item: formatShipmentTableItemLabel(it.item, section.name),
            orderId: String(relatedOrder?.orderId || relatedOrder?.order_id || "").trim(),
            productArticle,
            strapProduct: String(it.strapProduct || ""),
            material: it.material || "",
            week,
            qty,
            sheets,
            outputPerSheet,
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
    return applyLoftPairedSheetAdjustment(rowsFlat, { templates, normalizeKey: n });
  }, [
    view,
    shipmentRenderSections,
    shipmentOrderMaps,
    visibleCellsForItem,
    getShipmentStageKey,
    stageBg,
    stageLabel,
    normalizeFurnitureKey,
    furnitureCustomTemplates,
  ]);

  /** Сумма листов по материалу из таблицы склада (те же строки, что «Листов в наличии»). */
  const warehouseSheetsByMaterialKey = useMemo(() => {
    const map = new Map();
    const rows = Array.isArray(warehouseRows) ? warehouseRows : [];
    rows.forEach((r) => {
      const raw = String(r?.material ?? r?.Material ?? "").trim();
      if (!raw) return;
      const key =
        typeof normalizeFurnitureKey === "function" ? normalizeFurnitureKey(raw) : raw.toLowerCase().trim();
      if (!key) return;
      const qty = Number(r?.qty_sheets ?? r?.qtySheets ?? 0) || 0;
      map.set(key, (map.get(key) || 0) + qty);
    });
    return map;
  }, [warehouseRows, normalizeFurnitureKey]);

  const shipmentMaterialBalance = useMemo(() => {
    const byMaterial = new Map();
    shipmentTableRows.forEach((row) => {
      // Count only rows that are truly waiting to be launched.
      if (row.stageKey !== "awaiting") return;
      const material = String(row.material || "Материал не указан").trim();
      const key = normalizeFurnitureKey(material);
      const needed = Number(row.sheets || 0);
      const fromCell = Number(row.availableSheets || 0);
      const fromWarehouse = Number(warehouseSheetsByMaterialKey.get(key) || 0);
      const available = Math.max(fromCell, fromWarehouse);
      if (!byMaterial.has(key)) byMaterial.set(key, { material, needed: 0, available: 0 });
      const bucket = byMaterial.get(key);
      bucket.needed += needed;
      bucket.available = Math.max(bucket.available, available);
    });
    return byMaterial;
  }, [shipmentTableRows, normalizeFurnitureKey, warehouseSheetsByMaterialKey]);

  const shipmentTableRowsWithStockStatus = useMemo(
    () => annotateRowsWithMaterialCoverage(shipmentTableRows, shipmentMaterialBalance, normalizeFurnitureKey),
    [shipmentTableRows, shipmentMaterialBalance, normalizeFurnitureKey],
  );

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

  const shipmentMaterialPlan = useMemo(
    () => buildShipmentMaterialPlan(shipmentTableRowsWithStockStatus, shipmentMaterialBalance, normalizeFurnitureKey),
    [shipmentTableRowsWithStockStatus, shipmentMaterialBalance, normalizeFurnitureKey],
  );

  const shipmentPlanDeficits = useMemo(
    () => shipmentMaterialPlan.filter((x) => x.deficit > 0),
    [shipmentMaterialPlan],
  );

  return {
    shipmentTableRows,
    shipmentMaterialBalance,
    shipmentTableRowsWithStockStatus,
    shipmentTableGroupNames,
    visibleShipmentTableRows,
    shipmentMaterialPlan,
    shipmentPlanDeficits,
  };
}
