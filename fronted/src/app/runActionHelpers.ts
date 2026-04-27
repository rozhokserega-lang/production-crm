export function getDefaultSheetsQty(meta: Record<string, unknown> = {}): string {
  return Number(meta.defaultSheets || 0) > 0 ? String(Number(meta.defaultSheets || 0)) : "";
}

export function buildConsumeDialogData(orderId: string, meta: Record<string, unknown> = {}): {
  orderId: string;
  item: string;
  suggestedMaterial: string;
  materials: unknown[];
} {
  return {
    orderId,
    item: String(meta.item || ""),
    suggestedMaterial: "",
    materials: [],
  };
}

export function buildPilkaDoneDialogInit(
  orderId: string,
  meta: Record<string, unknown> = {},
  options: { useMetaMaterialOnError?: boolean } = {},
): {
  isPlankOrder: boolean;
  consumeDialogData: ReturnType<typeof buildConsumeDialogData>;
  consumeMaterial: string;
  consumeQty: string;
} {
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

export function buildStageSyncPayload({
  orderId,
  meta = {},
  sourceOrder = {},
  stageSync,
  getMaterialLabel,
  resolveSectionNameForOrder,
  shipmentBoard,
}: {
  orderId: string;
  meta?: Record<string, unknown>;
  sourceOrder?: Record<string, unknown>;
  stageSync: { label: string; code: string } | null;
  getMaterialLabel: (item: string, material: string) => string;
  resolveSectionNameForOrder: (order: Record<string, unknown>, board: Record<string, unknown>) => string;
  shipmentBoard: Record<string, unknown>;
}): Record<string, unknown> | null {
  if (!stageSync) return null;

  const syncItem = String(meta.item || sourceOrder.item || "").trim();
  const syncMaterial = String(
    meta.material || getMaterialLabel(syncItem, String(sourceOrder.material || sourceOrder.colorName || "")),
  ).trim();
  const syncWeek = String(meta.week || sourceOrder.week || "").trim();
  const syncQty = Number(meta.qty ?? sourceOrder.qty ?? 0);
  const syncSectionName = String(
    meta.sectionName || resolveSectionNameForOrder(sourceOrder, shipmentBoard) || "",
  ).trim();

  if (!syncSectionName || !syncItem || !syncMaterial || !syncWeek || !(Number.isFinite(syncQty) && syncQty > 0)) {
    return null;
  }

  return {
    sectionName: syncSectionName,
    item: syncItem,
    material: syncMaterial,
    week: syncWeek,
    qty: syncQty,
    stage: stageSync.label,
    stageCode: stageSync.code,
    stageComment: `${stageSync.label}; Заказ: ${orderId}`,
    orderId: String(orderId),
  };
}

export function buildNotifyPayload(
  orderId: string,
  meta: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    orderId,
    item: meta.item,
    material: meta.material,
    week: meta.week,
    qty: meta.qty,
    executor: meta.executor,
  };
}
