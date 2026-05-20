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
import { getMaterialLabel, stripPlanItemMeta } from "../app/orderHelpers";
import {
  getResolvedWorkshopStrapNeeds,
  isWorkshopStrapOrderItem,
  orderCountsTowardStrapDemand,
  strapConsumeColorForOrder,
} from "../app/workshopStrapNeeds";
import { resolveSectionNameForOrder } from "../app/appUtils";
import { toUserError } from "../app/errorCatalogHelpers";
import { OrderService } from "../services/orderService";

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
  openPrasDoneStrapDialog,
  workshopStrapDeps,
  refreshStrapStock,
}) {
  const stageActionSeqRef = useRef(new Map());

  const runAction = useCallback(
    async (action, orderId, payload = {}, meta = {}) => {
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
      /** Состояние заказа до оптимистичного патча — для списания обвязки при сборке. */
      const strapAssemblySource =
        action === "webSetAssemblyDone"
          ? orderIndexById.get(String(orderId || ""))
          : null;
      const hasOptimisticRule = hasOptimisticActionRule(action);
      let rowsSnapshot = null;
      let shipmentOrdersSnapshot = null;
      if (hasOptimisticRule) {
        const patchList = (list, setSnapshot) =>
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
        await OrderService.updateOrderStage(orderId, action, payload);

        if (action === "webSetShippingDone") {
          try {
            await OrderService.completeReplacementForWorkshopOrder(targetOrderId);
          } catch (_) {
            /* триггер в БД дублирует; не блокируем финал */
          }
        }

        if (action === "webSetAssemblyDone" && workshopStrapDeps && strapAssemblySource) {
          const raw = stripPlanItemMeta(String(strapAssemblySource.item || strapAssemblySource.Item || ""));
          if (!isWorkshopStrapOrderItem(raw) && orderCountsTowardStrapDemand(strapAssemblySource)) {
            try {
              const list = getResolvedWorkshopStrapNeeds(strapAssemblySource, workshopStrapDeps);
              const color = strapConsumeColorForOrder(strapAssemblySource);
              for (const row of list) {
                const n = Number(row.needed || 0);
                if (n > 0) {
                  await OrderService.consumeStrapStock({ strapType: row.code, color, qty: n });
                }
              }
            } catch (strapErr) {
              setError(
                toUserError(strapErr) ||
                  "Сборка отмечена, но списание обвязки со склада не выполнено. Проверьте остатки вручную.",
              );
            }
          }
          if (typeof refreshStrapStock === "function") {
            try {
              await refreshStrapStock();
            } catch (_) {
              /* ignore */
            }
          }
        }

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
            shipmentBoard,
          });
          if (stageSyncPayload) {
            void syncPlanCellToGoogleSheet(stageSyncPayload);
          }
        }
        if (action === "webSetPrasDone" && meta.notifyOnAssembly) {
          notifyAssemblyReadyTelegram(buildNotifyPayload(orderId, meta));
        }
        if (action === "webSetPrasDone" && meta.isStrapOrder && typeof openPrasDoneStrapDialog === "function") {
          openPrasDoneStrapDialog(orderId, { ...meta, mode: "done" });
          return;
        }
        if (action === "webSetPrasPause" && meta.isStrapOrder && typeof openPrasDoneStrapDialog === "function") {
          openPrasDoneStrapDialog(orderId, { ...meta, mode: "pause" });
          return;
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
                return rowOrderId === targetOrderId ? rowsSnapshot : row;
              }),
            );
          }
          if (shipmentOrdersSnapshot) {
            setShipmentOrders((prev) =>
              prev.map((row) => {
                const rowOrderId = String(row.orderId || row.order_id || "");
                return rowOrderId === targetOrderId ? shipmentOrdersSnapshot : row;
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
      openPrasDoneStrapDialog,
      workshopStrapDeps,
      refreshStrapStock,
    ],
  );

  return { runAction, stageActionSeqRef };
}
