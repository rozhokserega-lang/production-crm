import { useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { OrderService } from "../services/orderService";
import {
  extractErrorMessage,
  toUserError,
} from "../app/errorCatalogHelpers";
import {
  embedPlanItemArticle,
} from "../app/orderHelpers";
import {
  formatMetalImportError,
  getMetalImportNoValidRowsError,
  parseMetalImportRows,
} from "../app/metalImportHelpers";
import { normalizeFurnitureKey } from "../utils/furnitureUtils";

/**
 * Actions for furniture and shelf plan orders, and metal stock import.
 */
export function useFurnitureActions({
  canOperateProduction,
  denyActionByRole,
  setActionLoading,
  setError,
  load,
  sectionArticleRows,
  syncPlanCellToGoogleSheet,
  loadMetalStock,
}) {
  const importMetalFileRef = useRef(null);

  const createShelfPlanOrder = useCallback(async (payload) => {
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для изменения плана.");
      return;
    }
    const week = String(payload?.week || "").trim();
    const item = String(payload?.item || "").trim();
    const article = String(payload?.article || "").trim();
    const material = String(payload?.material || "").trim();
    const qty = Number(payload?.qty || 0);
    const qrQty = Number(payload?.qrQty || 0);
    if (!week) {
      setError("Укажите номер плана.");
      return;
    }
    if (!item || !material || !(qty > 0)) {
      setError("Заполните поля заказа полок: изделие, материал и количество.");
      return;
    }
    setActionLoading("shelf:create-plan");
    setError("");
    try {
      const request = {
        sectionName: "Система хранения",
        item: embedPlanItemArticle(item, article, qrQty),
        material,
        week,
        qty,
        article,
      };
      await OrderService.createShipmentPlanCell(request);
      void syncPlanCellToGoogleSheet(request);
      await load();
    } catch (e) {
      setError(toUserError(e));
      throw e;
    } finally {
      setActionLoading("");
    }
  }, [canOperateProduction, setActionLoading, setError, load, denyActionByRole, syncPlanCellToGoogleSheet]);

  const createFurniturePlanOrder = useCallback(async (payload) => {
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для изменения плана.");
      return;
    }
    const week = String(payload?.week || "").trim();
    const item = String(payload?.item || "").trim();
    const article = String(payload?.article || "").trim();
    const material = String(payload?.material || "").trim();
    const qty = Number(payload?.qty || 0);
    const qrQty = Number(payload?.qrQty || 0);
    if (!week) {
      setError("Укажите номер плана.");
      return;
    }
    if (!item || !material || !(qty > 0)) {
      setError("Заполните поля заказа: изделие, материал и количество.");
      return;
    }
    setActionLoading("furniture:create-plan");
    setError("");
    try {
      const norm = (v) => normalizeFurnitureKey(v);
      const itemKey = norm(item);
      const materialKey = norm(material);
      const resolvedArticle = article || String(
        (Array.isArray(sectionArticleRows) ? sectionArticleRows : []).find((row) => {
          const sectionName = String(row?.section_name || row?.sectionName || "").trim();
          const sectionKey = norm(sectionName);
          if (!(sectionKey.includes("основная") && sectionKey.includes("мебел"))) return false;
          const itemName = String(row?.item_name || row?.itemName || "").trim();
          const itemRowKey = norm(itemName);
          if (!(itemRowKey && (itemKey === itemRowKey || itemKey.includes(itemRowKey) || itemRowKey.includes(itemKey)))) {
            return false;
          }
          const rowMaterial = String(row?.material || row?.table_color || row?.tableColor || "").trim();
          const rowMaterialKey = norm(rowMaterial);
          if (!materialKey || !rowMaterialKey) return true;
          return materialKey === rowMaterialKey || materialKey.includes(rowMaterialKey) || rowMaterialKey.includes(materialKey);
        })?.article || ""
      ).trim();
      const request = {
        sectionName: "Основная мебель",
        item: embedPlanItemArticle(item, resolvedArticle, qrQty),
        material,
        week,
        qty,
        article: resolvedArticle,
      };
      await OrderService.createShipmentPlanCell(request);
      void syncPlanCellToGoogleSheet(request);
      await load();
    } catch (e) {
      setError(toUserError(e));
      throw e;
    } finally {
      setActionLoading("");
    }
  }, [
    canOperateProduction,
    setActionLoading,
    setError,
    load,
    denyActionByRole,
    syncPlanCellToGoogleSheet,
    sectionArticleRows,
  ]);

  const importMetalFromExcelFile = useCallback(async (file) => {
    if (!file) return;
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для импорта остатков металла.");
      return;
    }
    setActionLoading("metal:import");
    setError("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const firstSheet = String(wb?.SheetNames?.[0] || "");
      if (!firstSheet) throw new Error("В файле не найден лист.");
      const ws = wb.Sheets[firstSheet];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
      if (!rows.length) throw new Error("Файл пустой.");

      const importedRows = parseMetalImportRows(rows);
      if (!importedRows.length) {
        throw new Error(getMetalImportNoValidRowsError());
      }

      for (const row of importedRows) {
        await OrderService.setMetalStock(row.metalArticle, row.metalName, row.qtyAvailable);
      }

      await loadMetalStock();
      setError(`Импортировано позиций металла: ${importedRows.length}.`);
    } catch (e) {
      setError(formatMetalImportError(extractErrorMessage(e)));
    } finally {
      setActionLoading("");
      if (importMetalFileRef.current) importMetalFileRef.current.value = "";
    }
  }, [canOperateProduction, setActionLoading, setError, loadMetalStock, importMetalFileRef, denyActionByRole]);

  return {
    importMetalFileRef,
    createShelfPlanOrder,
    createFurniturePlanOrder,
    importMetalFromExcelFile,
  };
}
