import { BACKEND_PROVIDER, GAS_WEBAPP_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

export async function gasCall(action, payload = {}) {
  if (!GAS_WEBAPP_URL || GAS_WEBAPP_URL.includes("PASTE_YOUR_WEBAPP_URL_HERE")) {
    throw new Error("Заполните GAS_WEBAPP_URL в src/config.js");
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
  throw lastError || new Error("Ошибка API");
}

export async function callBackend(action, payload = {}) {
  const provider = String(BACKEND_PROVIDER || "gas").toLowerCase();
  if (provider === "supabase") {
    if (!RPC_MAP[action]) {
      throw new Error(`Supabase RPC не настроен для action: ${action}`);
    }
    return supabaseCall(action, payload);
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
}

const RPC_MAP = {
  webGetShipmentBoard: "web_get_shipment_board",
  webGetShipmentTable: "web_get_shipment_table",
  webGetOrdersAll: "web_get_orders_all",
  webGetOrdersPilka: "web_get_orders_pilka",
  webGetOrdersKromka: "web_get_orders_kromka",
  webGetOrdersPras: "web_get_orders_pras",
  webGetMaterialsStock: "web_get_materials_stock",
  webGetSectionCatalog: "web_get_section_catalog",
  webGetSectionArticles: "web_get_section_articles",
  webGetFurnitureProductArticles: "web_get_furniture_product_articles",
  webGetLeftovers: "web_get_leftovers",
  webGetLaborTable: "web_get_labor_table",
  webGetOrderStats: "web_get_order_stats",
  webUpsertItemColorMap: "web_upsert_item_color_map",
  webGetConsumeOptions: "web_get_consume_options",
  webPreviewPlanFromShipment: "web_preview_plan_from_shipment",
  webPreviewPlansBatch: "web_preview_plans_batch",
  webCreateShipmentPlanCell: "web_create_shipment_plan_cell",
  webDeleteShipmentPlanCell: "web_delete_shipment_plan_cell_by_source",
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
    };
  }
  if (action === "webUpsertItemColorMap") {
    return {
      p_item_name: String(payload.itemName || "").trim(),
      p_color_name: String(payload.colorName || "").trim(),
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
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
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
  if (!res.ok) {
    throw new Error(typeof json === "string" ? json : JSON.stringify(json));
  }
  return json;
}
