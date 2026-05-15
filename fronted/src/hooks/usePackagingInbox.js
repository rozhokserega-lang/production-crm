import { useCallback, useEffect, useMemo, useState } from "react";

export function usePackagingInbox({
  callBackend,
  mutationLoad,
  setError,
}) {
  const [packagingDialogOpen, setPackagingDialogOpen] = useState(false);
  const [packagingOrders, setPackagingOrders] = useState([]);
  const [packagingAcceptingId, setPackagingAcceptingId] = useState("");
  const [showPackagingOnly, setShowPackagingOnly] = useState(false);

  const refreshPackagingOrders = useCallback(async () => {
    try {
      const rows = await callBackend("webGetReplacementOrders");
      const inbox = (Array.isArray(rows) ? rows : []).filter(
        (x) => x?.sent_to_work === true && x?.packaging_accepted !== true,
      );
      setPackagingOrders(inbox);
    } catch (_) {
      setPackagingOrders([]);
    }
  }, [callBackend]);

  useEffect(() => {
    refreshPackagingOrders();
    const timer = window.setInterval(refreshPackagingOrders, 30000);
    return () => window.clearInterval(timer);
  }, [refreshPackagingOrders]);

  const acceptPackagingOrder = useCallback(
    async (orderId) => {
      const order = packagingOrders.find((x) => x?.id === orderId);
      if (!order) return;
      setPackagingAcceptingId(orderId);
      try {
        const product = String(order.product || "").trim();
        const part = String(order.part || "").trim();
        const itemLabel = product === "Прочее" ? part : `${product} — ${part}`;
        await callBackend("webCreateShipmentPlanCell", {
          sectionName: "Упаковка",
          item: itemLabel,
          material: String(order.color || "").trim() === "—" ? "" : String(order.color || "").trim(),
          week: "X",
          qty: Number(order.qty || 1) || 1,
        });
        await callBackend("webAcceptReplacementOrderPackaging", { p_id: orderId });
        await Promise.all([refreshPackagingOrders(), mutationLoad()]);
      } catch (e) {
        setError(String(e?.message || e || "Не удалось принять заказ в упаковку"));
      } finally {
        setPackagingAcceptingId("");
      }
    },
    [callBackend, mutationLoad, packagingOrders, refreshPackagingOrders, setError],
  );

  return useMemo(
    () => ({
      packagingDialogOpen,
      packagingOrders,
      packagingAcceptingId,
      packagingInboxCount: packagingOrders.length,
      showPackagingOnly,
      setShowPackagingOnly,
      openPackagingDialog: () => setPackagingDialogOpen(true),
      closePackagingDialog: () => setPackagingDialogOpen(false),
      refreshPackagingOrders,
      acceptPackagingOrder,
    }),
    [
      acceptPackagingOrder,
      packagingAcceptingId,
      packagingDialogOpen,
      packagingOrders,
      refreshPackagingOrders,
      showPackagingOnly,
    ],
  );
}
