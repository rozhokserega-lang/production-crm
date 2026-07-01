export function normalizePilkaQueueOrderIds(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const id = String(item || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function parsePilkaQueueOrderResponse(raw) {
  const row = Array.isArray(raw) ? raw[0] : raw;
  const ids = row?.order_ids ?? row?.orderIds;
  if (Array.isArray(ids)) return normalizePilkaQueueOrderIds(ids);
  if (typeof ids === "string") {
    try {
      return normalizePilkaQueueOrderIds(JSON.parse(ids));
    } catch (_) {
      return [];
    }
  }
  return [];
}

export function reorderPilkaQueueIds(orderIds, dragId, targetId) {
  const ids = normalizePilkaQueueOrderIds(orderIds);
  const from = ids.indexOf(dragId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, dragId);
  return next;
}

export function mergePilkaQueueWithRows(orderIds, rows, getOrderId = (row) => String(row?.orderId || row?.order_id || "").trim()) {
  const base = normalizePilkaQueueOrderIds(orderIds);
  const known = new Set(base);
  const extras = [];
  for (const row of rows || []) {
    const id = getOrderId(row);
    if (id && !known.has(id)) {
      known.add(id);
      extras.push(id);
    }
  }
  return [...base, ...extras];
}

export function compareWorkshopPilkaRows(a, b, orderIds, { isRowInWork, isRowPaused }) {
  const aw = isRowInWork(a) ? 1 : 0;
  const bw = isRowInWork(b) ? 1 : 0;
  if (aw !== bw) return bw - aw;

  const ap = isRowPaused(a) ? 1 : 0;
  const bp = isRowPaused(b) ? 1 : 0;
  if (ap !== bp) return bp - ap;

  const rank = (row) => {
    const id = String(row?.orderId || row?.order_id || "").trim();
    const idx = orderIds.indexOf(id);
    return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
  };
  const ar = rank(a);
  const br = rank(b);
  if (ar !== br) return ar - br;

  return String(a?.item || "").localeCompare(String(b?.item || ""), "ru");
}
