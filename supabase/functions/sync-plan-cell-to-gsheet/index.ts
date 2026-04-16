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

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
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

function quoteSheetNameForA1(name: string): string {
  const safe = String(name || "").replace(/'/g, "''");
  return `'${safe}'`;
}

function parseWeekToNumber(weekRaw: string): number | null {
  const digits = String(weekRaw || "").replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
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

  const signingInput = `${toBase64Url(utf8(JSON.stringify(header)))}.${toBase64Url(utf8(JSON.stringify(payload)))}`;

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

async function getArticleCodeFromSupabase(sectionName: string, item: string, material: string): Promise<string> {
  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const serviceRole = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!supabaseUrl || !serviceRole) throw new Error("Supabase env is not configured");

  const resp = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/web_get_section_articles`, {
    method: "POST",
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_section_name: sectionName }),
  });

  const json = await resp.json().catch(() => []);
  if (!resp.ok || !Array.isArray(json)) {
    throw new Error(`Failed to load section articles: ${JSON.stringify(json)}`);
  }

  const normItem = normalizeText(item);
  const normMaterial = normalizeText(material);

  const hit = json.find((r: any) => normalizeText(r?.item_name) === normItem && normalizeText(r?.material) === normMaterial);
  if (!hit?.article) {
    throw new Error(`Article not found for section='${sectionName}', item='${item}', material='${material}'`);
  }
  return String(hit.article);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405, headers: CORS_HEADERS });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const sheetId = String(body?.sheetId || "").trim();
    const gidRaw = String(body?.gid || "").trim();
    const sheetGid = Number(gidRaw);
    const sectionName = String(body?.sectionName || "").trim();
    const item = String(body?.item || "").trim();
    const material = String(body?.material || "").trim();
    const weekRaw = String(body?.week || "").trim();
    const qty = Number(body?.qty || 0);

    if (!sheetId || !Number.isFinite(sheetGid) || sheetGid <= 0) {
      return new Response(JSON.stringify({ ok: false, error: "sheetId and numeric gid are required" }), { status: 400, headers: CORS_HEADERS });
    }
    if (!sectionName || !item || !material || !weekRaw || !Number.isFinite(qty) || qty <= 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "sectionName, item, material, week and positive qty are required" }),
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const weekNum = parseWeekToNumber(weekRaw);
    if (weekNum == null) {
      return new Response(JSON.stringify({ ok: false, error: `Invalid week value: ${weekRaw}` }), { status: 400, headers: CORS_HEADERS });
    }

    const token = await getGoogleAccessToken();
    const authHeaders = { Authorization: `Bearer ${token}` };

    // Resolve target sheet title by gid.
    const metaResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}?fields=sheets(properties(sheetId,title))`,
      { headers: authHeaders },
    );
    const metaJson = await metaResp.json().catch(() => ({}));
    if (!metaResp.ok || !Array.isArray(metaJson?.sheets)) {
      throw new Error(`Failed to load sheet metadata: ${JSON.stringify(metaJson)}`);
    }

    const targetSheetMeta =
      metaJson.sheets.find((s: any) => Number(s?.properties?.sheetId || 0) === sheetGid) ||
      null;
    if (!targetSheetMeta?.properties?.title) {
      throw new Error(`Target sheet not found by gid=${sheetGid}`);
    }
    const targetSheetTitle = String(targetSheetMeta.properties.title).trim();

    // Find mapping sheet title by name hint.
    const mappingSheetMeta =
      metaJson.sheets.find((s: any) => normalizeText(s?.properties?.title).includes("соответ")) ||
      metaJson.sheets.find((s: any) => normalizeText(s?.properties?.title).includes("correspond")) ||
      null;

    const sheetA1 = quoteSheetNameForA1(targetSheetTitle);
    const gridResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(sheetA1)}!A1:ZZ500?valueRenderOption=UNFORMATTED_VALUE`,
      { headers: authHeaders },
    );
    const gridJson = await gridResp.json().catch(() => ({}));
    const grid: unknown[][] = Array.isArray(gridJson?.values) ? gridJson.values : [];
    if (!grid.length) throw new Error("Target sheet is empty");

    // Load qty mapping (article code) from Supabase.
    const articleCode = await getArticleCodeFromSupabase(sectionName, item, material);
    const normArticle = normalizeText(articleCode);

    // Determine week column index in row 1.
    const headerRow = (grid[0] || []).map((v) => String(v ?? "").trim());
    let weekColIdx = -1;
    for (let c = 0; c < headerRow.length; c += 1) {
      const headerCell = headerRow[c];
      const headerNum = parseWeekToNumber(headerCell);
      if (headerNum != null && headerNum === weekNum) {
        weekColIdx = c;
        break;
      }
    }
    if (weekColIdx < 0) {
      throw new Error(`Week column not found in row 1 for week=${weekRaw} (parsed=${weekNum})`);
    }

    // Determine row index: first try direct articleCode match.
    const normCell = (v: unknown) => normalizeText(String(v ?? ""));
    let targetRowIdx = -1;
    for (let r = 1; r < grid.length; r += 1) {
      const row = grid[r] || [];
      if (row.some((cell) => normCell(cell) === normArticle)) {
        targetRowIdx = r;
        break;
      }
    }

    // Fallback: if article_code is not present in target grid, use correspondence sheet to map.
    if (targetRowIdx < 0) {
      if (!mappingSheetMeta?.properties?.title) {
        throw new Error("Correspondence sheet not found (title should contain 'соответ'/'correspond')");
      }

      const mappingTitle = String(mappingSheetMeta.properties.title).trim();
      const mappingSheetA1 = quoteSheetNameForA1(mappingTitle);

      const mappingResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(mappingSheetA1)}!A1:ZZ500?valueRenderOption=UNFORMATTED_VALUE`,
        { headers: authHeaders },
      );
      const mappingJson = await mappingResp.json().catch(() => ({}));
      const mappingGrid: unknown[][] = Array.isArray(mappingJson?.values) ? mappingJson.values : [];
      if (!mappingGrid.length) throw new Error("Correspondence sheet is empty");

      let mappingRowIdx = -1;
      let mappingRow: unknown[] = [];
      for (let r = 1; r < mappingGrid.length; r += 1) {
        const row = mappingGrid[r] || [];
        if (row.some((cell) => normCell(cell) === normArticle)) {
          mappingRowIdx = r;
          mappingRow = row;
          break;
        }
      }
      if (mappingRowIdx < 0) {
        throw new Error(`Article not found in correspondence sheet: ${articleCode}`);
      }

      const normItem = normalizeText(item);
      const normMaterial = normalizeText(material);

      let label = "";
      for (const cell of mappingRow) {
        if (!cell) continue;
        if (normCell(cell) === normItem) {
          label = String(cell);
          break;
        }
      }
      if (!label) {
        for (const cell of mappingRow) {
          if (!cell) continue;
          if (normCell(cell) === normMaterial) {
            label = String(cell);
            break;
          }
        }
      }
      if (!label) {
        const firstNonEmpty = mappingRow.find((c) => String(c ?? "").trim() !== "");
        label = firstNonEmpty ? String(firstNonEmpty) : "";
      }
      if (!label.trim()) throw new Error("Failed to derive target row label from correspondence sheet");

      const normLabel = normalizeText(label);
      // Search label in target grid (exact match, then includes match).
      for (let r = 1; r < grid.length; r += 1) {
        const row = grid[r] || [];
        if (row.some((cell) => normCell(cell) === normLabel)) {
          targetRowIdx = r;
          break;
        }
      }
      if (targetRowIdx < 0) {
        for (let r = 1; r < grid.length; r += 1) {
          const row = grid[r] || [];
          if (row.some((cell) => normCell(cell).includes(normLabel) && normLabel.length >= 3)) {
            targetRowIdx = r;
            break;
          }
        }
      }
      if (targetRowIdx < 0) {
        throw new Error(`Row not found in target sheet for label='${label}' (article=${articleCode})`);
      }
    }

    const rowA1 = targetRowIdx + 1;
    const colA1 = toA1Column(weekColIdx + 1);
    const targetCell = `${sheetA1}!${colA1}${rowA1}`;

    const updateResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(targetCell)}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: [[qty]] }),
      },
    );

    const updateJson = await updateResp.json().catch(() => ({}));
    if (!updateResp.ok) {
      throw new Error(`Failed to update cell: ${JSON.stringify(updateJson)}`);
    }

    return new Response(JSON.stringify({ ok: true, updatedAt: new Date().toISOString(), targetCell, qty, week: weekRaw, articleCode }), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: CORS_HEADERS },
    );
  }
});

