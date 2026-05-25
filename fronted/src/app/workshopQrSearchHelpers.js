const ORDER_ID_RE = /^SP-[A-F0-9]{6,}$/i;

export function parseWorkshopQrScan(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;

  const orderFromField = text.match(/(?:^|;)ORDER:([^;]+)/i)?.[1]?.trim().toUpperCase() || "";
  if (ORDER_ID_RE.test(orderFromField)) {
    return { type: "orderId", orderId: orderFromField, raw: text };
  }

  const orderIdMatch = text.match(/\b(SP-[A-F0-9]{6,})\b/i);
  if (orderIdMatch) {
    return { type: "orderId", orderId: orderIdMatch[1].toUpperCase(), raw: text };
  }

  return null;
}

export function orderMatchesWorkshopQrScan(order, parsed) {
  if (!parsed?.orderId) return false;
  const id = String(order?.orderId || order?.order_id || "")
    .trim()
    .toUpperCase();
  return id === parsed.orderId.toUpperCase();
}

export function workshopQrScanLabel(parsed) {
  return String(parsed?.orderId || "").trim();
}

export function looksLikeWorkshopQrPayload(text) {
  const raw = String(text || "");
  return /;ORDER:SP-/i.test(raw) || /\bSP-[A-F0-9]{6,}\b/i.test(raw);
}
