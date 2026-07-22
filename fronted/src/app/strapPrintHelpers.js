import { formatDateTimeForPrint } from "./appUtils";
import { STRAP_LAUNCH_PLAN_WEEK } from "./workshopStrapNeeds";

export function buildStrapLaunchPlanPreview({
  strapType = "",
  color = "Черный",
  qty = 0,
  productName = "",
  generatedAt = formatDateTimeForPrint(new Date()),
  orderId = "",
} = {}) {
  const code = String(strapType || "").trim();
  const material = String(color || "Черный").trim();
  const amount = Math.max(0, Number(qty || 0));
  const product = String(productName || "").trim();

  return {
    _key: `strap-launch-${code}-${material}-${amount}-${product || "none"}`,
    firstName: code,
    detailedName: code,
    colorName: material,
    planNumber: STRAP_LAUNCH_PLAN_WEEK,
    week: STRAP_LAUNCH_PLAN_WEEK,
    qty: amount,
    strapTargetProduct: product,
    generatedAt,
    orderId: String(orderId || "").trim(),
    rows: [{ part: code, qty: String(amount) }],
  };
}

export function resolveStrapLaunchPrintInputs({
  launchDialog,
  qtyInput,
  materialInput,
  productInput,
  needsColorChoice,
}) {
  const qty = Number.parseInt(String(qtyInput || "").trim(), 10);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: "Укажите количество планок (целое число > 0)" };
  }

  const material = needsColorChoice
    ? String(materialInput || "").trim()
    : String(launchDialog?.color || "").trim();
  if (needsColorChoice && !material) {
    return { ok: false, error: "Выберите цвет" };
  }

  const products = Array.isArray(launchDialog?.products) ? launchDialog.products : [];
  const productName = String(productInput || "").trim();
  if (products.length > 1 && !productName) {
    return { ok: false, error: "Выберите изделие для этой обвязки" };
  }

  return {
    ok: true,
    qty,
    material,
    productName: productName || products[0] || "",
    strapType: String(launchDialog?.strapType || "").trim(),
  };
}
