import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function toBase64Url(input: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < input.length; i += 1) {
    binary += String.fromCharCode(input[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function utf8(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

async function getGoogleAccessToken(): Promise<string> {
  const clientEmail = String(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL") || "").trim();
  const privateKeyRaw = String(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY") || "").trim();
  if (!clientEmail || !privateKeyRaw) {
    throw new Error("Google service account env is not configured");
  }

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
    throw new Error(`Failed to obtain Google access token: ${JSON.stringify(tokenJson)}`);
  }
  return String(tokenJson.access_token);
}

async function loadLeftoversRows(): Promise<Array<Record<string, unknown>>> {
  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const serviceRole = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!supabaseUrl || !serviceRole) {
    throw new Error("Supabase env is not configured");
  }

  const resp = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/web_get_leftovers`, {
    method: "POST",
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const json = await resp.json().catch(() => []);
  if (!resp.ok || !Array.isArray(json)) {
    throw new Error(`Failed to load leftovers: ${JSON.stringify(json)}`);
  }
  return json as Array<Record<string, unknown>>;
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
    const gidRaw = String(body?.gid || "").trim();
    const gid = Number(gidRaw);
    if (!sheetId || !Number.isFinite(gid)) {
      return new Response(JSON.stringify({ ok: false, error: "sheetId and numeric gid are required" }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const leftovers = await loadLeftoversRows();
    const exportedAt = new Date().toISOString();
    const values = [
      ["updated_at_utc", "order_id", "item", "material", "leftover_format", "leftovers_qty"],
      ...leftovers.map((row) => [
        String(row.created_at || exportedAt),
        String(row.order_id || row.orderId || ""),
        String(row.item || ""),
        String(row.material || ""),
        String(row.leftover_format || row.leftoverFormat || ""),
        Number(row.leftovers_qty ?? row.leftoversQty ?? 0),
      ]),
    ];

    const token = await getGoogleAccessToken();
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const clearResp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values:batchClearByDataFilter`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        dataFilters: [{ gridRange: { sheetId: gid } }],
      }),
    });
    if (!clearResp.ok) {
      const clearText = await clearResp.text().catch(() => "");
      throw new Error(`Failed to clear leftovers sheet: ${clearText}`);
    }

    const updateResp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values:batchUpdateByDataFilter`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: [
          {
            dataFilter: {
              gridRange: {
                sheetId: gid,
                startRowIndex: 0,
                startColumnIndex: 0,
              },
            },
            majorDimension: "ROWS",
            values,
          },
        ],
      }),
    });
    const updateJson = await updateResp.json().catch(() => ({}));
    if (!updateResp.ok) {
      throw new Error(`Failed to write leftovers sheet: ${JSON.stringify(updateJson)}`);
    }

    return new Response(JSON.stringify({ ok: true, synced: leftovers.length }), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: CORS_HEADERS },
    );
  }
});
