export function getDefaultSheetsQty(meta = {}) {
  return Number(meta.defaultSheets || 0) > 0 ? String(Number(meta.defaultSheets || 0)) : "";
}

export function buildConsumeDialogData(orderId, meta = {}) {
  return {
    orderId,
    item: String(meta.item || ""),
    suggestedMaterial: "",
    materials: [],
  };
}

export function buildPilkaDoneDialogInit(orderId, meta = {}, options = {}) {
  const useMetaMaterialOnError = Boolean(options.useMetaMaterialOnError);
  const isPlankOrder = Boolean(meta.isPlankOrder);
  return {
    isPlankOrder,
    consumeDialogData: buildConsumeDialogData(orderId, meta),
    consumeMaterial: isPlankOrder
      ? "Черный"
      : useMetaMaterialOnError
        ? String(meta.material || "").trim()
        : "",
    consumeQty: getDefaultSheetsQty(meta),
  };
}

export function buildNotifyPayload(orderId, meta = {}) {
  return {
    orderId,
    item: meta.item,
    material: meta.material,
    week: meta.week,
    qty: meta.qty,
    executor: meta.executor,
  };
}
