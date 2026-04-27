import { useCallback } from "react";
import type React from "react";
import { OrderService } from "../services/orderService";
import { buildPilkaDoneDialogInit } from "../app/runActionHelpers";
import { extractErrorMessage } from "../app/errorCatalogHelpers";

interface UseConsumeDialogParams {
  canOperateProduction: boolean;
  setError: (msg: string) => void;
  consumeDialogData: Record<string, unknown> | null;
  setConsumeDialogOpen: (v: boolean) => void;
  setConsumeEditMode: (v: boolean) => void;
  setConsumeDialogData: (v: Record<string, unknown> | null) => void;
  setConsumeMaterial: (v: string) => void;
  setConsumeQty: React.Dispatch<React.SetStateAction<string>>;
  setConsumeError: (v: string) => void;
  setConsumeSaving: (v: boolean) => void;
  setConsumeLoading: (v: boolean) => void;
  logConsumeToGoogleSheet: (params: Record<string, unknown>) => Promise<void>;
  syncLeftoversToGoogleSheet: (params: Record<string, unknown>) => Promise<void>;
  load: () => Promise<void>;
}

interface UseConsumeDialogReturn {
  closeConsumeDialog: () => void;
  submitConsume: (materialRaw: string, qtyRaw: string) => Promise<void>;
  openPilkaDoneConsumeDialog: (orderId: string, meta?: Record<string, unknown>) => void;
  openPilkaDoneConsumeDialogOnError: (orderId: string, meta: Record<string, unknown>, error: unknown) => void;
}

export function useConsumeDialog({
  canOperateProduction,
  setError,
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
}: UseConsumeDialogParams): UseConsumeDialogReturn {
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
    async (materialRaw: string, qtyRaw: string) => {
      if (!canOperateProduction) {
        setConsumeError("Недостаточно прав для списания листов.");
        return;
      }
      if (!consumeDialogData?.orderId) return;
      const material = String(materialRaw || "").trim();
      const qty = Number(String(qtyRaw || "").replace(",", "."));
      if (!material) {
        setConsumeError("Укажите материал");
        return;
      }
      if (!isFinite(qty) || qty <= 0) {
        setConsumeError("Некорректное количество");
        return;
      }
      setConsumeSaving(true);
      setConsumeError("");
      try {
        await OrderService.consumeSheetsByOrderId(
          String(consumeDialogData.orderId),
          material,
          qty,
        );
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
        const consumeErrText = String(
          (e as Record<string, unknown>)?.message || e || "unknown",
        );
        setConsumeError(consumeErrText);
        try {
          await OrderService.logConsumeSheetsFailed(
            String(consumeDialogData.orderId),
            material,
            qty,
            consumeErrText,
          );
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
    (orderId: string, meta: Record<string, unknown> = {}) => {
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
          const opts = options as Record<string, unknown> | null;
          setConsumeDialogData(opts || { orderId });
          const suggested = isPlankOrder
            ? "Черный"
            : String(
                (opts as Record<string, unknown>)?.suggestedMaterial ||
                  meta.material ||
                  "",
              ).trim();
          if (suggested) setConsumeMaterial(suggested);
          const suggestedSheetsRaw =
            (opts as Record<string, unknown>)?.suggestedSheets ??
            (opts as Record<string, unknown>)?.sheetsNeeded ??
            defaultQty ??
            0;
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
    (orderId: string, meta: Record<string, unknown>, error: unknown) => {
      const init = buildPilkaDoneDialogInit(orderId, meta, {
        useMetaMaterialOnError: true,
      });
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
