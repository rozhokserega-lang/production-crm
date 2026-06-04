import { useCallback, useRef, useState } from "react";
import { OrderService } from "../services/orderService";

/**
 * Диалог списания фурнитуры при закрытии (отгрузке) заказа.
 * Предлагает строки по нормам расхода (BOM) и даёт скорректировать
 * количество перед подтверждением.
 */
export function useHardwareConsumeDialog({ canOperateWarehouse = false, canOperateProduction = false, setError }) {
  const [open, setOpen] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [item, setItem] = useState("");
  const [week, setWeek] = useState("");
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const submittedOrderIdsRef = useRef(new Set());

  const close = useCallback(() => {
    setOpen(false);
    setOrderId("");
    setItem("");
    setWeek("");
    setLines([]);
    setLoading(false);
    setSaving(false);
    setDialogError("");
  }, []);

  const setLineQty = useCallback((hardwareItemId, value) => {
    const clean = String(value).replace(/[^0-9.,]/g, "");
    setLines((prev) =>
      prev.map((l) => (l.hardwareItemId === hardwareItemId ? { ...l, qty: clean } : l)),
    );
  }, []);

  const openHardwareConsumeDialog = useCallback(
    (rawOrderId, meta = {}) => {
      const id = String(rawOrderId || "").trim();
      if (!id) return;
      setOrderId(id);
      setItem(String(meta.item || "").trim());
      setWeek(String(meta.week || "").trim());
      setLines([]);
      setDialogError("");
      setLoading(true);
      setOpen(true);

      OrderService.getHardwareConsumeOptions(id)
        .then((rows) => {
          const list = Array.isArray(rows) ? rows : [];
          setLines(
            list.map((r) => ({
              hardwareItemId: Number(r.hardware_item_id),
              name: String(r.name || "").trim(),
              size: String(r.size || "").trim(),
              unit: String(r.unit || "шт").trim(),
              available: Number(r.available || 0),
              suggested: Number(r.suggested_qty || 0),
              qty: String(Number(r.suggested_qty || 0)),
            })),
          );
        })
        .catch((e) => {
          setDialogError(String(e?.message || e || "Не удалось загрузить нормы расхода"));
        })
        .finally(() => setLoading(false));
    },
    [],
  );

  const submit = useCallback(async () => {
    if (!canOperateWarehouse && !canOperateProduction) {
      setDialogError("Недостаточно прав для списания фурнитуры.");
      return;
    }
    const id = orderId;
    if (!id) return;
    if (submittedOrderIdsRef.current.has(id)) {
      close();
      return;
    }
    const payloadLines = lines
      .map((l) => ({ hardware_item_id: l.hardwareItemId, qty: Number(String(l.qty).replace(",", ".")) }))
      .filter((l) => Number.isFinite(l.qty) && l.qty > 0 && l.hardware_item_id > 0);
    if (payloadLines.length === 0) {
      close();
      return;
    }
    submittedOrderIdsRef.current.add(id);
    setSaving(true);
    setDialogError("");
    try {
      await OrderService.consumeHardwareByOrderId(id, payloadLines);
      close();
    } catch (e) {
      submittedOrderIdsRef.current.delete(id);
      const msg = String(e?.message || e || "Ошибка списания фурнитуры");
      setDialogError(msg);
      if (typeof setError === "function") setError(msg);
    } finally {
      setSaving(false);
    }
  }, [canOperateWarehouse, canOperateProduction, orderId, lines, close, setError]);

  return {
    hardwareConsume: {
      open,
      orderId,
      item,
      week,
      lines,
      loading,
      saving,
      error: dialogError,
      setLineQty,
      close,
      submit,
    },
    openHardwareConsumeDialog,
  };
}
