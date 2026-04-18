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

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

  let payload: Payload = {};
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON payload" }), { status: 400, headers: corsHeaders });
  }

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

  const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  const tgJson = await tgRes.json().catch(() => ({}));
  if (!tgRes.ok || !tgJson?.ok) {
    return new Response(JSON.stringify({ ok: false, telegram: tgJson }), { status: 502, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ ok: true, messageId: tgJson?.result?.message_id ?? null }), { status: 200, headers: corsHeaders });
});

