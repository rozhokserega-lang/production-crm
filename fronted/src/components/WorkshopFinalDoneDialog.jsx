import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PlanPreviewPrint } from "./PlanPreviewPrint";
import { buildWorkshopPlanPreview } from "../app/workshopPlanPreviewHelpers";
import { printWithPartialBodyClass, waitForImages } from "../app/printHelpers";
import { OrderService } from "../services/orderService";

export function WorkshopFinalDoneDialog({
  open,
  meta,
  qtyInput,
  setQtyInput,
  planPreview,
  setPlanPreview,
  previewLoading,
  error,
  saving,
  onClose,
  onConfirm,
  onPrint,
  articleLookupByItemKey,
  previewDeps,
  printAreaRef,
}) {
  const orderQty = Number(meta?.qty || 0) || 0;
  const readyQty = Number(String(qtyInput || "").replace(",", "."));
  const hasDebt = Number.isFinite(readyQty) && readyQty > 0 && readyQty < orderQty;
  const debtQty = hasDebt ? Math.max(0, orderQty - readyQty) : 0;

  useEffect(() => {
    if (!open || !meta?.orderId) return;
    let cancelled = false;
    (async () => {
      const qty = Number(String(qtyInput || meta?.qty || "").replace(",", "."));
      if (!Number.isFinite(qty) || qty <= 0) {
        setPlanPreview(null);
        return;
      }
      try {
        const preview = await buildWorkshopPlanPreview(meta.order, qty, previewDeps);
        if (!cancelled) setPlanPreview(preview);
      } catch (_) {
        if (!cancelled) setPlanPreview(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, meta, qtyInput, previewDeps, setPlanPreview]);

  if (!open || !meta) return null;

  const stage = meta.stage === "assembly" ? "assembly" : "final";
  const stageTitle = stage === "assembly" ? "Сборка" : "Финал";
  const nextStageLabel = stage === "assembly" ? "на финал" : "в финал";

  return (
    <>
      <div className="dialog-backdrop">
        <div className="dialog-card workshop-final-dialog" style={{ maxWidth: 520, width: "95vw" }}>
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>{stageTitle} — сколько комплектов готово?</h3>
          <p style={{ margin: "0 0 12px", color: "#64748b", fontSize: 13 }}>
            {meta.itemLabel || "—"}
            {meta.material ? ` · ${meta.material}` : ""}
            {meta.week ? ` · план ${meta.week}` : ""}
          </p>
          <p style={{ margin: "0 0 14px", color: "#475569", fontSize: 13 }}>
            В заказе <strong>{orderQty}</strong> шт. Если часть испортилась на цепочке, укажите фактически готовое количество.
            Остаток попадёт в колонку «Долг».
          </p>
          <label style={{ display: "block", marginBottom: 10, fontWeight: 500 }}>
            Готово комплектов:
            <input
              type="number"
              min={1}
              max={orderQty || undefined}
              step={1}
              style={{
                display: "block",
                width: "100%",
                marginTop: 6,
                padding: "8px 10px",
                fontSize: 16,
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                boxSizing: "border-box",
              }}
              value={qtyInput}
              onChange={(e) => setQtyInput(e.target.value)}
              autoFocus
            />
          </label>
          {hasDebt ? (
            <div
              style={{
                marginBottom: 12,
                padding: "10px 12px",
                borderRadius: 8,
                background: "#fff7ed",
                border: "1px solid #fed7aa",
                color: "#9a3412",
                fontSize: 13,
              }}
            >
              В {nextStageLabel} уйдёт <strong>{readyQty}</strong> шт., в «Долг» — <strong>{debtQty}</strong> шт. по плану {meta.week || "—"}.
            </div>
          ) : null}
          {error ? <div className="error" style={{ marginBottom: 10 }}>{error}</div> : null}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button type="button" className="mini ghost" onClick={onClose} disabled={saving}>
              Отмена
            </button>
            {hasDebt && planPreview ? (
              <button type="button" className="mini" onClick={onPrint} disabled={saving || previewLoading}>
                Печать листа ({readyQty} шт.)
              </button>
            ) : null}
            <button
              type="button"
              className="mini ok"
              disabled={saving || !qtyInput}
              onClick={() => onConfirm(readyQty)}
            >
              {saving ? "Сохраняю..." : "Подтвердить"}
            </button>
          </div>
        </div>
      </div>
      {hasDebt && planPreview
        ? createPortal(
            <div ref={printAreaRef} className="print-area workshop-final-print-area" aria-hidden="true">
              <PlanPreviewPrint planPreview={planPreview} articleLookupByItemKey={articleLookupByItemKey} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function useWorkshopFinalDone({
  callBackend,
  mutationLoad,
  setError,
  runAction,
  previewDeps,
  articleLookupByItemKey,
}) {
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState(null);
  const [qtyInput, setQtyInput] = useState("");
  const [planPreview, setPlanPreview] = useState(null);
  const [previewLoading] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [saving, setSaving] = useState(false);
  const [productionDebts, setProductionDebts] = useState([]);
  const printAreaRef = useRef(null);

  const refreshProductionDebts = useCallback(async () => {
    try {
      const rows = await callBackend("webGetProductionPlanDebts");
      setProductionDebts(Array.isArray(rows) ? rows : []);
    } catch (_) {
      setProductionDebts([]);
    }
  }, [callBackend]);

  useEffect(() => {
    refreshProductionDebts();
  }, [refreshProductionDebts]);

  const openFinalDoneDialog = useCallback((orderId, orderMeta = {}) => {
    const qty = Number(orderMeta.qty || 0) || 1;
    const stage = orderMeta.stage === "assembly" ? "assembly" : "final";
    setMeta({
      orderId: String(orderId || ""),
      order: orderMeta.order || orderMeta,
      qty,
      stage,
      week: orderMeta.week,
      item: orderMeta.item,
      itemLabel: orderMeta.itemLabel || stripItemLabel(orderMeta.item),
      material: orderMeta.material,
      notifyMeta: orderMeta.notifyMeta || orderMeta,
    });
    setQtyInput(String(qty));
    setDialogError("");
    setPlanPreview(null);
    setOpen(true);
  }, []);

  const closeFinalDoneDialog = useCallback(() => {
    setOpen(false);
    setMeta(null);
    setQtyInput("");
    setPlanPreview(null);
    setDialogError("");
    void refreshProductionDebts();
    void mutationLoad();
  }, [mutationLoad, refreshProductionDebts]);

  const confirmFinalDone = useCallback(
    async (qtyReadyRaw) => {
      const orderQty = Number(meta?.qty || 0) || 0;
      const qtyReady = Math.round(Number(qtyReadyRaw));
      if (!Number.isFinite(qtyReady) || qtyReady <= 0) {
        setDialogError("Укажите количество больше 0");
        return;
      }
      if (qtyReady > orderQty) {
        setDialogError(`Не больше ${orderQty} шт.`);
        return;
      }
      setSaving(true);
      setDialogError("");
      try {
        const orderId = meta?.orderId;
        const stage = meta?.stage === "assembly" ? "assembly" : "final";

        if (stage === "assembly") {
          if (qtyReady >= orderQty) {
            await runAction("webSetAssemblyDone", orderId);
          } else {
            await callBackend("webFinalizeAssemblyOrder", {
              orderId,
              qtyReady,
            });
            void mutationLoad();
          }
        } else if (qtyReady >= orderQty) {
          await runAction("webSetWarehouseKitReady", orderId, {}, meta?.notifyMeta || {});
        } else {
          await callBackend("webFinalizeWorkshopOrder", {
            orderId,
            qtyReady,
          });
          try {
            await OrderService.completeReplacementForWorkshopOrder(orderId);
          } catch (_) {}
          void mutationLoad();
        }
        setOpen(false);
        setMeta(null);
        setQtyInput("");
        setPlanPreview(null);
        await refreshProductionDebts();
      } catch (e) {
        setDialogError(String(e?.message || e || "Не удалось завершить заказ"));
        setError(String(e?.message || e || "Не удалось завершить заказ"));
      } finally {
        setSaving(false);
      }
    },
    [
      meta,
      runAction,
      callBackend,
      mutationLoad,
      refreshProductionDebts,
      setError,
    ],
  );

  const printAdjustedPlan = useCallback(async () => {
    await new Promise((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
    });
    await waitForImages(printAreaRef.current);
    printWithPartialBodyClass("workshop-partial-print");
  }, []);

  const debtRows = useMemo(() => productionDebts, [productionDebts]);

  return {
    finalDoneDialog: {
      open,
      meta,
      qtyInput,
      setQtyInput,
      planPreview,
      setPlanPreview,
      previewLoading,
      error: dialogError,
      saving,
      close: closeFinalDoneDialog,
      confirm: confirmFinalDone,
      print: printAdjustedPlan,
      articleLookupByItemKey,
      previewDeps,
      printAreaRef,
    },
    openFinalDoneDialog,
    productionDebts: debtRows,
    refreshProductionDebts,
  };
}

function stripItemLabel(item) {
  const raw = String(item || "").trim();
  if (!raw) return "—";
  const idx = raw.indexOf("[");
  return idx > 0 ? raw.slice(0, idx).trim() : raw;
}
