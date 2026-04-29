import { useCallback, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { OrderService } from "../services/orderService";
import {
  extractErrorMessage,
  toUserError,
} from "../app/errorCatalogHelpers";
import {
  isShipmentCellMissingError,
} from "../app/rowHelpers";
import {
  buildShipmentCellAttempts,
  runShipmentCellActionWithFallback,
} from "../app/shipmentActionHelpers";
import {
  buildShipmentExportRows,
  applyImportPlanRows,
  buildImportArticleMap,
  formatImportShipmentPartialError,
  formatShipmentImportError,
  formatShipmentExportPartialError,
  getImportPlanNoValidRowsError,
  getShipmentExportNoArticlesError,
  loadImportCatalogRows,
  parseImportPlanRows,
} from "../app/shipmentExportHelpers";
import {
  buildStrapPreviewPlans,
} from "../app/shipmentDialogHelpers";
import {
  buildShipmentPreviewPlans,
  enrichPreviewFromFurniture,
  enrichPreviewWithStrapProduct,
} from "../app/shipmentPreviewHelpers";
import {
  buildPreviewRowsFromFurnitureTemplate,
  formatDateTimeForPrint,
} from "../app/appUtils";
import {
  canonicalStrapProductName,
  extractDetailSizeToken,
  isStrapVirtualRowId,
  normalizeFurnitureKey,
  normalizeStrapProductKey,
} from "../utils/furnitureUtils";
import {
  getPlanPreviewArticleCode,
  extractPlanItemArticle,
} from "../app/orderHelpers";
import {
  resolvePlanPreviewArticleByName,
} from "../app/planPreviewHelpers";

/**
 * Действия с выбранными ячейками отгрузки:
 * - отправить в работу
 * - удалить из плана
 * - переключить выбор
 * - предпросмотр плана
 * - экспорт / импорт Excel
 */
export function useShipmentActions({
  canOperateProduction,
  canManageOrders,
  denyActionByRole,
  selectedShipments,
  setSelectedShipments,
  setPlanPreviews,
  setActionLoading,
  setError,
  load,
  view,
  loadMetalQueue,
  selectedShipmentMetal,
  sectionArticleRows,
  articleLookupByItemKey,
  furnitureTemplates,
  furnitureLoading,
  furnitureError,
  resolveFurnitureTemplateForPreviewByArticle,
  strapProductBySizeToken,
  strapProductsByArticleCode,
  strapTargetProduct,
}) {
  const selectedShipmentsRef = useRef(selectedShipments);
  const importPlanFileRef = useRef(null);
  useEffect(() => {
    selectedShipmentsRef.current = selectedShipments;
  }, [selectedShipments]);
  const sendSelectedShipmentToWork = useCallback(async () => {
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для отправки заказов в работу.");
      return;
    }
    const current = selectedShipmentsRef.current;
    if (!current.length) return;
    const sendable = current.filter((s) => !!s.canSendToWork);
    if (!sendable.length) {
      setError("Среди выбранных ячеек нет доступных для отправки в работу.");
      return;
    }
    setActionLoading("shipment:bulk");
    setError("");
    try {
      const metalDeficits = (selectedShipmentMetal.rows || []).filter((x) => Number(x.deficitQty || 0) > 0);
      const hasMetalDeficit = metalDeficits.length > 0;
      if (hasMetalDeficit) {
        for (const s of sendable) {
          await OrderService.enqueueMetalWorkOrder({
            sourceRow: s.row,
            sourceCol: s.col,
            item: s.item,
            week: s.week,
            qty: Number(s.qty || 0),
            reason: "Нехватка металла при отправке в работу",
            shortage: metalDeficits.map((d) => ({
              metalArticle: d.metalArticle,
              metalName: d.metalName,
              deficitQty: d.deficitQty,
              neededQty: d.neededQty,
              qtyAvailable: d.qtyAvailable,
            })),
          });
        }
      }
      for (const s of sendable) {
        const attempts = buildShipmentCellAttempts(s);
        await runShipmentCellActionWithFallback({
          actionFn: (params) => OrderService.sendShipmentToWork(params.row, params.col),
          attempts,
          isMissingError: isShipmentCellMissingError,
          requestBuilder: (p) => ({ row: p.row, col: p.col }),
        });
      }
      setPlanPreviews([]);
      setSelectedShipments([]);
      await load();
      if (hasMetalDeficit) {
        setError("Заказы отправлены в работу. Позиции по нехватке металла добавлены в очередь 'Металл в работу'.");
        if (view === "metal") {
          await loadMetalQueue();
        }
      }
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setActionLoading("");
    }
  }, [canOperateProduction, selectedShipmentMetal, setActionLoading, setError, setPlanPreviews, setSelectedShipments, load, view, loadMetalQueue, denyActionByRole]);

  const deleteSelectedShipmentPlan = useCallback(async () => {
    if (!canManageOrders) {
      denyActionByRole("Недостаточно прав для удаления позиций из плана.");
      return;
    }
    const current = selectedShipmentsRef.current;
    if (!current.length) return;
    const deletable = current.filter((s) => !!s.canSendToWork);
    if (!deletable.length) {
      setError("Среди выбранных ячеек нет доступных для удаления из плана.");
      return;
    }
    const ok = window.confirm(`Удалить ${deletable.length} поз. из плана? Это действие необратимо.`);
    if (!ok) return;
    setActionLoading("shipment:delete");
    setError("");
    try {
      for (const s of deletable) {
        const attempts = buildShipmentCellAttempts(s);
        await runShipmentCellActionWithFallback({
          actionFn: (params) => OrderService.deleteShipmentPlanCell({ p_row: params.p_row, p_col: params.p_col, row: params.p_row, col: params.p_col }),
          attempts,
          isMissingError: isShipmentCellMissingError,
          requestBuilder: (p) => ({ p_row: p.row, p_col: p.col }),
        });
      }
      setPlanPreviews([]);
      setSelectedShipments([]);
      await load();
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setActionLoading("");
    }
  }, [canManageOrders, setActionLoading, setError, setPlanPreviews, setSelectedShipments, load, denyActionByRole]);

  const toggleShipmentSelection = useCallback((payload) => {
    setSelectedShipments((prev) => {
      const exists = prev.some((s) => s.row === payload.row && s.col === payload.col);
      if (exists) return prev.filter((s) => !(s.row === payload.row && s.col === payload.col));
      return [...prev, payload];
    });
  }, [setSelectedShipments]);

  const previewSelectedShipmentPlan = useCallback(async () => {
    const current = selectedShipmentsRef.current;
    if (!current.length) return;
    const strapSelections = current.filter((s) => isStrapVirtualRowId(s.row));
    const shipmentSelections = current.filter((s) => !isStrapVirtualRowId(s.row));
    setActionLoading("preview:batch");
    setError("");
    try {
      const generatedAt = formatDateTimeForPrint(new Date());
      const strapPreviews = buildStrapPreviewPlans(strapSelections, generatedAt);
      let shipmentTableBySource = new Map();
      try {
        const tableRows = await OrderService.getShipmentTable();
        const list = Array.isArray(tableRows) ? tableRows : [];
        shipmentTableBySource = new Map(
          list.map((row) => [
            `${String(row?.source_row_id || row?.sourceRowId || "").trim()}|${String(row?.source_col_id || row?.sourceColId || "").trim()}`,
            row,
          ]),
        );
      } catch (_) {
        shipmentTableBySource = new Map();
      }
      const enrichPreview = (preview, shipmentRow) => {
        const withFurniture = enrichPreviewFromFurniture(preview, {
          furnitureTemplates,
          resolveFurnitureTemplateForPreview: resolveFurnitureTemplateForPreviewByArticle,
          buildPreviewRowsFromFurnitureTemplate,
          normalizeFurnitureKey,
          furnitureLoading,
          furnitureError,
        });
        const withStrapProduct = enrichPreviewWithStrapProduct(withFurniture, shipmentRow, {
          canonicalStrapProductName,
          normalizeFurnitureKey,
          getPlanPreviewArticleCode,
          resolvePlanPreviewArticleByName,
          articleLookupByItemKey,
          strapProductsByArticleCode,
          normalizeStrapProductKey,
          extractDetailSizeToken,
          strapProductBySizeToken,
          strapTargetProduct,
        });
        const sourceKey = `${String(shipmentRow?.row || "").trim()}|${String(shipmentRow?.col || "").trim()}`;
        const sourceRowFromTable = shipmentTableBySource.get(sourceKey) || null;
        const articleFromTable = String(
          sourceRowFromTable?.product_article ||
            sourceRowFromTable?.productArticle ||
          sourceRowFromTable?.article_code ||
            sourceRowFromTable?.articleCode ||
            sourceRowFromTable?.article ||
            sourceRowFromTable?.mapped_article_code ||
            sourceRowFromTable?.mappedArticleCode ||
            "",
        ).trim();
        const explicitArticle = String(
          shipmentRow?.productArticle ||
            extractPlanItemArticle(shipmentRow?.sourceItem || shipmentRow?.item || "") ||
            articleFromTable ||
            extractPlanItemArticle(sourceRowFromTable?.item || "") ||
            "",
        ).trim();
        if (!explicitArticle) return withStrapProduct;
        if (getPlanPreviewArticleCode(withStrapProduct)) return withStrapProduct;
        return { ...withStrapProduct, article: explicitArticle };
      };
      if (shipmentSelections.length === 0) {
        setPlanPreviews(strapPreviews);
        return;
      }
      if (shipmentSelections.length === 1) {
        const s = shipmentSelections[0];
        const preview = await OrderService.previewPlanFromShipment(s.row, s.col);
        const enriched = preview ? enrichPreview({ ...preview, _key: `${s.row}-${s.col}` }, s) : null;
        const plans = enriched ? [enriched] : [];
        plans.push(...strapPreviews);
        setPlanPreviews(plans);
      } else {
        const { plans = [], failedCount = 0, batchError } = await buildShipmentPreviewPlans(shipmentSelections, {
          enrichPreview,
        });
        if (failedCount > 0) {
          setError(
            `Часть предпросмотров не построена (${failedCount} шт). ` +
            `Причина: ${extractErrorMessage(batchError)}`
          );
        }
        if (!plans.length && strapPreviews.length === 0) {
          throw new Error("Не удалось построить предпросмотр ни для одной выбранной позиции.");
        }
        plans.push(...strapPreviews);
        setPlanPreviews(plans);
      }
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setActionLoading("");
    }
  }, [
    articleLookupByItemKey,
    furnitureError,
    furnitureLoading,
    furnitureTemplates,
    resolveFurnitureTemplateForPreviewByArticle,
    setActionLoading,
    setError,
    setPlanPreviews,
    strapProductBySizeToken,
    strapProductsByArticleCode,
    strapTargetProduct,
  ]);

  const exportSelectedShipmentToExcel = useCallback(() => {
    const current = selectedShipmentsRef.current;
    if (!current.length) return;
    const planNumberRaw = window.prompt("Введите номер плана для экспорта:", String(current[0]?.week || ""));
    if (planNumberRaw == null) return;
    const planNumber = String(planNumberRaw || "").trim();
    if (!planNumber) {
      setError("Укажите номер плана.");
      return;
    }
    const { rows, missingItems } = buildShipmentExportRows(current, {
      articleLookupByItemKey,
      normalizeItemKey: normalizeFurnitureKey,
    });
    if (!rows.length) {
      setError(getShipmentExportNoArticlesError());
      return;
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "План");
    XLSX.writeFile(wb, `План_${planNumber}.xlsx`);
    if (missingItems.length > 0) {
      setError(formatShipmentExportPartialError(missingItems.length));
    } else {
      setError("");
    }
  }, [articleLookupByItemKey, setError]);

  const importShipmentPlanFromExcelFile = useCallback(async (file) => {
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для импорта плана.");
      return;
    }
    if (!file) return;
    const planNumberRaw = window.prompt("Введите номер плана для импорта:", "");
    if (planNumberRaw == null) return;
    const planNumber = String(planNumberRaw || "").trim();
    if (!planNumber) {
      setError("Укажите номер плана.");
      return;
    }
    setActionLoading("shipment:import");
    setError("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const firstSheet = String(wb?.SheetNames?.[0] || "");
      if (!firstSheet) throw new Error("В файле не найден лист.");
      const ws = wb.Sheets[firstSheet];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
      const importRows = parseImportPlanRows(rows);
      if (!importRows.length) {
        throw new Error(getImportPlanNoValidRowsError());
      }
      const importCatalogRows = await loadImportCatalogRows({ sectionArticleRows });
      const articleMap = buildImportArticleMap(importCatalogRows);
      const { imported, missing, marked } = await applyImportPlanRows(importRows, articleMap, {
        planNumber,
        markMissingAsPlanRows: true,
      });
      await load();
      if (missing.length > 0) {
        setError(formatImportShipmentPartialError(imported, missing, marked));
      }
    } catch (e) {
      setError(formatShipmentImportError(extractErrorMessage(e)));
    } finally {
      setActionLoading("");
      if (importPlanFileRef.current) importPlanFileRef.current.value = "";
    }
  }, [canOperateProduction, sectionArticleRows, setActionLoading, setError, load, importPlanFileRef, denyActionByRole]);

  return {
    importPlanFileRef,
    sendSelectedShipmentToWork,
    deleteSelectedShipmentPlan,
    toggleShipmentSelection,
    previewSelectedShipmentPlan,
    exportSelectedShipmentToExcel,
    importShipmentPlanFromExcelFile,
  };
}
