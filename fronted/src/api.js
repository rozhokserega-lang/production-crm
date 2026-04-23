import { createClient } from "@supabase/supabase-js";
import {
  BACKEND_PROVIDER,
  GAS_WEBAPP_URL,
  HYBRID_DUPLICATE_ACTIONS,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from "./config";

const SUPABASE_AUTH_STORAGE_KEY = "crm_supabase_auth_session";

const NETWORK_ERROR_HINTS = [
  "failed to fetch",
  "networkerror",
  "network request failed",
  "load failed",
  "the internet connection appears to be offline",
  "connection reset",
  "connection refused",
  "timeout",
  "timed out",
  "aborterror",
];

export function isLikelyNetworkError(error) {
  if (!error) return false;
  if (error?.isNetworkError === true) return true;
  const name = String(error?.name || "").toLowerCase();
  if (name === "aborterror") return true;
  const message = String(error?.message || error || "").toLowerCase();
  return NETWORK_ERROR_HINTS.some((hint) => message.includes(hint));
}

function normalizeApiError(error) {
  if (isLikelyNetworkError(error)) {
    const wrapped = new Error("NETWORK_UNAVAILABLE");
    wrapped.isNetworkError = true;
    wrapped.cause = error;
    return wrapped;
  }
  if (error instanceof Error) return error;
  return new Error(String(error || "Ошибка API"));
}

function readStoredSupabaseSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.access_token) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

let supabaseAuthSession = readStoredSupabaseSession();
let supabaseRealtimeClient = null;

function persistSupabaseSession(session) {
  supabaseAuthSession = session && session.access_token ? session : null;
  if (supabaseRealtimeClient && supabaseAuthSession?.access_token) {
    supabaseRealtimeClient.realtime.setAuth(supabaseAuthSession.access_token);
  }
  if (typeof window === "undefined") return;
  try {
    if (supabaseAuthSession) {
      window.localStorage.setItem(SUPABASE_AUTH_STORAGE_KEY, JSON.stringify(supabaseAuthSession));
    } else {
      window.localStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
    }
  } catch (_) {
    // Ignore storage failures (private mode, quotas).
  }
}

function getSupabaseAccessToken() {
  return String(supabaseAuthSession?.access_token || "").trim();
}

function getSupabaseBaseUrl() {
  return String(SUPABASE_URL || "").replace(/\/$/, "");
}

export function getSupabaseAuthSession() {
  return supabaseAuthSession;
}

export function getSupabaseAuthUser() {
  return supabaseAuthSession?.user || null;
}

export function getSupabaseRealtimeClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!supabaseRealtimeClient) {
    supabaseRealtimeClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  if (supabaseAuthSession?.access_token) {
    supabaseRealtimeClient.realtime.setAuth(supabaseAuthSession.access_token);
  }
  return supabaseRealtimeClient;
}

async function supabaseAuthFetch(path, body, bearerToken = "") {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Заполните SUPABASE_URL и SUPABASE_ANON_KEY в src/config.js");
  }
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
  };
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }
  const res = await fetch(`${getSupabaseBaseUrl()}/auth/v1/${path}`, {
    method: "POST",
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = text;
  }
  if (!res.ok) {
    throw new Error(typeof json === "string" ? json : JSON.stringify(json));
  }
  return json;
}

export async function supabaseSignInWithPassword(email, password) {
  const payload = await supabaseAuthFetch("token?grant_type=password", { email, password });
  persistSupabaseSession(payload);
  return payload;
}

export async function supabaseSignOut() {
  const token = getSupabaseAccessToken();
  if (!token) {
    persistSupabaseSession(null);
    return;
  }
  try {
    await supabaseAuthFetch("logout", {}, token);
  } finally {
    persistSupabaseSession(null);
  }
}

export async function gasCall(action, payload = {}) {
  if (!GAS_WEBAPP_URL || GAS_WEBAPP_URL.includes("PASTE_YOUR_WEBAPP_URL_HERE")) {
    throw new Error("Задайте VITE_GAS_WEBAPP_URL (нужен для VITE_BACKEND_PROVIDER=gas|shadow или для гибридного дубля в Supabase).");
  }

  const gasUrl = new URL(GAS_WEBAPP_URL);
  const gasPath = gasUrl.pathname;
  const targetBase = import.meta.env.DEV
    ? `/gas${gasPath}`
    : `${gasUrl.origin}${gasPath}`;
  const qs = new URLSearchParams({
    action,
    payload: JSON.stringify(payload || {}),
  }).toString();
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${targetBase}?${qs}`, { method: "GET" });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (_) {
        throw new Error(`API вернул не JSON (${res.status}): ${text.slice(0, 120)}`);
      }
      if (!json.ok) throw new Error(json.error || "Ошибка API");
      return json.data;
    } catch (e) {
      lastError = e;
      const msg = String(e?.message || e);
      // При занятости lock пробуем автоматически еще раз.
      if (msg.includes("Система занята")) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      break;
    }
  }
  throw normalizeApiError(lastError || new Error("Ошибка API"));
}

export async function callBackend(action, payload = {}) {
  const provider = String(BACKEND_PROVIDER || "supabase").toLowerCase();
  const requestId = createRequestId();
  const payloadHash = hashPayload(payload);
  try {
    if (provider === "supabase") {
      if (!RPC_MAP[action]) {
        throw new Error(`Supabase RPC не настроен для action: ${action}`);
      }
      const result = await supabaseCall(action, payload);
      maybeDuplicateToGas(action, payload, { requestId, payloadHash });
      return result;
    }
    if (provider === "shadow") {
      // Shadow mode: read from GAS, duplicate writes to Supabase best-effort.
      const isWrite = /^webSet/.test(action) || [
        "webSendShipmentToWork",
        "webSendPlanksToWork",
        "webConsumeSheetsByOrderId",
      ].includes(action);
      if (isWrite) {
        supabaseCall(action, payload).catch(() => {});
      }
      return gasCall(action, payload);
    }
    return gasCall(action, payload);
  } catch (error) {
    const normalized = normalizeApiError(error);
    reportRpcEvent({
      status: "error",
      provider,
      action,
      requestId,
      payloadHash,
      error: String(normalized?.message || normalized),
    });
    throw normalized;
  }
}

function createRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = stableJson(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function hashPayload(payload) {
  const raw = JSON.stringify(stableJson(payload || {}));
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function reportHybridEvent(event) {
  reportRpcEvent({
    stream: "hybrid",
    ...event,
  });
}

function reportRpcEvent(event) {
  const enriched = {
    ts: new Date().toISOString(),
    ...event,
  };
  if (typeof window !== "undefined") {
    window.__CRM_RPC_EVENTS__ = window.__CRM_RPC_EVENTS__ || [];
    window.__CRM_RPC_EVENTS__.push(enriched);
    if (enriched.stream === "hybrid") {
      window.__CRM_HYBRID_LOGS__ = window.__CRM_HYBRID_LOGS__ || [];
      window.__CRM_HYBRID_LOGS__.push(enriched);
    }
  }
  const label = enriched.stream === "hybrid" ? "[CRM Hybrid]" : "[CRM RPC]";
  const printer =
    enriched.status === "error"
      ? console.error
      : enriched.status === "warn"
        ? console.warn
        : console.info;
  printer(label, enriched);
}

function maybeDuplicateToGas(action, payload, ctx) {
  const shouldDuplicate = HYBRID_DUPLICATE_ACTIONS.includes(action);
  if (!shouldDuplicate) return;
  if (!String(GAS_WEBAPP_URL || "").trim()) return;
  gasCall(action, payload)
    .then(() => {
      reportHybridEvent({
        status: "ok",
        mode: "supabase_primary_gas_duplicate",
        action,
        requestId: ctx.requestId,
        payloadHash: ctx.payloadHash,
      });
    })
    .catch((error) => {
      reportHybridEvent({
        status: "error",
        mode: "supabase_primary_gas_duplicate",
        action,
        requestId: ctx.requestId,
        payloadHash: ctx.payloadHash,
        error: String(error?.message || error),
      });
    });
}

const RPC_MAP = {
  webGetShipmentBoard: "web_get_shipment_board",
  webGetShipmentTable: "web_get_shipment_table",
  webGetOrdersAll: "web_get_orders_all",
  webGetOrdersPilka: "web_get_orders_pilka",
  webGetOrdersKromka: "web_get_orders_kromka",
  webGetOrdersPras: "web_get_orders_pras",
  webGetMaterialsStock: "web_get_materials_stock",
  webGetConsumeHistory: "web_get_consume_history",
  webGetSectionCatalog: "web_get_section_catalog",
  webGetSectionArticles: "web_get_section_articles",
  webGetArticlesForImport: "web_get_articles_for_import",
  webGetFurnitureProductArticles: "web_get_furniture_product_articles",
  webGetFurnitureDetailArticles: "web_get_furniture_detail_articles",
  webGetMetalForFurniture: "web_get_metal_for_furniture",
  webGetMetalStock: "web_get_metal_stock",
  webSetMetalStock: "web_set_metal_stock",
  webGetMetalWorkQueue: "web_get_metal_work_queue",
  webEnqueueMetalWorkOrder: "web_enqueue_metal_work_order",
  webSetMetalWorkQueueStatus: "web_set_metal_work_queue_status",
  webGetLeftovers: "web_get_leftovers",
  webGetLaborTable: "web_get_labor_table",
  webUpsertLaborFact: "web_upsert_labor_fact",
  webGetOrderStats: "web_get_order_stats",
  webGetMyRole: "web_effective_crm_role",
  webGetCrmAuthStrict: "web_is_crm_auth_strict",
  webGetCrmExecutors: "web_get_crm_executors",
  webGetWorkSchedule: "web_get_work_schedule",
  webSetCrmAuthStrict: "web_set_crm_auth_strict",
  webSetWorkSchedule: "web_set_work_schedule",
  webListCrmUserRoles: "web_list_crm_user_roles",
  webSetCrmUserRole: "web_set_crm_user_role",
  webRemoveCrmUserRole: "web_remove_crm_user_role",
  webGetAuditLog: "web_get_audit_log",
  webUpsertItemColorMap: "web_upsert_item_color_map",
  webGetConsumeOptions: "web_get_consume_options",
  webPreviewPlanFromShipment: "web_preview_plan_from_shipment",
  webPreviewPlansBatch: "web_preview_plans_batch",
  webCreateShipmentPlanCell: "web_create_shipment_plan_cell",
  webDeleteShipmentPlanCell: "web_delete_shipment_plan_cell_by_source",
  webDeleteOrderById: "web_delete_order_by_id",
  webSetOrderAdminComment: "web_set_order_admin_comment",
  webGetPlanCatalog: "web_get_plan_catalog",
  webSetPilkaInWork: "web_set_stage_in_work",
  webSetKromkaInWork: "web_set_stage_in_work",
  webSetPrasInWork: "web_set_stage_in_work",
  webSetPilkaDone: "web_set_stage_done",
  webSetKromkaDone: "web_set_stage_done",
  webSetPrasDone: "web_set_stage_done",
  webSetAssemblyDone: "web_set_stage_done",
  webSetShippingDone: "web_set_stage_done",
  webSetPilkaPause: "web_set_stage_pause",
  webSetKromkaPause: "web_set_stage_pause",
  webSetPrasPause: "web_set_stage_pause",
  webSendShipmentToWork: "web_send_shipment_to_work_by_source",
  webSendPlanksToWork: "web_send_planks_to_work",
  webConsumeSheetsByOrderId: "web_consume_sheets_by_order_id",
};

function stageFromAction(action) {
  if (action.includes("Pilka")) return "pilka";
  if (action.includes("Kromka")) return "kromka";
  if (action.includes("Pras")) return "pras";
  if (action.includes("Assembly")) return "assembly";
  if (action.includes("Shipping")) return "shipping";
  return "";
}

function buildRpcPayload(action, payload = {}) {
  if (/^webSet(Pilka|Kromka|Pras|Assembly|Shipping)(InWork|Done|Pause)?$/.test(action)) {
    const rpcPayload = {
      p_order_id: payload.orderId,
      p_stage: stageFromAction(action),
    };
    if (payload.executor != null && String(payload.executor).trim()) {
      rpcPayload.p_executor = String(payload.executor).trim();
    }
    return rpcPayload;
  }
  if (action === "webSendPlanksToWork") {
    return { p_items: payload.items || [] };
  }
  if (action === "webConsumeSheetsByOrderId") {
    return {
      p_order_id: payload.orderId,
      p_material: payload.material,
      p_qty: Number(payload.qty || 0),
    };
  }
  if (action === "webSendShipmentToWork") {
    return {
      p_row: payload.row != null ? String(payload.row) : null,
      p_col: payload.col != null ? String(payload.col) : null,
    };
  }
  if (action === "webGetConsumeOptions") {
    return { p_order_id: payload.orderId };
  }
  if (action === "webGetMetalForFurniture") {
    return {
      p_furniture_article: String(payload.furnitureArticle || payload.p_furniture_article || "").trim(),
    };
  }
  if (action === "webGetConsumeHistory") {
    return { p_limit: Number(payload.limit || payload.p_limit || 300) };
  }
  if (action === "webPreviewPlanFromShipment") {
    return {
      p_row: payload.row != null ? String(payload.row) : null,
      p_col: payload.col != null ? String(payload.col) : null,
    };
  }
  if (action === "webPreviewPlansBatch") {
    return {
      p_items: Array.isArray(payload.items)
        ? payload.items.map((x) => ({
            row: x?.row != null ? String(x.row) : null,
            col: x?.col != null ? String(x.col) : null,
          }))
        : [],
    };
  }
  if (action === "webCreateShipmentPlanCell") {
    return {
      p_section_name: String(payload.sectionName || "").trim() || null,
      p_item: String(payload.item || "").trim(),
      p_material: String(payload.material || "").trim() || null,
      p_week: String(payload.week || "").trim(),
      p_qty: Number(payload.qty || 0),
      p_article: String(payload.article || payload.productArticle || payload.p_article || "").trim() || null,
    };
  }
  if (action === "webDeleteOrderById") {
    return {
      p_order_id: String(payload.orderId || payload.p_order_id || "").trim(),
    };
  }
  if (action === "webSetOrderAdminComment") {
    return {
      p_order_id: String(payload.orderId || payload.p_order_id || "").trim(),
      p_comment: String(payload.text ?? payload.p_comment ?? "").trim(),
    };
  }
  if (action === "webSetMetalStock") {
    return {
      p_metal_article: String(payload.metalArticle || payload.p_metal_article || "").trim(),
      p_metal_name: String(payload.metalName || payload.p_metal_name || "").trim() || null,
      p_qty_available: Number(payload.qtyAvailable ?? payload.p_qty_available ?? 0),
    };
  }
  if (action === "webGetMetalWorkQueue") {
    return {
      p_status: String(payload.status || payload.p_status || "").trim() || null,
    };
  }
  if (action === "webEnqueueMetalWorkOrder") {
    return {
      p_source_row: String(payload.sourceRow || payload.p_source_row || "").trim(),
      p_source_col: String(payload.sourceCol || payload.p_source_col || "").trim(),
      p_item: String(payload.item || payload.p_item || "").trim(),
      p_week: String(payload.week || payload.p_week || "").trim() || null,
      p_qty: Number(payload.qty || payload.p_qty || 0),
      p_reason: String(payload.reason || payload.p_reason || "").trim() || null,
      p_shortage: payload.shortage || payload.p_shortage || [],
    };
  }
  if (action === "webSetMetalWorkQueueStatus") {
    return {
      p_id: Number(payload.id || payload.p_id || 0),
      p_status: String(payload.status || payload.p_status || "").trim(),
    };
  }
  if (action === "webUpsertItemColorMap") {
    return {
      p_item_name: String(payload.itemName || "").trim(),
      p_color_name: String(payload.colorName || "").trim(),
    };
  }
  if (action === "webUpsertLaborFact") {
    return {
      p_order_id: String(payload.orderId || payload.p_order_id || "").trim(),
      p_item: String(payload.item || payload.p_item || "").trim() || null,
      p_week: String(payload.week || payload.p_week || "").trim() || null,
      p_qty: Number(payload.qty || payload.p_qty || 0),
      p_pilka_min: Number(payload.pilkaMin || payload.p_pilka_min || 0),
      p_kromka_min: Number(payload.kromkaMin || payload.p_kromka_min || 0),
      p_pras_min: Number(payload.prasMin || payload.p_pras_min || 0),
      p_assembly_min: Number(payload.assemblyMin || payload.p_assembly_min || 0),
      p_date_finished: String(payload.dateFinished || payload.p_date_finished || "").trim() || null,
    };
  }
  if (action === "webSetCrmAuthStrict") {
    return {
      p_enabled: Boolean(payload.enabled),
    };
  }
  if (action === "webSetWorkSchedule") {
    return {
      p_hours_per_day: Number(payload.hoursPerDay ?? payload.p_hours_per_day ?? 8),
      p_working_days: Array.isArray(payload.workingDays || payload.p_working_days)
        ? (payload.workingDays || payload.p_working_days).map((x) => String(x || "").trim().toLowerCase()).filter(Boolean)
        : [],
      p_work_start: String(payload.workStart || payload.p_work_start || "08:00").trim(),
      p_work_end: String(payload.workEnd || payload.p_work_end || "18:00").trim(),
      p_lunch_start: String(payload.lunchStart || payload.p_lunch_start || "12:00").trim(),
      p_lunch_end: String(payload.lunchEnd || payload.p_lunch_end || "13:00").trim(),
    };
  }
  if (action === "webSetCrmUserRole") {
    return {
      p_user_id: String(payload.userId || payload.p_user_id || "").trim(),
      p_role: String(payload.role || payload.p_role || "").trim(),
      p_note: String(payload.note || payload.p_note || "").trim() || null,
    };
  }
  if (action === "webRemoveCrmUserRole") {
    return {
      p_user_id: String(payload.userId || payload.p_user_id || "").trim(),
    };
  }
  if (action === "webGetAuditLog") {
    return {
      p_limit: Number(payload.limit || payload.p_limit || 200),
      p_offset: Number(payload.offset || payload.p_offset || 0),
      p_action: String(payload.action || payload.p_action || "").trim() || null,
      p_entity: String(payload.entity || payload.p_entity || "").trim() || null,
    };
  }
  return payload || {};
}

export async function supabaseCall(action, payload = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Заполните SUPABASE_URL и SUPABASE_ANON_KEY в src/config.js");
  }
  const rpcName = RPC_MAP[action];
  if (!rpcName) {
    throw new Error(`Supabase RPC не настроен для action: ${action}`);
  }
  const url = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/${rpcName}`;
  const body = buildRpcPayload(action, payload);
  const callWithToken = async (bearerToken) => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${bearerToken || SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (_) {
      json = text;
    }
    return { res, json };
  };

  const currentToken = getSupabaseAccessToken();
  let res;
  let json;
  try {
    ({ res, json } = await callWithToken(currentToken));
  } catch (error) {
    throw normalizeApiError(error);
  }
  if (!res.ok && currentToken && isJwtExpiredError(json)) {
    // Stored session can silently expire; fall back to anon flow and keep UI alive.
    persistSupabaseSession(null);
    try {
      ({ res, json } = await callWithToken(""));
    } catch (error) {
      throw normalizeApiError(error);
    }
  }
  if (!res.ok) {
    throw new Error(typeof json === "string" ? json : JSON.stringify(json));
  }
  return json;
}

function isJwtExpiredError(payload) {
  if (payload == null) return false;
  if (typeof payload === "string") return payload.toLowerCase().includes("jwt expired");
  const message = String(
    payload?.message ||
      payload?.error_description ||
      payload?.error ||
      payload?.msg ||
      "",
  ).toLowerCase();
  return message.includes("jwt expired");
}
