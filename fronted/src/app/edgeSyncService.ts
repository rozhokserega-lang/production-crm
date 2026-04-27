interface EdgeMeta {
  orderId?: string;
  item?: string;
  material?: string;
  week?: string;
  qty?: number;
  executor?: string;
  [key: string]: unknown;
}

function hasCreds(baseUrl: unknown, token: unknown): boolean {
  return Boolean(String(baseUrl || "").trim() && String(token || "").trim());
}

async function postEdge(baseUrl: string, token: string, fnName: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const resp = await fetch(`${String(baseUrl || "").replace(/\/$/, "")}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      apikey: token,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });
  const payload: Record<string, unknown> = await resp.json().catch(() => ({}));
  if (!resp.ok || (payload as Record<string, unknown>)?.ok === false) {
    throw new Error(String((payload as Record<string, unknown>)?.error || `HTTP ${resp.status}`));
  }
  return payload;
}

export async function notifyAssemblyReadyTelegramEdge(baseUrl: string, token: string, meta: EdgeMeta = {}): Promise<void> {
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

export async function notifyFinalStageTelegramEdge(baseUrl: string, token: string, meta: EdgeMeta = {}): Promise<void> {
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

export async function syncWarehouseFromGoogleSheetEdge(baseUrl: string, token: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!hasCreds(baseUrl, token)) throw new Error("Supabase credentials are not configured.");
  return postEdge(baseUrl, token, "sync-materials-stock", params);
}

export async function syncLeftoversToGoogleSheetEdge(baseUrl: string, token: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!hasCreds(baseUrl, token)) throw new Error("Supabase credentials are not configured.");
  return postEdge(baseUrl, token, "sync-leftovers-sheet", params);
}

export async function logConsumeToGoogleSheetEdge(baseUrl: string, token: string, params: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
  if (!hasCreds(baseUrl, token)) return;
  return postEdge(baseUrl, token, "log-consume-sheet", params);
}

export async function syncPlanCellToGoogleSheetEdge(baseUrl: string, token: string, params: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
  if (!hasCreds(baseUrl, token)) return;
  return postEdge(baseUrl, token, "sync-plan-cell-to-gsheet", params);
}
