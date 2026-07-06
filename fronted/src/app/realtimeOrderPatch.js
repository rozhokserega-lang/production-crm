import { normalizeOrder } from "./rowHelpers";

function orderRowId(row) {
  return String(row?.orderId || row?.order_id || "").trim();
}

/**
 * Merge a Supabase Realtime postgres_changes payload into the in-memory orders list.
 * Realtime UPDATE payloads may only include changed columns — always merge with existing row.
 */
export function applyRealtimeOrdersChange(rows, payload, { normalize = normalizeOrder } = {}) {
  if (!Array.isArray(rows) || !payload || typeof payload !== "object") return rows;

  const eventType = String(payload.eventType || payload.type || "").toUpperCase();
  const oldRecord = payload.old || payload.old_record || null;
  const newRecord = payload.new || payload.new_record || payload.record || null;

  if (eventType === "DELETE") {
    const id = String(oldRecord?.order_id || oldRecord?.orderId || "").trim();
    if (!id) return rows;
    return rows.filter((row) => orderRowId(row) !== id);
  }

  if (eventType !== "INSERT" && eventType !== "UPDATE") return rows;

  const id = String(newRecord?.order_id || newRecord?.orderId || "").trim();
  if (!id) return rows;

  const idx = rows.findIndex((row) => orderRowId(row) === id);
  if (idx >= 0) {
    const merged = normalize({ ...rows[idx], ...newRecord });
    if (merged === rows[idx]) return rows;
    const next = rows.slice();
    next[idx] = merged;
    return next;
  }

  return [...rows, normalize(newRecord)];
}
