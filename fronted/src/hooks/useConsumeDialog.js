import { useCallback } from "react";
import { OrderService } from "../services/orderService";
import { buildPilkaDoneDialogInit } from "../app/runActionHelpers";
import { extractErrorMessage } from "../app/errorCatalogHelpers";

/**
 * Encapsulates consume dialog logic: open, submit, close, error-handling variants.
 *
 * @param {object} params
 * @param {boolean} params.canOperateProduction
 * @param {Function} params.setError
 * @param {object} params.consumeDialogData - current consume dialog data (from useShipmentDialogsState)
 * @param {Function} params.setConsumeDialogOpen
 * @param {Function} params.setConsumeEditMode
 * @param {Function} params.setConsumeDialogData
 * @param {Function} params.setConsumeMaterial
 * @param {Function} params.setConsumeQty
 * @param {Function} params.setConsumeError
 * @param {Function} params.setConsumeSaving
 * @param {Function} params.setConsumeLoading
 * @param {Function} params.logConsumeToGoogleSheet
 * @param {Function} params.syncLeftoversToGoogleSheet
 * @param {Function} params.load
 */
export function useConsumeDialog({
  canOperateProduction,
  setError: _setError,
  consumeDialogData,
  setConsumeDialogOpen,
  setConsumeEditMode,
  setConsumeDialogData,
  setConsumeMaterial,
  setConsumeQty,
  setConsumeError,
  setConsumeSaving,
  setConsumeLoading,
  logConsumeToGoogleSheet,
  syncLeftoversToGoogleSheet,
  load,
}) {
  const closeConsumeDialog = useCallback(() => {
    setConsumeDialogOpen(false);
    setConsumeEditMode(false);
    setConsumeDialogData(null);
    setConsumeMaterial("");
    setConsumeQty("");
    setConsumeError("");
    setConsumeSaving(false);
    setConsumeLoading(false);
  }, [
    setConsumeDialogOpen,
    setConsumeEditMode,
    setConsumeDialogData,
    setConsumeMaterial,
    setConsumeQty,
    setConsumeError,
    setConsumeSaving,
    setConsumeLoading,
  ]);

  const submitConsume = useCallback(
    async (materialRaw, qtyRaw) => {
      if (!canOperateProduction) {
        setConsumeError("Недостаточно прав для списания листов.");
        return;
      }
      // consumeDialogData is passed in from the parent — it's the current value
      if (!consumeDialogData?.orderId) return;
      const material = String(materialRaw || "").trim();
      const qty = Number(String(qtyRaw || "").replace(",", "."));
      if (!material) return setConsumeError("Укажите материал");
      if (!isFinite(qty) || qty <= 0) return setConsumeError("Некорректное количество");
      setConsumeSaving(true);
      setConsumeError("");
      try {
        await OrderService.consumeSheetsByOrderId(consumeDialogData.orderId, material, qty);
        logConsumeToGoogleSheet({
          orderId: consumeDialogData.orderId,
          item: String(consumeDialogData.item || ""),
          material,
          week: String(consumeDialogData.week || ""),
          qty,
        });
        closeConsumeDialog();
        await load();
        syncLeftoversToGoogleSheet({ silent: true });
      } catch (e) {
        const consumeErrText = String(e?.message || e || "unknown");
        setConsumeError(consumeErrText);
        try {
          await OrderService.logConsumeSheetsFailed(consumeDialogData.orderId, material, qty, consumeErrText);
        } catch (_) {
          // Audit logging must not block UI error handling.
        }
      } finally {
        setConsumeSaving(false);
      }
    },
    [
      canOperateProduction,
      consumeDialogData,
      setConsumeError,
      setConsumeSaving,
      logConsumeToGoogleSheet,
      syncLeftoversToGoogleSheet,
      closeConsumeDialog,
      load,
    ],
  );

  const openPilkaDoneConsumeDialog = useCallback(
    (orderId, meta = {}) => {
      const init = buildPilkaDoneDialogInit(orderId, meta);
      const isPlankOrder = init.isPlankOrder;
      const defaultQty = init.consumeQty;

      setConsumeDialogData(init.consumeDialogData);
      setConsumeMaterial(init.consumeMaterial);
      setConsumeQty(init.consumeQty);
      setConsumeEditMode(true);
      setConsumeError("");
      setConsumeLoading(true);
      setConsumeDialogOpen(true);

      OrderService.getConsumeOptions(orderId)
        .then((options) => {
          setConsumeDialogData(options || { orderId });
          const suggested = isPlankOrder
            ? "Черный"
            : String(options?.suggestedMaterial || meta.material || "").trim();
          if (suggested) setConsumeMaterial(suggested);
          const suggestedSheetsRaw =
            options?.suggestedSheets ?? options?.sheetsNeeded ?? defaultQty ?? 0;
          const suggestedSheets = Number(suggestedSheetsRaw);
          if (Number.isFinite(suggestedSheets) && suggestedSheets > 0) {
            setConsumeQty((prev) => {
              const prevNum = Number(String(prev || "").replace(",", "."));
              if (Number.isFinite(prevNum) && prevNum > 0) return prev;
              return String(suggestedSheets);
            });
          }
          if (!isPlankOrder && suggested) setConsumeEditMode(false);
        })
        .catch(() => {
          // Keep manual mode without hints.
        })
        .finally(() => setConsumeLoading(false));
    },
    [
      setConsumeDialogData,
      setConsumeMaterial,
      setConsumeQty,
      setConsumeEditMode,
      setConsumeError,
      setConsumeLoading,
      setConsumeDialogOpen,
    ],
  );

  const openPilkaDoneConsumeDialogOnError = useCallback(
    (orderId, meta = {}, error) => {
      const init = buildPilkaDoneDialogInit(orderId, meta, { useMetaMaterialOnError: true });
      setConsumeDialogData(init.consumeDialogData);
      setConsumeMaterial(init.consumeMaterial);
      setConsumeQty(init.consumeQty);
      setConsumeEditMode(true);
      setConsumeLoading(false);
      setConsumeError(
        `Этап "Пила: Готово" вернул ошибку, но списание можно выполнить вручную: ${extractErrorMessage(error)}`,
      );
      setConsumeDialogOpen(true);
    },
    [
      setConsumeDialogData,
      setConsumeMaterial,
      setConsumeQty,
      setConsumeEditMode,
      setConsumeLoading,
      setConsumeError,
      setConsumeDialogOpen,
    ],
  );

  return {
    closeConsumeDialog,
    submitConsume,
    openPilkaDoneConsumeDialog,
    openPilkaDoneConsumeDialogOnError,
  };
}
