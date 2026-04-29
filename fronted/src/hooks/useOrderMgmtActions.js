import { useCallback, useState } from "react";
import { OrderService } from "../services/orderService";
import {
  toUserError,
} from "../app/errorCatalogHelpers";
import {
  getStatsDeleteActionKey,
  resolveStatsOrderSourceCell,
} from "../app/statsDeleteHelpers";

/**
 * Actions for order management: admin comments, stage overrides, stats deletion.
 */
export function useOrderMgmtActions({
  canAdminSettings,
  canManageOrders,
  denyActionByRole,
  setActionLoading,
  setError,
  load,
  orderDrawerId,
  rowsRef,
}) {
  const [adminCommentSaving, setAdminCommentSaving] = useState(false);

  const saveOrderAdminComment = useCallback(
    async (text) => {
      const id = String(orderDrawerId || "").trim();
      if (!id || !canAdminSettings) return;
      setAdminCommentSaving(true);
      setError("");
      try {
        await OrderService.setOrderAdminComment(id, text);
        await load();
      } catch (e) {
        setError(toUserError(e));
      } finally {
        setAdminCommentSaving(false);
      }
    },
    [orderDrawerId, canAdminSettings, load, setError],
  );

  const deleteStatsOrder = useCallback(async (order) => {
    if (!canManageOrders) {
      denyActionByRole("Недостаточно прав для удаления заказов.");
      return;
    }
    const orderId = String(order?.orderId || order?.order_id || "").trim();
    if (!orderId) {
      setError("Для этого заказа не найден orderId.");
      return;
    }
    const ok = window.confirm(
      `Удалить заказ ${orderId || ""} из плана? Действие необратимо.`
    );
    if (!ok) return;
    const currentRows = rowsRef.current;
    const actionKey = getStatsDeleteActionKey(order, currentRows);
    setActionLoading(actionKey);
    setError("");
    try {
      try {
        await OrderService.deleteOrder(orderId);
      } catch (deleteByOrderErr) {
        const msg = String(deleteByOrderErr?.message || deleteByOrderErr || "");
        const missingAction =
          msg.includes("не настроен для action") ||
          msg.includes("Unknown action") ||
          msg.includes("not configured");
        if (!missingAction) throw deleteByOrderErr;
        const source = await resolveStatsOrderSourceCell(order, currentRows);
        const sourceRow = source.row;
        const sourceCol = source.col;
        if (!sourceRow || !sourceCol) {
          setError("Для этого заказа не найдена привязка к ячейке плана (row/col).");
          return;
        }
        await OrderService.deleteShipmentPlanCell({ p_row: sourceRow, p_col: sourceCol, row: sourceRow, col: sourceCol });
      }
      await load();
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setActionLoading("");
    }
  }, [canManageOrders, setActionLoading, setError, load, denyActionByRole, rowsRef]);

  const overrideOrderStageFromDrawer = useCallback(async (orderId, stage, status) => {
    if (!canAdminSettings) {
      denyActionByRole("Только администратор может вручную менять этап из канбана.");
      return;
    }
    const stageKey = String(stage || "").trim().toLowerCase();
    const statusKey = String(status || "").trim().toLowerCase();
    const stageMap = {
      pilka: {
        in_work: "webSetPilkaInWork",
        done: "webSetPilkaDone",
        pause: "webSetPilkaPause",
        wait: "webSetPilkaWait",
      },
      kromka: {
        in_work: "webSetKromkaInWork",
        done: "webSetKromkaDone",
        pause: "webSetKromkaPause",
        wait: "webSetKromkaWait",
      },
      pras: {
        in_work: "webSetPrasInWork",
        done: "webSetPrasDone",
        pause: "webSetPrasPause",
        wait: "webSetPrasWait",
      },
    };
    const action = stageMap[stageKey]?.[statusKey];
    if (!action) {
      setError("Некорректная комбинация этапа и статуса.");
      return;
    }
    setError("");
    try {
      await OrderService.updateOrderStage(orderId, action);
      await load();
    } catch (e) {
      setError(toUserError(e));
    }
  }, [canAdminSettings, denyActionByRole, setError, load]);

  return {
    adminCommentSaving,
    saveOrderAdminComment,
    deleteStatsOrder,
    overrideOrderStageFromDrawer,
  };
}
