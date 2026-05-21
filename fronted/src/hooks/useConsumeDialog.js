import { useCallback, useRef } from "react";
import { ceilWholeSheets } from "../app/appUtils";
import { resolveSheetNeedsByMaterials } from "../app/furnitureMaterialYield";
import { OrderService } from "../services/orderService";
import { buildPilkaDoneDialogInit } from "../app/runActionHelpers";
import { extractErrorMessage } from "../app/errorCatalogHelpers";

/**
 * @param {object} params
 */
export function useConsumeDialog({
  canOperateProduction,
  canOperateWarehouse = false,
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
  furnitureCustomTemplates = [],
  normalizeFurnitureKey,
}) {
  const submittedOrderIdsRef = useRef(new Set());

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

  const buildConsumeLinesFromMeta = useCallback(
    (meta = {}) => {
      const qty = Number(meta.qty || 0);
      const item = String(meta.item || "").trim();
      const material = String(meta.material || "").trim();
      if (!(qty > 0) || !item) return [];
      const n =
        typeof normalizeFurnitureKey === "function" ? normalizeFurnitureKey : (v) => String(v || "").toLowerCase().trim();
      return resolveSheetNeedsByMaterials(furnitureCustomTemplates, item, qty, material, n).map((line) => ({
        material: line.material,
        qty: line.sheets,
      }));
    },
    [furnitureCustomTemplates, normalizeFurnitureKey],
  );

  const submitConsume = useCallback(
    async (materialRaw, qtyRaw) => {
      if (!canOperateProduction && !canOperateWarehouse) {
        setConsumeError("Недостаточно прав для списания листов.");
        return;
      }
      if (!consumeDialogData?.orderId) return;
      const orderId = consumeDialogData.orderId;
      const presetLines = Array.isArray(consumeDialogData.consumeLines) ? consumeDialogData.consumeLines : [];
      const multiLines =
        presetLines.length > 1
          ? presetLines
          : [];

      if (submittedOrderIdsRef.current.has(orderId)) {
        console.warn(`[CRM] Duplicate consume submission blocked for order ${orderId}`);
        closeConsumeDialog();
        return;
      }
      submittedOrderIdsRef.current.add(orderId);

      setConsumeSaving(true);
      setConsumeError("");
      try {
        if (multiLines.length > 1) {
          await OrderService.consumeSheetsLinesByOrderId(orderId, multiLines);
          for (const line of multiLines) {
            logConsumeToGoogleSheet({
              orderId,
              item: String(consumeDialogData.item || ""),
              material: line.material,
              week: String(consumeDialogData.week || ""),
              qty: line.qty,
            });
          }
        } else {
          const material = String(materialRaw || presetLines[0]?.material || "").trim();
          const qty = Number(String(qtyRaw ?? presetLines[0]?.qty ?? "").replace(",", "."));
          if (!material) return setConsumeError("Укажите материал");
          if (!isFinite(qty) || qty <= 0) return setConsumeError("Некорректное количество");
          await OrderService.consumeSheetsByOrderId(orderId, material, qty);
          logConsumeToGoogleSheet({
            orderId,
            item: String(consumeDialogData.item || ""),
            material,
            week: String(consumeDialogData.week || ""),
            qty,
          });
        }
        closeConsumeDialog();
        await load();
        syncLeftoversToGoogleSheet({ silent: true });
      } catch (e) {
        submittedOrderIdsRef.current.delete(orderId);
        const consumeErrText = String(e?.message || e || "unknown");
        setConsumeError(consumeErrText);
        try {
          const failMat = multiLines[0]?.material || materialRaw || "";
          const failQty = multiLines[0]?.qty || qtyRaw || 0;
          await OrderService.logConsumeSheetsFailed(orderId, failMat, failQty, consumeErrText);
        } catch (_) {}
      } finally {
        setConsumeSaving(false);
      }
    },
    [
      canOperateProduction,
      canOperateWarehouse,
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
      const templateLines = isPlankOrder ? [] : buildConsumeLinesFromMeta(meta);
      const consumeLines = templateLines.length > 0 ? templateLines : [];
      const multiDecor = consumeLines.length > 1;

      setConsumeDialogData({
        ...init.consumeDialogData,
        consumeLines,
        multiDecor,
      });
      setConsumeMaterial(
        isPlankOrder ? "Черный" : consumeLines[0]?.material || init.consumeMaterial || String(meta.material || "").trim(),
      );
      setConsumeQty(
        multiDecor
          ? String(consumeLines.reduce((s, l) => s + Number(l.qty || 0), 0))
          : consumeLines[0]?.qty
            ? String(consumeLines[0].qty)
            : init.consumeQty,
      );
      setConsumeEditMode(!multiDecor && !isPlankOrder ? false : true);
      setConsumeError("");
      setConsumeLoading(!multiDecor);
      setConsumeDialogOpen(true);

      if (multiDecor || isPlankOrder) {
        setConsumeLoading(false);
        if (!isPlankOrder) setConsumeEditMode(false);
        return;
      }

      OrderService.getConsumeOptions(orderId)
        .then((options) => {
          const apiLines = Array.isArray(options?.consumeLines) ? options.consumeLines : [];
          const lines = apiLines.length > 0 ? apiLines : consumeLines;
          const multi = lines.length > 1;
          setConsumeDialogData((prev) => ({
            ...(prev || { orderId }),
            ...(options || {}),
            orderId,
            consumeLines: lines,
            multiDecor: multi,
          }));
          const suggested = isPlankOrder
            ? "Черный"
            : String(options?.suggestedMaterial || lines[0]?.material || meta.material || "").trim();
          if (suggested) setConsumeMaterial(suggested);
          const suggestedSheets = ceilWholeSheets(
            options?.suggestedSheets ?? options?.sheetsNeeded ?? lines.reduce((s, l) => s + Number(l.qty || 0), 0) ?? 0,
          );
          if (suggestedSheets > 0) {
            setConsumeQty(String(suggestedSheets));
          }
          if (!isPlankOrder && (suggested || lines.length === 1)) setConsumeEditMode(false);
        })
        .catch(() => {})
        .finally(() => setConsumeLoading(false));
    },
    [
      buildConsumeLinesFromMeta,
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
      const consumeLines = buildConsumeLinesFromMeta(meta);
      setConsumeDialogData({
        ...init.consumeDialogData,
        consumeLines,
        multiDecor: consumeLines.length > 1,
      });
      setConsumeMaterial(init.consumeMaterial);
      setConsumeQty(
        consumeLines.length > 1
          ? String(consumeLines.reduce((s, l) => s + Number(l.qty || 0), 0))
          : init.consumeQty,
      );
      setConsumeEditMode(true);
      setConsumeLoading(false);
      setConsumeError(
        `Этап "Пила: Готово" вернул ошибку, но списание можно выполнить вручную: ${extractErrorMessage(error)}`,
      );
      setConsumeDialogOpen(true);
    },
    [
      buildConsumeLinesFromMeta,
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
