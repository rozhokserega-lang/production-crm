import { useCallback, useEffect, useMemo, useState } from "react";
import { toUserError } from "../app/errorCatalogHelpers";

function cellSourceKeys(cell) {
  return {
    row: String(cell?.source_row_id ?? cell?.sourceRowId ?? "").trim(),
    col: String(cell?.source_col_id ?? cell?.sourceColId ?? "").trim(),
  };
}

function workshopOrderId(row) {
  return String(row?.order_id ?? row?.orderId ?? "").trim();
}

function isMissingSkipRpcError(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  return (
    msg.includes("web_skip_workshop_to_assembly") ||
    msg.includes("p_skip_workshop") ||
    (msg.includes("function") && msg.includes("does not exist")) ||
    msg.includes("could not find the function")
  );
}

async function sendToWorkshop(callBackend, { row, col, skipWorkshop }) {
  try {
    return await callBackend("webSendShipmentToWork", { row, col, skipWorkshop });
  } catch (error) {
    if (!skipWorkshop || !isMissingSkipRpcError(error)) throw error;
    const createdOrder = await callBackend("webSendShipmentToWork", { row, col });
    const createdOrderId = workshopOrderId(createdOrder);
    if (!createdOrderId) {
      throw new Error("Заказ создан, но не удалось получить ID для цеха");
    }
    return callBackend("webSkipWorkshopToAssembly", { orderId: createdOrderId });
  }
}

export function usePackagingInbox({
  callBackend,
  mutationLoad,
  setError,
}) {
  const [packagingDialogOpen, setPackagingDialogOpen] = useState(false);
  const [packagingOrders, setPackagingOrders] = useState([]);
  const [packagingAcceptingId, setPackagingAcceptingId] = useState("");
  const [packagingActionError, setPackagingActionError] = useState("");
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
    async (orderId, entryStage = "pilka") => {
      const order = packagingOrders.find((x) => String(x?.id) === String(orderId));
      if (!order) return;
      const stage = entryStage === "assembly" ? "assembly" : "pilka";
      const skipWorkshop = stage === "assembly";
      setPackagingActionError("");
      setPackagingAcceptingId(`${orderId}:${stage}`);
      try {
        const product = String(order.product || "").trim();
        const part = String(order.part || "").trim();
        const itemLabel = product === "Прочее" ? part : `${product} — ${part}`;
        const cell = await callBackend("webCreateShipmentPlanCell", {
          sectionName: "Упаковка",
          item: itemLabel,
          material: String(order.color || "").trim() === "—" ? "" : String(order.color || "").trim(),
          week: "X",
          qty: Number(order.qty || 1) || 1,
        });
        const { row, col } = cellSourceKeys(cell);
        if (!row || !col) {
          throw new Error("Не удалось создать ячейку плана для упаковки");
        }

        const createdOrder = await sendToWorkshop(callBackend, { row, col, skipWorkshop });
        if (!workshopOrderId(createdOrder)) {
          throw new Error("Заказ создан, но не удалось получить ID для цеха");
        }

        await callBackend("webAcceptReplacementOrderPackaging", {
          p_id: String(orderId),
          p_workshop_order_id: workshopOrderId(createdOrder),
        });
        await Promise.all([refreshPackagingOrders(), mutationLoad()]);
        setPackagingActionError("");
      } catch (e) {
        const message = toUserError(e) || String(e?.message || e || "Не удалось принять заказ в работу");
        setPackagingActionError(message);
        setError(message);
      } finally {
        setPackagingAcceptingId("");
      }
    },
    [callBackend, mutationLoad, packagingOrders, refreshPackagingOrders, setError],
  );

  const openPackagingDialog = useCallback(() => {
    setPackagingActionError("");
    setPackagingDialogOpen(true);
  }, []);

  const closePackagingDialog = useCallback(() => {
    setPackagingActionError("");
    setPackagingDialogOpen(false);
  }, []);

  return useMemo(
    () => ({
      packagingDialogOpen,
      packagingOrders,
      packagingAcceptingId,
      packagingActionError,
      packagingInboxCount: packagingOrders.length,
      showPackagingOnly,
      setShowPackagingOnly,
      openPackagingDialog,
      closePackagingDialog,
      refreshPackagingOrders,
      acceptPackagingOrder,
    }),
    [
      acceptPackagingOrder,
      closePackagingDialog,
      openPackagingDialog,
      packagingAcceptingId,
      packagingActionError,
      packagingDialogOpen,
      packagingOrders,
      refreshPackagingOrders,
      showPackagingOnly,
    ],
  );
}
