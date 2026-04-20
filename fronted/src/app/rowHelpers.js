import { resolvePipelineStage } from "../orderPipeline";

export function isShipmentCellMissingError(e) {
  let raw = "";
  try {
    raw = JSON.stringify(e);
  } catch {
    raw = "";
  }
  const text = [e?.message, e?.details, e?.hint, e?.error_description, raw]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /shipment cell not found|not\s*found|не найден|not\s*exists/.test(text);
}

export function normalizeOrder(row) {
  if (!row || typeof row !== "object") return row;
  const out = {
    ...row,
    orderId: row.orderId ?? row.order_id ?? "",
    pilkaStatus: row.pilkaStatus ?? row.pilka_status ?? row.pilka ?? "",
    kromkaStatus: row.kromkaStatus ?? row.kromka_status ?? row.kromka ?? "",
    prasStatus: row.prasStatus ?? row.pras_status ?? row.pras ?? "",
    assemblyStatus: row.assemblyStatus ?? row.assembly_status ?? "",
    overallStatus: row.overallStatus ?? row.overall_status ?? row.overall ?? "",
    colorName: row.colorName ?? row.color_name ?? "",
    createdAt: row.createdAt ?? row.created_at ?? "",
    sheetsNeeded: row.sheetsNeeded ?? row.sheets_needed ?? 0,
  };
  out.pipelineStage = row.pipeline_stage ?? row.pipelineStage ?? null;
  out.pipelineStage = resolvePipelineStage(out);
  return out;
}

export function formatDateTimeRu(value) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
}
