import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function toBase64Url(input: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < input.length; i += 1) binary += String.fromCharCode(input[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function utf8(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

function normalizeName(raw: unknown): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

function toA1Column(n: number): string {
  let v = n;
  let out = "";
  while (v > 0) {
    const rem = (v - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    v = Math.floor((v - 1) / 26);
  }
  return out;
}

function toMoscowDayNumber(): number {
  const now = new Date();
  const day = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
  }).format(now);
  return Number(day);
}

function moscowTs(): string {
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

async function getGoogleAccessToken(): Promise<string> {
  const clientEmail = String(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL") || "").trim();
  const privateKeyRaw = String(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY") || "").trim();
  if (!clientEmail || !privateKeyRaw) throw new Error("Google service account env is not configured");

  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: nowSec - 30,
    exp: nowSec + 3600,
  };
  const signingInput = `${toBase64Url(utf8(JSON.stringify(header)))}.${toBase64Url(
    utf8(JSON.stringify(payload)),
  )}`;

  const pemBody = privateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, utf8(signingInput));
  const jwt = `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const tokenJson = await tokenResp.json().catch(() => ({}));
  if (!tokenResp.ok || !tokenJson?.access_token) {
    throw new Error(`Failed to obtain Google token: ${JSON.stringify(tokenJson)}`);
  }
  return String(tokenJson.access_token);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const sheetId = String(body?.sheetId || "").trim();
    const sheetName = String(body?.sheetName || "").trim();
    const orderId = String(body?.orderId || "").trim();
    const item = String(body?.item || "").trim();
    const material = String(body?.material || "").trim();
    const week = String(body?.week || "").trim();
    const qty = Number(body?.qty || 0);
    if (!sheetId || !sheetName || !material || !Number.isFinite(qty) || qty <= 0) {
      return new Response(JSON.stringify({ ok: false, error: "sheetId, sheetName, material and positive qty are required" }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const token = await getGoogleAccessToken();
    const headers = { Authorization: `Bearer ${token}` };

    const valuesResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(sheetName)}!A1:ZZ250?valueRenderOption=UNFORMATTED_VALUE`,
      { headers },
    );
    const valuesJson = await valuesResp.json().catch(() => ({}));
    if (!valuesResp.ok || !Array.isArray(valuesJson?.values)) {
      throw new Error(`Failed to load sheet values: ${JSON.stringify(valuesJson)}`);
    }
    const grid: unknown[][] = valuesJson.values;
    if (!grid.length) throw new Error("Sheet is empty");

    const day = toMoscowDayNumber();
    const headerRow = (grid[0] || []).map((v) => String(v ?? "").trim());
    let dayColIdx = -1;
    for (let i = 0; i < headerRow.length; i += 1) {
      if (Number(headerRow[i]) === day) {
        dayColIdx = i;
        break;
      }
    }
    if (dayColIdx < 0) throw new Error(`Day column ${day} not found in row 1`);

    const normMaterial = normalizeName(material);
    let materialRowIdx = -1;
    for (let r = 1; r < grid.length; r += 1) {
      const cellB = grid[r]?.[1];
      if (normalizeName(cellB) === normMaterial) {
        materialRowIdx = r;
        break;
      }
    }
    if (materialRowIdx < 0) throw new Error(`Material row not found: ${material}`);

    const currentRaw = grid[materialRowIdx]?.[dayColIdx];
    const current = Number(currentRaw ?? 0);
    const nextValue = (Number.isFinite(current) ? current : 0) + qty;

    const rowA1 = materialRowIdx + 1;
    const colA1 = toA1Column(dayColIdx + 1);
    const targetA1 = `${sheetName}!${colA1}${rowA1}`;

    const updateValueResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(targetA1)}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          range: targetA1,
          majorDimension: "ROWS",
          values: [[nextValue]],
        }),
      },
    );
    const updateValueJson = await updateValueResp.json().catch(() => ({}));
    if (!updateValueResp.ok) {
      throw new Error(`Failed to update cell value: ${JSON.stringify(updateValueJson)}`);
    }

    const metaResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}?fields=sheets(properties(sheetId,title))`,
      { headers },
    );
    const metaJson = await metaResp.json().catch(() => ({}));
    if (!metaResp.ok || !Array.isArray(metaJson?.sheets)) {
      throw new Error(`Failed to load sheet metadata: ${JSON.stringify(metaJson)}`);
    }
    const sheetMeta = metaJson.sheets.find((s: any) => String(s?.properties?.title || "") === sheetName);
    if (!sheetMeta?.properties?.sheetId) throw new Error(`Sheet not found by title: ${sheetName}`);
    const numericSheetId = Number(sheetMeta.properties.sheetId);

    const note = [
      `[${moscowTs()}] расход ${qty}`,
      `OrderID: ${orderId || "-"}`,
      `Изделие: ${item || "-"}`,
      `Материал: ${material}`,
      `Неделя: ${week || "-"}`,
    ].join("\n");

    const noteResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}:batchUpdate`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: numericSheetId,
                  startRowIndex: materialRowIdx,
                  endRowIndex: materialRowIdx + 1,
                  startColumnIndex: dayColIdx,
                  endColumnIndex: dayColIdx + 1,
                },
                cell: { note },
                fields: "note",
              },
            },
          ],
        }),
      },
    );
    const noteJson = await noteResp.json().catch(() => ({}));
    if (!noteResp.ok) {
      throw new Error(`Failed to set cell note: ${JSON.stringify(noteJson)}`);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        cell: targetA1,
        previous: Number.isFinite(current) ? current : 0,
        added: qty,
        value: nextValue,
      }),
      { status: 200, headers: CORS_HEADERS },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: CORS_HEADERS },
    );
  }
});
