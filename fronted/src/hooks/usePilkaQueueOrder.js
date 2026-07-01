import { useCallback, useEffect, useRef, useState } from "react";
import { OrderService } from "../services/orderService";
import {
  mergePilkaQueueWithRows,
  parsePilkaQueueOrderResponse,
  reorderPilkaQueueIds,
} from "../app/workshopPilkaQueueOrder";

export function usePilkaQueueOrder({ enabled = true } = {}) {
  const [orderIds, setOrderIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimerRef = useRef(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const raw = await OrderService.getPilkaQueueOrder();
      setOrderIds(parsePilkaQueueOrderResponse(raw));
    } catch (_) {
      setOrderIds([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(async (nextIds) => {
    setSaving(true);
    try {
      const raw = await OrderService.setPilkaQueueOrder(nextIds);
      setOrderIds(parsePilkaQueueOrderResponse(raw));
    } catch (err) {
      console.error("Failed to save pilka queue order:", err);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  const schedulePersist = useCallback(
    (nextIds) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        void persist(nextIds).catch(() => {});
      }, 350);
    },
    [persist],
  );

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  const syncWithRows = useCallback((rows) => {
    setOrderIds((prev) => mergePilkaQueueWithRows(prev, rows));
  }, []);

  const reorderRows = useCallback(
    (rows, dragId, targetId) => {
      const currentIds = mergePilkaQueueWithRows(
        orderIds,
        rows,
        (row) => String(row?.orderId || row?.order_id || "").trim(),
      );
      const nextIds = reorderPilkaQueueIds(currentIds, dragId, targetId);
      setOrderIds(nextIds);
      schedulePersist(nextIds);
      return nextIds;
    },
    [orderIds, schedulePersist],
  );

  return {
    orderIds,
    loading,
    saving,
    load,
    syncWithRows,
    reorderRows,
  };
}
