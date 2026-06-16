import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PlanPreviewPrint } from "./PlanPreviewPrint";
import { buildWorkshopPlanPreview } from "../app/workshopPlanPreviewHelpers";
import { printWithPartialBodyClass, waitForImages } from "../app/printHelpers";

export function WorkshopPlanPrintSheetIcon({ className = "", ...props }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M8 3h8l4 4v14a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M16 3v4h4" />
      <path d="M8 11h8" />
      <path d="M8 15h8" />
      <path d="M8 19h5" />
    </svg>
  );
}

export function WorkshopPlanPrintDialog({
  open,
  loading,
  error,
  planPreview,
  onClose,
  onPrint,
  articleLookupByItemKey,
  printAreaRef,
}) {
  if (!open) return null;

  return (
    <>
      <div
        className="dialog-backdrop workshop-plan-print-backdrop"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="workshop-plan-print-shell">
          {loading ? (
            <p className="workshop-plan-print-status">Готовлю лист для печати…</p>
          ) : null}
          {error ? <div className="error workshop-plan-print-status">{error}</div> : null}
          {planPreview ? (
            <div className="workshop-plan-print-preview">
              <PlanPreviewPrint planPreview={planPreview} articleLookupByItemKey={articleLookupByItemKey} />
              <div className="actions workshop-plan-print-actions no-print">
                <button type="button" className="mini" onClick={onPrint}>
                  Печать
                </button>
                <button type="button" className="mini" onClick={onClose}>
                  Закрыть
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {planPreview
        ? createPortal(
            <div ref={printAreaRef} className="print-area workshop-plan-print-area" aria-hidden="true">
              <PlanPreviewPrint planPreview={planPreview} articleLookupByItemKey={articleLookupByItemKey} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function useWorkshopPlanPrintDialog(previewDeps = {}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [planPreview, setPlanPreview] = useState(null);
  const printAreaRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    setLoading(false);
    setError("");
    setPlanPreview(null);
  }, []);

  const openPlanPrint = useCallback(
    async (order) => {
      const qty = Math.max(1, Number(order?.qty || 0) || 1);
      setOpen(true);
      setLoading(true);
      setError("");
      setPlanPreview(null);
      try {
        const preview = await buildWorkshopPlanPreview(order, qty, previewDeps);
        if (!preview) {
          setError("Не удалось построить лист для печати.");
          return;
        }
        setPlanPreview(preview);
      } catch (e) {
        setError(String(e?.message || e || "Не удалось построить лист для печати."));
      } finally {
        setLoading(false);
      }
    },
    [previewDeps],
  );

  const print = useCallback(async () => {
    if (!planPreview) return;
    await new Promise((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
    });
    await waitForImages(printAreaRef.current);
    printWithPartialBodyClass("workshop-partial-print");
  }, [planPreview]);

  return {
    planPrintDialog: {
      open,
      loading,
      error,
      planPreview,
      close,
      print,
      articleLookupByItemKey: previewDeps.articleLookupByItemKey,
      printAreaRef,
    },
    openPlanPrint,
  };
}
