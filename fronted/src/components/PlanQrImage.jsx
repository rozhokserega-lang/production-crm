import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { buildPlanPreviewQrPayload, buildQrCodeUrl } from "../app/planPreviewHelpers";

export function PlanQrImage({ planPreview, articleCode = "", size = 108 }) {
  const payload = useMemo(
    () => buildPlanPreviewQrPayload(planPreview, articleCode),
    [planPreview, articleCode],
  );
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    setSrc("");
    QRCode.toDataURL(payload, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(buildQrCodeUrl(payload, size));
      });
    return () => {
      cancelled = true;
    };
  }, [payload, size]);

  const orderId = String(planPreview?.orderId || planPreview?.order_id || "").trim();

  return (
    <>
      {src ? (
        <img className="plan-qr-image" src={src} alt="QR заказа" />
      ) : (
        <div className="plan-qr-image plan-qr-image--pending" aria-hidden="true" />
      )}
      {orderId ? <div className="plan-qr-order-id">{orderId}</div> : null}
    </>
  );
}
