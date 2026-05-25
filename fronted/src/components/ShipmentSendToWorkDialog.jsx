import { useCallback, useRef, useState } from "react";
import { PlanPreviewPrint } from "./PlanPreviewPrint";
import { buildShipmentPrintPlansForSentOrders, getSentOrderId, loadShipmentTableBySourceMap } from "../app/shipmentPreviewHelpers";
import { printWithPartialBodyClass, waitForImages } from "../app/printHelpers";
import { stripPlanItemMeta } from "../app/orderHelpers";
import { OrderService } from "../services/orderService";
import { normalizeOrder } from "../app/rowHelpers";

function itemLabel(selection) {
  return stripPlanItemMeta(String(selection?.item || selection?.sourceItem || "")).trim() || "—";
}

export function ShipmentSendToWorkDialog({
  open,
  items,
  planPreviews,
  loading,
  error,
  printing,
  onClose,
  onShowPrint,
  articleLookupByItemKey,
  printAreaRef,
}) {
  if (!open) return null;

  return (
    <>
      <div className="dialog-backdrop">
        <div className="dialog-card shipment-send-dialog" style={{ maxWidth: 640, width: "95vw" }}>
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>Заказы отправлены в производство</h3>
          <p style={{ margin: "0 0 14px", color: "#64748b", fontSize: 13 }}>
            Ниже — сгенерированные ID заказов. Листы для печати уже содержат QR с номером заказа.
          </p>
          <div className="shipment-send-dialog__list">
            {items.map((entry) => (
              <div key={entry.orderId || entry.key} className="shipment-send-dialog__row">
                <span className="shipment-send-dialog__order">{entry.orderId || "—"}</span>
                <span className="shipment-send-dialog__meta">
                  {entry.itemLabel}
                  {entry.week ? ` · план ${entry.week}` : ""}
                  {entry.qty ? ` · ${entry.qty} шт.` : ""}
                </span>
              </div>
            ))}
          </div>
          {loading ? (
            <p style={{ margin: "12px 0 0", color: "#64748b", fontSize: 13 }}>Готовлю листы для печати…</p>
          ) : null}
          {error ? <div className="error" style={{ marginTop: 12 }}>{error}</div> : null}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 16 }}>
            <button type="button" className="mini ghost" onClick={onClose} disabled={printing}>
              Закрыть
            </button>
            <button
              type="button"
              className="mini ok"
              disabled={loading || printing || !planPreviews.length}
              onClick={onShowPrint}
            >
              {printing
                ? "Готовлю печать…"
                : `Показать листы для печати (${planPreviews.length || items.length})`}
            </button>
          </div>
        </div>
      </div>
      {planPreviews.length > 0 ? (
        <div ref={printAreaRef} className="print-area shipment-send-print-area" aria-hidden="true">
          {planPreviews.map((planPreview, idx) => (
            <PlanPreviewPrint
              key={planPreview._key || planPreview.orderId || idx}
              planPreview={planPreview}
              articleLookupByItemKey={articleLookupByItemKey}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

export function useShipmentSendToWorkDialog(previewDeps = {}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [planPreviews, setPlanPreviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");
  const printAreaRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    setItems([]);
    setPlanPreviews([]);
    setLoading(false);
    setPrinting(false);
    setError("");
  }, []);

  const openAfterSend = useCallback(
    async (sentResults = []) => {
      const normalized = sentResults
        .map((entry, index) => {
          const selection = entry?.selection || {};
          const orderId = getSentOrderId(entry?.order);
          return {
            key: `${selection.row || "row"}-${selection.col || "col"}-${index}`,
            orderId,
            itemLabel: itemLabel(selection),
            week: String(selection.week || selection.weekCol || "").trim(),
            qty: Number(selection.qty || 0) || 0,
            selection,
          };
        });

      setItems(normalized);
      setPlanPreviews([]);
      setError("");
      setPrinting(false);
      setOpen(true);

      if (!sentResults.length) return;

      setLoading(true);
      try {
        const shipmentTableBySource = await loadShipmentTableBySourceMap();
        let productionRows = Array.isArray(previewDeps.productionRows) ? previewDeps.productionRows : [];
        try {
          const freshOrders = await OrderService.getAllOrders();
          productionRows = Array.isArray(freshOrders) ? freshOrders.map(normalizeOrder) : productionRows;
        } catch (_) {
          // keep cached rows
        }
        const plans = await buildShipmentPrintPlansForSentOrders(sentResults, {
          ...previewDeps,
          productionRows,
          shipmentTableBySource,
        });
        setPlanPreviews(Array.isArray(plans) ? plans : []);
        if (!plans?.length) {
          setError("Не удалось построить листы для печати.");
        }
      } catch (e) {
        setPlanPreviews([]);
        setError(String(e?.message || e || "Не удалось построить листы для печати."));
      } finally {
        setLoading(false);
      }
    },
    [previewDeps],
  );

  const showPrintSheets = useCallback(async () => {
    if (!planPreviews.length || printing) return;
    setPrinting(true);
    setError("");
    try {
      await new Promise((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
      });
      await waitForImages(printAreaRef.current);
      printWithPartialBodyClass("workshop-partial-print");
    } catch (e) {
      setError(String(e?.message || e || "Не удалось подготовить печать."));
    } finally {
      setPrinting(false);
    }
  }, [planPreviews.length, printing]);

  return {
    sendToWorkDialog: {
      open,
      items,
      planPreviews,
      loading,
      error,
      printing,
      close,
      showPrintSheets,
      articleLookupByItemKey: previewDeps.articleLookupByItemKey,
      printAreaRef,
    },
    openSendToWorkDialog: openAfterSend,
  };
}
