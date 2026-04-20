function hasCreds(baseUrl, token) {
  return Boolean(String(baseUrl || "").trim() && String(token || "").trim());
}

async function postEdge(baseUrl, token, fnName, body) {
  const resp = await fetch(`${String(baseUrl || "").replace(/\/$/, "")}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      apikey: token,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok || payload?.ok === false) {
    throw new Error(String(payload?.error || `HTTP ${resp.status}`));
  }
  return payload;
}

export async function notifyAssemblyReadyTelegramEdge(baseUrl, token, meta = {}) {
  if (!hasCreds(baseUrl, token)) return;
  await postEdge(baseUrl, token, "notify-assembly-ready", {
    orderId: String(meta.orderId || "").trim(),
    item: String(meta.item || "").trim(),
    material: String(meta.material || "").trim(),
    week: String(meta.week || "").trim(),
    qty: Number(meta.qty || 0),
    executor: String(meta.executor || "").trim(),
  });
}

export async function notifyFinalStageTelegramEdge(baseUrl, token, meta = {}) {
  if (!hasCreds(baseUrl, token)) return;
  await postEdge(baseUrl, token, "notify-assembly-ready", {
    stage: "final_done",
    orderId: String(meta.orderId || "").trim(),
    item: String(meta.item || "").trim(),
    material: String(meta.material || "").trim(),
    week: String(meta.week || "").trim(),
    qty: Number(meta.qty || 0),
    executor: String(meta.executor || "").trim(),
  });
}

export async function syncWarehouseFromGoogleSheetEdge(baseUrl, token, params) {
  if (!hasCreds(baseUrl, token)) throw new Error("Supabase credentials are not configured.");
  return postEdge(baseUrl, token, "sync-materials-stock", params);
}

export async function syncLeftoversToGoogleSheetEdge(baseUrl, token, params) {
  if (!hasCreds(baseUrl, token)) throw new Error("Supabase credentials are not configured.");
  return postEdge(baseUrl, token, "sync-leftovers-sheet", params);
}

export async function logConsumeToGoogleSheetEdge(baseUrl, token, params) {
  if (!hasCreds(baseUrl, token)) return;
  return postEdge(baseUrl, token, "log-consume-sheet", params);
}

export async function syncPlanCellToGoogleSheetEdge(baseUrl, token, params) {
  if (!hasCreds(baseUrl, token)) return;
  return postEdge(baseUrl, token, "sync-plan-cell-to-gsheet", params);
}
