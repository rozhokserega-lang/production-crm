import { useCallback, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { OrderService } from "../services/orderService";
import {
  extractErrorMessage,
  toUserError,
} from "../app/errorCatalogHelpers";
import {
  isShipmentCellMissingError,
  normalizeOrder,
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
  attachOrderIdToPlans,
  createShipmentPlanPreviewEnricher,
  loadShipmentTableBySourceMap,
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
  buildCuttingPlanFromSelection,
} from "../app/cuttingPlanAlgorithm";
import { isStorageLikeName } from "../utils/shipmentUtils";
import { extractStrapTargetProduct } from "../app/orderHelpers";

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
  setCuttingPlan,
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
  productionRows = [],
  openSendToWorkDialog,
}) {
  const withTimeout = useCallback((promise, ms, label) => {
    const timeoutMs = Math.max(0, Number(ms || 0));
    if (!timeoutMs) return promise;
    let timer = null;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Таймаут: ${String(label || "операция")} (${timeoutMs}мс).`));
      }, timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }, []);

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
    const sentResults = [];
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
        const orderRaw = await runShipmentCellActionWithFallback({
          actionFn: (params) => OrderService.sendShipmentToWork(params.row, params.col),
          attempts,
          isMissingError: isShipmentCellMissingError,
          requestBuilder: (p) => ({ row: p.row, col: p.col }),
        });
        const order = normalizeOrder(orderRaw) || orderRaw;
        sentResults.push({ selection: s, order });
      }
      setPlanPreviews([]);
      setSelectedShipments([]);
      await load();
      if (typeof openSendToWorkDialog === "function" && sentResults.length) {
        await openSendToWorkDialog(sentResults);
      }
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
  }, [canOperateProduction, selectedShipmentMetal, setActionLoading, setError, setPlanPreviews, setSelectedShipments, load, view, loadMetalQueue, denyActionByRole, openSendToWorkDialog]);

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

  const revertSelectedShipmentToAwaiting = useCallback(async () => {
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для возврата позиций в ожидание.");
      return;
    }
    const current = selectedShipmentsRef.current;
    if (!current.length) return;
    const revertible = current.filter((s) => String(s.stageKey || "") === "on_pilka_wait");
    if (!revertible.length) {
      setError("Среди выбранных ячеек нет позиций «На пиле (ожидает запуск)».");
      return;
    }
    const ok = window.confirm(
      `Вернуть ${revertible.length} поз. в «Ожидаю заказ»? Доступно только пока пила ещё не начала резать.`,
    );
    if (!ok) return;
    setActionLoading("shipment:revert");
    setError("");
    try {
      for (const s of revertible) {
        const attempts = buildShipmentCellAttempts(s);
        await runShipmentCellActionWithFallback({
          actionFn: (params) => OrderService.revertShipmentToAwaiting(params.row, params.col),
          attempts,
          isMissingError: isShipmentCellMissingError,
          requestBuilder: (p) => ({ row: p.row, col: p.col }),
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
  }, [canOperateProduction, setActionLoading, setError, setPlanPreviews, setSelectedShipments, load, denyActionByRole]);

  const splitSelectedShipmentPlan = useCallback(
    async (selection, { qtyKeep, targetWeek, qtyMove }) => {
      if (!canManageOrders) {
        denyActionByRole("Недостаточно прав для разделения позиции плана.");
        return false;
      }
      if (!selection || !selection.canSendToWork) {
        setError("Позиция недоступна для разделения.");
        return false;
      }
      setActionLoading("shipment:split");
      setError("");
      try {
        const attempts = buildShipmentCellAttempts(selection);
        await runShipmentCellActionWithFallback({
          actionFn: (params) =>
            OrderService.splitShipmentPlanCell({
              row: params.p_row,
              col: params.p_col,
              qtyKeep,
              targetWeek,
              qtyMove,
            }),
          attempts,
          isMissingError: isShipmentCellMissingError,
          requestBuilder: (p) => ({ p_row: p.row, p_col: p.col }),
        });
        setPlanPreviews([]);
        setSelectedShipments([]);
        await load();
        return true;
      } catch (e) {
        setError(toUserError(e));
        return false;
      } finally {
        setActionLoading("");
      }
    },
    [
      canManageOrders,
      setActionLoading,
      setError,
      setPlanPreviews,
      setSelectedShipments,
      load,
      denyActionByRole,
    ],
  );

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
    try {
      if (import.meta?.env?.DEV) console.info("[CRM PREVIEW] start", { count: current.length });
    } catch (_) {
      // ignore
    }
    setActionLoading("preview:batch");
    setError("");
    try {
      const generatedAt = formatDateTimeForPrint(new Date());
      const strapPreviews = buildStrapPreviewPlans(strapSelections, generatedAt);
      const shipmentTableBySource = await withTimeout(
        loadShipmentTableBySourceMap(),
        20000,
        "загрузка таблицы отгрузки",
      );
      let productionRowsForPreview = Array.isArray(productionRows) ? productionRows : [];
      try {
        const freshOrders = await withTimeout(
          OrderService.getAllOrders(),
          20000,
          "загрузка списка заказов",
        );
        productionRowsForPreview = Array.isArray(freshOrders)
          ? freshOrders.map(normalizeOrder)
          : productionRowsForPreview;
      } catch (_) {
        // keep cached rows
      }
      const enrichPreview = createShipmentPlanPreviewEnricher({
        shipmentTableBySource,
        productionRows: productionRowsForPreview,
        furnitureTemplates,
        resolveFurnitureTemplateForPreview: resolveFurnitureTemplateForPreviewByArticle,
        buildPreviewRowsFromFurnitureTemplate,
        normalizeFurnitureKey,
        furnitureLoading,
        furnitureError,
        canonicalStrapProductName,
        articleLookupByItemKey,
        strapProductsByArticleCode,
        normalizeStrapProductKey,
        extractDetailSizeToken,
        strapProductBySizeToken,
        strapTargetProduct,
        extractStrapTargetProduct,
      });
      if (shipmentSelections.length === 0) {
        setPlanPreviews(strapPreviews);
        return;
      }
      if (shipmentSelections.length === 1) {
        const s = shipmentSelections[0];
        try {
          if (import.meta?.env?.DEV) {
            console.info("[CRM PREVIEW] selection", {
              row: String(s?.row ?? ""),
              col: String(s?.col ?? ""),
              week: String(s?.week ?? ""),
              item: String(s?.item ?? ""),
              section: String(s?.section ?? ""),
            });
          }
        } catch (_) {
          // ignore
        }
        const preview = await withTimeout(
          OrderService.previewPlanFromShipment(s.row, s.col),
          20000,
          "предпросмотр плана",
        );
        if (!preview) {
          throw new Error(`Не удалось построить предпросмотр (row=${String(s.row || "")}, col=${String(s.col || "")}).`);
        }
        const enriched = preview ? enrichPreview({ ...preview, _key: `${s.row}-${s.col}` }, s) : null;
        const plans = attachOrderIdToPlans(
          enriched ? [enriched] : [],
          [],
          productionRowsForPreview,
        );
        plans.push(...strapPreviews);
        setPlanPreviews(plans);
      } else {
        const { plans = [], failedCount = 0, batchError } = await withTimeout(
          buildShipmentPreviewPlans(shipmentSelections, { enrichPreview }),
          30000,
          "предпросмотр планов (пакет)",
        );
        const plansWithOrders = attachOrderIdToPlans(plans, [], productionRowsForPreview);
        if (failedCount > 0) {
          setError(
            `Часть предпросмотров не построена (${failedCount} шт). ` +
            `Причина: ${extractErrorMessage(batchError)}`
          );
        }
        if (!plansWithOrders.length && strapPreviews.length === 0) {
          throw new Error("Не удалось построить предпросмотр ни для одной выбранной позиции.");
        }
        plansWithOrders.push(...strapPreviews);
        setPlanPreviews(plansWithOrders);
      }
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setActionLoading("");
      try {
        if (import.meta?.env?.DEV) console.info("[CRM PREVIEW] end");
      } catch (_) {
        // ignore
      }
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
    productionRows,
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

  const generateCuttingPlan = useCallback(() => {
    const storageItems = selectedShipments.filter(
      (s) => isStorageLikeName(s.item) || isStorageLikeName(s.section),
    );
    if (storageItems.length === 0) {
      setError("В выборке нет позиций «Система хранения» с распознанными размерами.");
      return;
    }
    const plan = buildCuttingPlanFromSelection(storageItems);
    if (plan.materialGroups.length === 0) {
      setError("Не удалось определить размеры ни для одной из выбранных позиций.");
      return;
    }
    setError("");
    setCuttingPlan(plan);
  }, [selectedShipments, setError, setCuttingPlan]);

  return {
    importPlanFileRef,
    sendSelectedShipmentToWork,
    deleteSelectedShipmentPlan,
    revertSelectedShipmentToAwaiting,
    splitSelectedShipmentPlan,
    toggleShipmentSelection,
    previewSelectedShipmentPlan,
    exportSelectedShipmentToExcel,
    importShipmentPlanFromExcelFile,
    generateCuttingPlan,
  };
}
