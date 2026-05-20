import { useMemo } from "react";
import { extractPlanItemArticle, stripPlanItemMeta } from "../app/orderHelpers";
import { effectiveOutputPerSheet } from "../app/appUtils";

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
    const resolveKitsPerSheet = (itemName, materialName = "") => {
      const rawItem = stripPlanItemMeta(String(itemName || "")).trim();
      if (!rawItem) return 0;
      const itemKey = n(rawItem);
      const materialKey = n(materialName);
      const list = templates.map((t) => {
        const rawKits = Number(t?.kits_per_sheet ?? t?.kitsPerSheet ?? 0) || 0;
        return {
          name: String(t?.product_name || t?.productName || "").trim(),
          kits: rawKits,
          output: effectiveOutputPerSheet(rawKits),
        };
      });
      const byExact = list.find((x) => n(x.name) === itemKey && x.output > 0);
      if (byExact) return byExact.output;
      const byContains = list.find((x) => {
        const key = n(x.name);
        return key && x.output > 0 && (itemKey.includes(key) || key.includes(itemKey));
      });
      if (byContains) return byContains.output;
      if (materialKey) {
        const parts = rawItem.split(".").map((x) => String(x || "").trim()).filter(Boolean);
        if (parts.length >= 2 && n(parts[parts.length - 1]) === materialKey) {
          const noMaterial = parts.slice(0, -1).join(". ");
          const nm = n(noMaterial);
          const byBase = list.find((x) => n(x.name) === nm && x.output > 0);
          if (byBase) return byBase.output;
        }
      }
      return 0;
    };
    const rowsFlat = [];
    shipmentRenderSections.forEach((section) => {
      (section.items || []).forEach((it) => {
        visibleCellsForItem(it).forEach((c) => {
          const sourceRow = it.sourceRowId != null ? String(it.sourceRowId) : String(it.row);
          const sourceCol = c.sourceColId != null ? String(c.sourceColId) : String(c.col);
          const stageKey = getShipmentStageKey(c, sourceRow, shipmentOrderMaps, it.item);
          const displayBg = stageBg(stageKey, c.bg || "#ffffff");
          const qty = Number(c.qty || 0);
          const sheetsRaw = Number(c.sheetsNeeded || 0);
          const outputRaw = Number(c.outputPerSheet || 0);
          // If backend did not store per-sheet output, try to derive it from constructor templates
          // (kits_per_sheet) using the item name and material.
          const fallbackOutput = !(outputRaw > 0)
            ? resolveKitsPerSheet(it.item, it.material || "")
            : 0;
          const outputPerSheet = outputRaw > 0 ? outputRaw : fallbackOutput;
          const sheets = sheetsRaw > 0
            ? sheetsRaw
            : outputPerSheet > 0 && qty > 0
              ? Math.ceil(qty / outputPerSheet)
              : 0;
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
    return rowsFlat;
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
