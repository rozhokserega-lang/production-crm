export function normalizeWarehouseSheetSizeInput(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-") return "";
  const normalized = raw.replace(/×/gi, "x").replace(/\s+/g, "").toLowerCase();
  const match = normalized.match(/^(\d+)x(\d+)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return `${width}x${height}`;
}

export function formatWarehouseSheetSizeLabel(value) {
  const normalized = normalizeWarehouseSheetSizeInput(value);
  if (normalized) return normalized;
  const raw = String(value ?? "").trim();
  return raw || "-";
}
