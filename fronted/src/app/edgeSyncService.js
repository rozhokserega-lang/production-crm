function normalizeBaseUrls(input) {
  const list = (Array.isArray(input) ? input : [input])
    .map((value) => String(value || "").trim().replace(/\/$/, ""))
    .filter(Boolean);
  return Array.from(new Set(list));
}

function hasCreds(baseUrls, token) {
  return normalizeBaseUrls(baseUrls).length > 0 && Boolean(String(token || "").trim());
}

async function postEdgeOnce(baseUrl, token, fnName, body) {
  const resp = await fetch(`${baseUrl}/functions/v1/${fnName}`, {
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

/**
 * Вызов edge-функции с перебором адресов по порядку.
 *
 * Адрес API в сборке считается от origin страницы (см. resolveRuntimeSupabaseUrl),
 * поэтому на офлайн-портале запрос сначала уходит на «свой origin + /supabase».
 * Если этот путь не проксируется (так было до 16.10.26 — POST отвечал 405, и
 * списание не попадало в Google-таблицу), пробуем следующий адрес — прямой адрес
 * шлюза из env. Раньше ошибка проглатывалась, и запись терялась молча.
 */
async function postEdge(baseUrls, token, fnName, body) {
  const list = normalizeBaseUrls(baseUrls);
  if (!list.length || !String(token || "").trim()) {
    throw new Error("Supabase credentials are not configured.");
  }
  let lastError = null;
  for (const baseUrl of list) {
    try {
      return await postEdgeOnce(baseUrl, token, fnName, body);
    } catch (error) {
      lastError = error;
    }
  }
  const reason = String(lastError?.message || lastError || "unknown");
  throw new Error(list.length > 1 ? `${reason} (пробовал: ${list.join(" → ")})` : reason);
}

export async function notifyAssemblyReadyTelegramEdge(baseUrls, token, meta = {}) {
  if (!hasCreds(baseUrls, token)) return null;
  return postEdge(baseUrls, token, "notify-assembly-ready", {
    orderId: String(meta.orderId || "").trim(),
    item: String(meta.item || "").trim(),
    material: String(meta.material || "").trim(),
    week: String(meta.week || "").trim(),
    qty: Number(meta.qty || 0),
    executor: String(meta.executor || "").trim(),
  });
}

export async function notifyFinalStageTelegramEdge(baseUrls, token, meta = {}) {
  if (!hasCreds(baseUrls, token)) return null;
  return postEdge(baseUrls, token, "notify-assembly-ready", {
    stage: "final_done",
    orderId: String(meta.orderId || "").trim(),
    item: String(meta.item || "").trim(),
    material: String(meta.material || "").trim(),
    week: String(meta.week || "").trim(),
    qty: Number(meta.qty || 0),
    executor: String(meta.executor || "").trim(),
  });
}

export async function syncWarehouseFromGoogleSheetEdge(baseUrls, token, params) {
  if (!hasCreds(baseUrls, token)) throw new Error("Supabase credentials are not configured.");
  return postEdge(baseUrls, token, "sync-materials-stock", params);
}

export async function syncLeftoversToGoogleSheetEdge(baseUrls, token, params) {
  if (!hasCreds(baseUrls, token)) throw new Error("Supabase credentials are not configured.");
  return postEdge(baseUrls, token, "sync-leftovers-sheet", params);
}

export async function logConsumeToGoogleSheetEdge(baseUrls, token, params) {
  if (!hasCreds(baseUrls, token)) return null;
  return postEdge(baseUrls, token, "log-consume-sheet", params);
}
