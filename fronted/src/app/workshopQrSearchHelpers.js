import { extractPlanItemArticle } from "./orderHelpers";

export function parseWorkshopQrScan(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;

  const orderIdMatch = text.match(/\b(SP-[A-F0-9]{6,})\b/i);
  const hasQrFields = /(?:^|;)ARTICLE:/i.test(text) || /(?:^|;)PLAN:/i.test(text);

  if (orderIdMatch && !hasQrFields) {
    return { type: "orderId", orderId: orderIdMatch[1].toUpperCase(), raw: text };
  }

  const article = text.match(/(?:^|;)ARTICLE:([^;]+)/i)?.[1]?.trim() || "";
  const plan = text.match(/(?:^|;)PLAN:([^;]+)/i)?.[1]?.trim() || "";
  const qty = text.match(/(?:^|;)QTY:([^;]+)/i)?.[1]?.trim() || "";

  if (article || plan || qty) {
    return { type: "qr", article, plan, qty, raw: text };
  }

  if (orderIdMatch) {
    return { type: "orderId", orderId: orderIdMatch[1].toUpperCase(), raw: text };
  }

  return { type: "text", text, raw: text };
}

function getOrderArticle(order) {
  const fromItem = extractPlanItemArticle(order?.item);
  if (fromItem) return fromItem;
  return String(
    order?.product_article ||
      order?.productArticle ||
      order?.article_code ||
      order?.articleCode ||
      order?.article ||
      "",
  ).trim();
}

function normalizePlan(value) {
  const match = String(value || "").trim().match(/\d+/);
  return match ? match[0] : String(value || "").trim();
}

export function orderMatchesWorkshopQrScan(order, parsed) {
  if (!parsed) return true;

  if (parsed.type === "orderId") {
    const id = String(order?.orderId || order?.order_id || "")
      .trim()
      .toUpperCase();
    return id === parsed.orderId.toUpperCase();
  }

  if (parsed.type === "text") {
    const q = parsed.text.toLowerCase();
    const item = String(order?.item || "").toLowerCase();
    const id = String(order?.orderId || order?.order_id || "").toLowerCase();
    const article = getOrderArticle(order).toLowerCase();
    return item.includes(q) || id.includes(q) || (article && article.includes(q));
  }

  if (parsed.type === "qr") {
    if (parsed.article) {
      const targetArticle = parsed.article.toLowerCase();
      const article = getOrderArticle(order).toLowerCase();
      const articleOk =
        (article && article === targetArticle) ||
        String(order?.item || "").toLowerCase().includes(targetArticle);
      if (!articleOk) return false;
    }

    if (parsed.plan) {
      const targetPlan = normalizePlan(parsed.plan);
      const week = normalizePlan(order?.week);
      if (targetPlan && week !== targetPlan) return false;
    }

    return Boolean(parsed.article || parsed.plan);
  }

  return true;
}

export function workshopQrScanLabel(parsed) {
  if (!parsed) return "";
  if (parsed.type === "orderId") return parsed.orderId;
  const parts = [];
  if (parsed.article) parts.push(parsed.article);
  if (parsed.plan) parts.push(`план ${parsed.plan}`);
  return parts.join(", ") || parsed.raw;
}

export function looksLikeWorkshopQrPayload(text) {
  return /ARTICLE:[^;]+;PLAN:/i.test(String(text || ""));
}
