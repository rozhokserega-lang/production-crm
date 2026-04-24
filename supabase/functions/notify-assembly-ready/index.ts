import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type Payload = {
  stage?: string;
  orderId?: string;
  item?: string;
  material?: string;
  week?: string | number;
  qty?: string | number;
  executor?: string;
};

type TelegramCallbackQuery = {
  id?: string;
  data?: string;
  message?: {
    message_id?: number;
    chat?: { id?: number | string };
  };
};

type TelegramUpdate = {
  callback_query?: TelegramCallbackQuery;
};

function toText(v: unknown): string {
  return String(v ?? "").trim();
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function moscowNow(): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

async function telegramBotRequest(token: string, method: string, body: Record<string, unknown>) {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function markAssemblyDone(orderId: string) {
  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim().replace(/\/$/, "");
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin env is missing: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/web_set_stage_done`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_order_id: orderId,
      p_stage: "assembly",
    }),
  });
  if (!rpcRes.ok) {
    const body = await rpcRes.text().catch(() => "");
    throw new Error(`RPC web_set_stage_done failed: HTTP ${rpcRes.status} ${body}`.trim());
  }
}

function buildAssemblyButton(orderId: string) {
  return {
    inline_keyboard: [[{ text: "✅ Собрано", callback_data: `assembly_done:${orderId}` }]],
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? "Unknown error");
}

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }

  const token = String(Deno.env.get("TELEGRAM_BOT_TOKEN") || "").trim();
  const chatId = String(Deno.env.get("TELEGRAM_CHAT_ID") || "").trim();
  if (!token || !chatId) {
    return new Response(
      JSON.stringify({
        ok: false,
        error:
          "Telegram not configured: set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID for this Edge Function (Dashboard → Edge Functions → Secrets).",
      }),
      { status: 500, headers: corsHeaders },
    );
  }

  let incoming: Payload | TelegramUpdate = {};
  try {
    incoming = (await req.json()) as Payload | TelegramUpdate;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON payload" }), { status: 400, headers: corsHeaders });
  }

  const callback = (incoming as TelegramUpdate).callback_query;
  if (callback && typeof callback === "object") {
    const configuredWebhookSecret = String(Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "").trim();
    if (configuredWebhookSecret) {
      const got = String(req.headers.get("x-telegram-bot-api-secret-token") || "").trim();
      if (got !== configuredWebhookSecret) {
        return new Response(JSON.stringify({ ok: false, error: "Invalid Telegram webhook secret." }), {
          status: 401,
          headers: corsHeaders,
        });
      }
    }
    const callbackId = toText(callback.id);
    const data = toText(callback.data);
    const prefix = "assembly_done:";
    if (!callbackId || !data.startsWith(prefix)) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), { status: 200, headers: corsHeaders });
    }
    const orderId = data.slice(prefix.length).trim();
    if (!orderId) {
      await telegramBotRequest(token, "answerCallbackQuery", {
        callback_query_id: callbackId,
        text: "Не удалось определить заказ.",
        show_alert: true,
      });
      return new Response(JSON.stringify({ ok: false, error: "Order id is missing in callback." }), { status: 400, headers: corsHeaders });
    }
    try {
      await markAssemblyDone(orderId);
      await telegramBotRequest(token, "answerCallbackQuery", {
        callback_query_id: callbackId,
        text: "Заказ переведен в финал.",
      });
      const chatFromMessage = callback.message?.chat?.id;
      const messageId = callback.message?.message_id;
      if (chatFromMessage != null && Number.isFinite(Number(messageId))) {
        await telegramBotRequest(token, "editMessageReplyMarkup", {
          chat_id: chatFromMessage,
          message_id: Number(messageId),
          reply_markup: { inline_keyboard: [] },
        });
      }
      return new Response(JSON.stringify({ ok: true, orderId }), { status: 200, headers: corsHeaders });
    } catch (error) {
      await telegramBotRequest(token, "answerCallbackQuery", {
        callback_query_id: callbackId,
        text: "Не удалось перевести заказ в финал.",
        show_alert: true,
      });
      return new Response(JSON.stringify({ ok: false, error: toErrorMessage(error) }), {
        status: 500,
        headers: corsHeaders,
      });
    }
  }

  const payload = incoming as Payload;
  const orderId = toText(payload.orderId);
  const stage = toText(payload.stage).toLowerCase();
  const item = toText(payload.item);
  const material = toText(payload.material) || "—";
  const week = toText(payload.week);
  const qty = Number(payload.qty || 0);
  const executor = toText(payload.executor);
  if (!orderId || !item) {
    return new Response(JSON.stringify({ ok: false, error: "orderId and item are required" }), { status: 400, headers: corsHeaders });
  }

  const title = stage === "final_done"
    ? "✅ <b>СОБРАНО</b>"
    : "✅ <b>ЗАКАЗ ГОТОВ К СБОРКЕ!</b>";
  const executorLabel = stage === "final_done" ? "👷 Ответственный" : "🔧 Присадка выполнена";
  const message =
    `${title}\n\n` +
    `📦 Изделие: <b>${escapeHtml(item)}</b>\n` +
    `🎨 Материал: <b>${escapeHtml(material)}</b>\n` +
    `📅 Неделя: <b>${escapeHtml(week || "-")}</b>\n` +
    `🔢 Количество: <b>${Number.isFinite(qty) ? qty : 0} шт</b>\n` +
    `${executorLabel}: <b>${escapeHtml(executor || "-")}</b>\n` +
    `⏰ Время: <b>${escapeHtml(moscowNow())}</b>\n` +
    `🆔 ID: <code>${escapeHtml(orderId)}</code>`;

  const sendBody: Record<string, unknown> = {
    chat_id: chatId,
    text: message,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (stage !== "final_done") {
    sendBody.reply_markup = buildAssemblyButton(orderId);
  }
  const tgRes = await telegramBotRequest(token, "sendMessage", sendBody);
  const tgJson = await tgRes.json().catch(() => ({}));
  if (!tgRes.ok || !tgJson?.ok) {
    return new Response(JSON.stringify({ ok: false, telegram: tgJson }), { status: 502, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ ok: true, messageId: tgJson?.result?.message_id ?? null }), { status: 200, headers: corsHeaders });
});

