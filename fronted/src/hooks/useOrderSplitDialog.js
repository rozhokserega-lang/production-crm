import { useCallback, useState } from "react";
import { OrderService } from "../services/orderService";

/**
 * Диалог разделения заказа на любом этапе производства.
 * Часть количества остаётся в заказе, остаток уходит в план целевой недели
 * как «Ожидает» (RPC web_split_workshop_order).
 */
export function useOrderSplitDialog({ mutationLoad, setError, canManageOrders, denyActionByRole }) {
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState("");

  const openOrderSplitDialog = useCallback(
    (orderId, orderMeta = {}) => {
      const qty = Number(orderMeta.qty || 0) || 0;
      if (qty <= 1) {
        setError("Разделение доступно для заказов с количеством больше 1 шт.");
        return;
      }
      setMeta({
        orderId: String(orderId || ""),
        qty,
        week: orderMeta.week,
        item: orderMeta.item,
        itemLabel: orderMeta.itemLabel || orderMeta.item,
        material: orderMeta.material,
      });
      setDialogError("");
      setOpen(true);
    },
    [setError],
  );

  const closeOrderSplitDialog = useCallback(() => {
    setOpen(false);
    setDialogError("");
  }, []);

  const confirmOrderSplit = useCallback(
    async ({ qtyKeep, targetWeek, qtyMove } = {}) => {
      if (!canManageOrders) {
        denyActionByRole("Недостаточно прав для разделения заказа.");
        return;
      }
      if (!meta?.orderId) {
        setDialogError("Заказ не выбран.");
        return;
      }
      const keep = Number(qtyKeep || 0);
      const move = Number(qtyMove || 0);
      const total = Number(meta.qty || 0);
      if (!(keep > 0 && move > 0 && keep + move === total)) {
        setDialogError(
          `Сумма частей (${keep + move}) должна равняться количеству в заказе (${total}).`,
        );
        return;
      }
      if (!String(targetWeek || "").trim()) {
        setDialogError("Выберите целевой план.");
        return;
      }
      setSaving(true);
      try {
        await OrderService.splitWorkshopOrder(meta.orderId, {
          qtyKeep: keep,
          targetWeek: String(targetWeek).trim(),
          qtyMove: move,
        });
        setOpen(false);
        setDialogError("");
        if (typeof mutationLoad === "function") await mutationLoad();
      } catch (err) {
        const message = err?.message ? String(err.message) : "";
        setDialogError(message || "Не удалось разделить заказ.");
        setError(message || "Не удалось разделить заказ.");
      } finally {
        setSaving(false);
      }
    },
    [canManageOrders, denyActionByRole, meta, mutationLoad, setError],
  );

  return {
    orderSplitDialog: {
      open,
      meta,
      saving,
      error: dialogError,
      close: closeOrderSplitDialog,
      confirm: confirmOrderSplit,
    },
    openOrderSplitDialog,
  };
}
