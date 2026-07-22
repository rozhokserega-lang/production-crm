import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PlanPreviewPrint } from "./PlanPreviewPrint";
import { buildStrapLaunchPlanPreview } from "../app/strapPrintHelpers";
import { printWithPartialBodyClass, waitForImages } from "../app/printHelpers";

export function StrapPrintPreviewDialog({
  open,
  planPreview,
  onClose,
  onPrint,
  articleLookupByItemKey = null,
  printAreaRef,
}) {
  if (!open || !planPreview) return null;

  return (
    <>
      <div
        className="dialog-backdrop workshop-plan-print-backdrop"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="workshop-plan-print-shell">
          <div className="workshop-plan-print-preview">
            <PlanPreviewPrint
              planPreview={planPreview}
              articleLookupByItemKey={articleLookupByItemKey}
            />
            <div className="actions workshop-plan-print-actions no-print">
              <button type="button" className="mini" onClick={onPrint}>
                Печать
              </button>
              <button type="button" className="mini" onClick={onClose}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      </div>
      {createPortal(
        <div ref={printAreaRef} className="print-area strap-stock-print-area" aria-hidden="true">
          <PlanPreviewPrint
            planPreview={planPreview}
            articleLookupByItemKey={articleLookupByItemKey}
          />
        </div>,
        document.body,
      )}
    </>
  );
}

export function useStrapPrintPreviewDialog() {
  const [open, setOpen] = useState(false);
  const [planPreview, setPlanPreview] = useState(null);
  const printAreaRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    setPlanPreview(null);
  }, []);

  const openStrapPrint = useCallback((payload) => {
    const preview = buildStrapLaunchPlanPreview(payload);
    setPlanPreview(preview);
    setOpen(true);
  }, []);

  const print = useCallback(async () => {
    if (!planPreview) return;
    await new Promise((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
    });
    await waitForImages(printAreaRef.current);
    printWithPartialBodyClass("workshop-partial-print");
  }, [planPreview]);

  return {
    strapPrintDialog: {
      open,
      planPreview,
      close,
      print,
      printAreaRef,
    },
    openStrapPrint,
  };
}
