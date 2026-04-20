export function parseStageAuditRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const out = [];
  const stageKeys = ["pilka_status", "kromka_status", "pras_status", "assembly_status", "overall_status"];
  list.forEach((row) => {
    const details = row?.details && typeof row.details === "object" ? row.details : {};
    const before = details?.before && typeof details.before === "object" ? details.before : {};
    const after = details?.after && typeof details.after === "object" ? details.after : {};
    const changed = [];
    stageKeys.forEach((key) => {
      const prev = String(before?.[key] ?? "").trim();
      const next = String(after?.[key] ?? "").trim();
      if (prev !== next) changed.push({ key, before: prev || "-", after: next || "-" });
    });
    const orderId = String(row?.entity_id || details?.order_id || "").trim();
    if (!orderId && !changed.length) return;
    out.push({
      id: row?.id ?? `${row?.created_at || ""}-${orderId || "order"}`,
      createdAt: String(row?.created_at || "").trim(),
      orderId: orderId || "-",
      changed,
    });
  });
  return out;
}

export function mapStageFieldToKey(field) {
  if (field === "pilka_status") return "pilka";
  if (field === "kromka_status") return "kromka";
  if (field === "pras_status") return "pras";
  return "";
}

export function normalizeStageStatus(value) {
  const raw = String(value || "").trim();
  const lc = raw.toLowerCase();
  if (!raw) return "-";
  if (lc.includes("в работе")) return "В работе";
  if (lc.includes("готов")) return "Готово";
  if (lc.includes("ожида")) return "Ожидает";
  if (lc.includes("пауза")) return "Пауза";
  return raw;
}
