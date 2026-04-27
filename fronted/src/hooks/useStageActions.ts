import { useCallback, useRef } from "react";
import { STAGE_SYNC_META } from "../app/appConstants";
import {
  applyOptimisticOrderRow,
  hasOptimisticActionRule,
} from "../app/appUtils";
import {
  buildNotifyPayload,
  buildStageSyncPayload,
} from "../app/runActionHelpers";
import { getMaterialLabel } from "../app/orderHelpers";
import { resolveSectionNameForOrder } from "../app/appUtils";
import { toUserError } from "../app/errorCatalogHelpers";
import { OrderService } from "../services/orderService";

interface UseStageActionsParams {
  canOperateProduction: boolean;
  denyActionByRole: (msg: string) => void;
  setError: (msg: string) => void;
  setRows: (updater: (prev: Record<string, unknown>[]) => Record<string, unknown>[]) => void;
  setShipmentOrders: (updater: (prev: Record<string, unknown>[]) => Record<string, unknown>[]) => void;
  setPendingStageActionKeys: (updater: (prev: Set<string>) => Set<string>) => void;
  orderIndexById: Map<string, Record<string, unknown>>;
  shipmentBoard: Record<string, unknown>[];
  load: () => Promise<void>;
  syncPlanCellToGoogleSheet: (params: Record<string, unknown>) => Promise<void>;
  notifyAssemblyReadyTelegram: (params: Record<string, unknown>) => void;
  notifyFinalStageTelegram: (params: Record<string, unknown>) => void;
  openPilkaDoneConsumeDialog: (orderId: string, meta?: Record<string, unknown>) => void;
  openPilkaDoneConsumeDialogOnError: (orderId: string, meta: Record<string, unknown>, error: unknown) => void;
}

interface UseStageActionsReturn {
  runAction: (action: string, orderId: string, payload?: Record<string, unknown>, meta?: Record<string, unknown>) => Promise<void>;
  stageActionSeqRef: React.MutableRefObject<Map<string, number>>;
}

/**
 * Хук, инкапсулирующий логику выполнения производственного действия (runAction).
 * Управляет оптимистичным обновлением строк, синхронизацией с Google Sheets,
 * Telegram-уведомлениями и диалогом расхода материала при завершении пилы.
 */
export function useStageActions({
  canOperateProduction,
  denyActionByRole,
  setError,
  setRows,
  setShipmentOrders,
  setPendingStageActionKeys,
  orderIndexById,
  shipmentBoard,
  load,
  syncPlanCellToGoogleSheet,
  notifyAssemblyReadyTelegram,
  notifyFinalStageTelegram,
  openPilkaDoneConsumeDialog,
  openPilkaDoneConsumeDialogOnError,
}: UseStageActionsParams): UseStageActionsReturn {
  const stageActionSeqRef = useRef(new Map<string, number>());

  const runAction = useCallback(
    async (action: string, orderId: string, payload: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) => {
      if (!canOperateProduction) {
        denyActionByRole("Недостаточно прав для изменения этапов производства.");
        return;
      }
      const key = `${action}:${orderId}`;
      const seq = (stageActionSeqRef.current.get(key) || 0) + 1;
      stageActionSeqRef.current.set(key, seq);
      setPendingStageActionKeys((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      setError("");
      const targetOrderId = String(orderId || "");
      const hasOptimisticRule = hasOptimisticActionRule(action);
      let rowsSnapshot: Record<string, unknown> | null = null;
      let shipmentOrdersSnapshot: Record<string, unknown> | null = null;
      if (hasOptimisticRule) {
        const patchList = (list: Record<string, unknown>[], setSnapshot: (row: Record<string, unknown>) => void) =>
          list.map((row) => {
            const rowOrderId = String(row.orderId || row.order_id || "");
            if (rowOrderId !== targetOrderId) return row;
            setSnapshot(row);
            return applyOptimisticOrderRow(row, action, payload);
          });
        setRows((prev) =>
          patchList(prev, (row) => {
            rowsSnapshot = row;
          }),
        );
        setShipmentOrders((prev) =>
          patchList(prev, (row) => {
            shipmentOrdersSnapshot = row;
          }),
        );
      }
      try {
        const data = await OrderService.updateOrderStage(orderId, action, payload);
        const stageSync = STAGE_SYNC_META[action];
        if (stageSync) {
          const sourceOrder = orderIndexById.get(String(orderId)) || {};
          const stageSyncPayload = buildStageSyncPayload({
            orderId,
            meta,
            sourceOrder,
            stageSync,
            getMaterialLabel,
            resolveSectionNameForOrder,
            shipmentBoard: shipmentBoard as unknown as Record<string, unknown>,
          });
          if (stageSyncPayload) {
            void syncPlanCellToGoogleSheet(stageSyncPayload);
          }
        }
        if (action === "webSetPrasDone" && meta.notifyOnAssembly) {
          notifyAssemblyReadyTelegram(buildNotifyPayload(orderId, meta));
        }
        if (action === "webSetShippingDone" && meta.notifyOnFinalStage) {
          notifyFinalStageTelegram(buildNotifyPayload(orderId, meta));
        }
        if (action === "webSetPilkaDone") {
          openPilkaDoneConsumeDialog(orderId, meta);
          return;
        }
        // Non-blocking reconcile: optimistic state updates instantly, backend sync runs in background.
        void load();
      } catch (e) {
        if (hasOptimisticRule && stageActionSeqRef.current.get(key) === seq) {
          if (rowsSnapshot) {
            setRows((prev) =>
              prev.map((row) => {
                const rowOrderId = String(row.orderId || row.order_id || "");
                return rowOrderId === targetOrderId ? rowsSnapshot! : row;
              }),
            );
          }
          if (shipmentOrdersSnapshot) {
            setShipmentOrders((prev) =>
              prev.map((row) => {
                const rowOrderId = String(row.orderId || row.order_id || "");
                return rowOrderId === targetOrderId ? shipmentOrdersSnapshot! : row;
              }),
            );
          }
        }
        if (action === "webSetPilkaDone") {
          openPilkaDoneConsumeDialogOnError(orderId, meta, e);
        }
        setError(toUserError(e));
      } finally {
        if (stageActionSeqRef.current.get(key) === seq) {
          setPendingStageActionKeys((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
      }
    },
    [
      canOperateProduction,
      denyActionByRole,
      setError,
      setRows,
      setShipmentOrders,
      setPendingStageActionKeys,
      orderIndexById,
      shipmentBoard,
      load,
      syncPlanCellToGoogleSheet,
      notifyAssemblyReadyTelegram,
      notifyFinalStageTelegram,
      openPilkaDoneConsumeDialog,
      openPilkaDoneConsumeDialogOnError,
    ],
  );

  return { runAction, stageActionSeqRef };
}
