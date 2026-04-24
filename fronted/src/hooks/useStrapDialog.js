import { useCallback } from "react";
import { OrderService } from "../services/orderService";
import { STRAP_OPTIONS } from "../app/appConstants";
import {
  buildStrapDialogInit,
  buildStrapPlanCellPayload,
  buildStrapPlanRows,
} from "../app/shipmentDialogHelpers";
import { toUserError } from "../app/errorCatalogHelpers";

/**
 * Encapsulates strap dialog logic: open and save.
 *
 * @param {object} params
 * @param {boolean} params.canOperateProduction
 * @param {Function} params.denyActionByRole
 * @param {Function} params.setError
 * @param {Function} params.setActionLoading
 * @param {Function} params.setStrapDialogOpen
 * @param {Function} params.setStrapTargetProduct
 * @param {Function} params.setStrapPlanWeek
 * @param {Function} params.setStrapDraft
 * @param {Function} params.setStrapItems
 * @param {Array} params.strapItems
 * @param {Array} params.strapProductNames
 * @param {string} params.weekFilter
 * @param {Array} params.weeks
 * @param {object} params.strapOptionsByProduct
 * @param {string} params.strapTargetProduct
 * @param {string} params.strapPlanWeek
 * @param {object} params.strapDraft
 * @param {object} params.strapOptionsForSelectedProduct
 * @param {Function} params.resolveStrapMaterialByProduct
 * @param {Function} params.strapNameToOrderItem
 * @param {Function} params.normalizeStrapProductKey
 * @param {Function} params.syncPlanCellToGoogleSheet
 * @param {Function} params.load
 */
export function useStrapDialog({
  canOperateProduction,
  denyActionByRole,
  setError,
  setActionLoading,
  setStrapDialogOpen,
  setStrapTargetProduct,
  setStrapPlanWeek,
  setStrapDraft,
  setStrapItems,
  strapItems,
  strapProductNames,
  weekFilter,
  weeks,
  strapOptionsByProduct,
  strapTargetProduct,
  strapPlanWeek,
  strapDraft,
  strapOptionsForSelectedProduct,
  resolveStrapMaterialByProduct,
  strapNameToOrderItem,
  normalizeStrapProductKey,
  syncPlanCellToGoogleSheet,
  load,
}) {
  const openStrapDialog = useCallback(() => {
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для добавления обвязки.");
      return;
    }
    const init = buildStrapDialogInit({
      strapItems,
      strapProductNames,
      weekFilter,
      weeks,
      strapOptionsByProduct,
      defaultOptions: STRAP_OPTIONS,
      normalizeProductKey: normalizeStrapProductKey,
    });
    setStrapTargetProduct(init.defaultProduct);
    setStrapPlanWeek(init.defaultWeek);
    setStrapDraft(init.draft);
    setStrapDialogOpen(true);
  }, [
    canOperateProduction,
    denyActionByRole,
    strapItems,
    strapProductNames,
    weekFilter,
    weeks,
    strapOptionsByProduct,
    normalizeStrapProductKey,
    setStrapTargetProduct,
    setStrapPlanWeek,
    setStrapDraft,
    setStrapDialogOpen,
  ]);

  const saveStrapDialog = useCallback(async () => {
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для изменения плана.");
      return;
    }
    const next = buildStrapPlanRows({
      options: strapOptionsForSelectedProduct,
      draft: strapDraft,
      productName: strapTargetProduct || "",
    });
    if (!next.length) {
      setStrapItems([]);
      setStrapDialogOpen(false);
      return;
    }
    const week = String(strapPlanWeek || "").trim();
    if (!week) {
      setError("Укажите неделю плана для обвязки.");
      return;
    }
    setActionLoading("shipment:strapsave");
    setError("");
    try {
      for (const row of next) {
        const payload = buildStrapPlanCellPayload(row, week, {
          resolveStrapMaterialByProduct,
          strapNameToOrderItem,
        });
        await OrderService.createShipmentPlanCell(payload);
        void syncPlanCellToGoogleSheet(payload);
      }
      setStrapItems([]);
      setStrapDialogOpen(false);
      await load();
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setActionLoading("");
    }
  }, [
    canOperateProduction,
    denyActionByRole,
    strapOptionsForSelectedProduct,
    strapDraft,
    strapTargetProduct,
    strapPlanWeek,
    setError,
    setActionLoading,
    setStrapItems,
    setStrapDialogOpen,
    resolveStrapMaterialByProduct,
    strapNameToOrderItem,
    syncPlanCellToGoogleSheet,
    load,
  ]);

  return {
    openStrapDialog,
    saveStrapDialog,
  };
}
