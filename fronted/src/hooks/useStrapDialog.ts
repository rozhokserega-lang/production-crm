import { useCallback } from "react";
import { OrderService } from "../services/orderService";
import { STRAP_OPTIONS } from "../app/appConstants";
import {
  buildStrapDialogInit,
  buildStrapPlanCellPayload,
  buildStrapPlanRows,
} from "../app/shipmentDialogHelpers";
import { toUserError } from "../app/errorCatalogHelpers";

interface StrapItem {
  name?: string;
  qty?: number;
  productName?: string;
}

interface StrapOptionGroup {
  productName: string;
  options: string[];
}

interface UseStrapDialogParams {
  canOperateProduction: boolean;
  denyActionByRole: (msg: string) => void;
  setError: (msg: string) => void;
  setActionLoading: (v: string) => void;
  setStrapDialogOpen: (v: boolean) => void;
  setStrapTargetProduct: (v: string) => void;
  setStrapPlanWeek: (v: string) => void;
  setStrapDraft: (v: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  setStrapItems: (v: unknown[]) => void;
  strapItems: unknown[];
  strapProductNames: string[];
  weekFilter: string;
  weeks: string[];
  strapOptionsByProduct: StrapOptionGroup[];
  strapTargetProduct: string;
  strapPlanWeek: string;
  strapDraft: Record<string, string>;
  strapOptionsForSelectedProduct: string[];
  resolveStrapMaterialByProduct: (productName: string) => string;
  strapNameToOrderItem: (name: string) => string;
  normalizeStrapProductKey: (v: string) => string;
  syncPlanCellToGoogleSheet: (params: Record<string, unknown>) => Promise<void>;
  load: () => Promise<void>;
}

interface UseStrapDialogReturn {
  openStrapDialog: () => void;
  saveStrapDialog: () => Promise<void>;
}

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
}: UseStrapDialogParams): UseStrapDialogReturn {
  const openStrapDialog = useCallback(() => {
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для добавления обвязки.");
      return;
    }
    const init = buildStrapDialogInit({
      strapItems: strapItems as StrapItem[],
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
