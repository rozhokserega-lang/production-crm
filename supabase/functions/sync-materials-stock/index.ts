import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const NORMALIZE_MAP: Record<string, string> = {
  "мрамор кристал": "мрамор кристалл",
  "слоновья кость": "слоновая кость",
  "бардолино": "сонома / бардолино",
  "сонома\\бардолино темная": "сонома / бардолино темная",
};

function normalizeMaterial(raw: unknown): string {
  const prepared = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return NORMALIZE_MAP[prepared] || prepared;
}

function parseQty(raw: unknown): number | null {
  const prepared = String(raw ?? "").trim().replace(",", ".");
  if (!prepared) return null;
  const value = Number(prepared);
  if (!Number.isFinite(value)) return null;
  return value;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseLeftoversRow(cells: string[]): { material: string; leftover_format: string; leftovers_qty: number } | null {
  // Preferred format from "Остатки" export:
  // updated_at_utc | order_id | item | material | leftover_format | leftovers_qty
  const qty6 = cells.length >= 6 ? parseQty(cells[5]) : null;
  if (qty6 !== null) {
    const material = normalizeMaterial(cells[3]);
    const leftover_format = String(cells[4] || "").trim();
    if (!material || !leftover_format) return null;
    return { material, leftover_format, leftovers_qty: Number(qty6.toFixed(2)) };
  }
  // Compact manual format:
  // material | leftover_format | leftovers_qty
  const qty3 = cells.length >= 3 ? parseQty(cells[2]) : null;
  if (qty3 !== null) {
    const material = normalizeMaterial(cells[0]);
    const leftover_format = String(cells[1] || "").trim();
    if (!material || !leftover_format) return null;
    return { material, leftover_format, leftovers_qty: Number(qty3.toFixed(2)) };
  }
  return null;
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
    const gid = String(body?.gid || "").trim();
    const leftoversGid = String(body?.leftoversGid || "").trim();
    if (!sheetId || !gid) {
      return new Response(JSON.stringify({ ok: false, error: "sheetId and gid are required" }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
    const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ ok: false, error: "Supabase env is not configured" }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    const csvUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv&gid=${encodeURIComponent(gid)}`;
    const csvResp = await fetch(csvUrl);
    if (!csvResp.ok) {
      return new Response(JSON.stringify({ ok: false, error: `Google sheet request failed: ${csvResp.status}` }), {
        status: 502,
        headers: CORS_HEADERS,
      });
    }

    const csvText = await csvResp.text();
    const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const byMaterial = new Map<string, number>();
    for (const line of lines) {
      const cells = parseCsvLine(line);
      if (cells.length < 5) continue;
      const material = normalizeMaterial(cells[3]); // D
      const qty = parseQty(cells[4]); // E
      if (!material || qty === null) continue;
      byMaterial.set(material, qty);
    }

    const rows = [...byMaterial.entries()].map(([material, qty_sheets]) => ({
      material,
      qty_sheets: Number(qty_sheets.toFixed(2)),
      updated_at: new Date().toISOString(),
    }));
    if (!rows.length) {
      return new Response(JSON.stringify({ ok: false, error: "No rows parsed from sheet" }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const restResp = await fetch(`${supabaseUrl}/rest/v1/materials_stock?on_conflict=material`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    });
    if (!restResp.ok) {
      const errText = await restResp.text().catch(() => "");
      return new Response(JSON.stringify({ ok: false, error: "Upsert failed", details: errText }), {
        status: 502,
        headers: CORS_HEADERS,
      });
    }

    let leftoversSynced = 0;
    if (leftoversGid) {
      const leftoversCsvUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv&gid=${encodeURIComponent(leftoversGid)}`;
      const leftoversResp = await fetch(leftoversCsvUrl);
      if (!leftoversResp.ok) {
        return new Response(
          JSON.stringify({ ok: false, error: `Leftovers sheet request failed: ${leftoversResp.status}` }),
          { status: 502, headers: CORS_HEADERS },
        );
      }
      const leftoversText = await leftoversResp.text();
      const leftoversLines = leftoversText.split(/\r?\n/).filter((line) => line.trim().length > 0);
      const leftoversMap = new Map<string, { material: string; leftover_format: string; leftovers_qty: number }>();
      for (const line of leftoversLines) {
        const cells = parseCsvLine(line);
        const parsed = parseLeftoversRow(cells);
        if (!parsed) continue;
        const key = `${parsed.material}|${parsed.leftover_format}`;
        leftoversMap.set(key, parsed);
      }

      const leftoversRows = [...leftoversMap.values()].map((x) => ({
        order_id: `sync-leftovers:${x.material}:${x.leftover_format}`,
        item: "manual sync",
        material: x.material,
        sheets_needed: 0,
        leftover_format: x.leftover_format,
        leftovers_qty: x.leftovers_qty,
        created_at: new Date().toISOString(),
      }));

      const clearResp = await fetch(
        `${supabaseUrl}/rest/v1/materials_leftovers?order_id=like.${encodeURIComponent("sync-leftovers:%")}`,
        {
          method: "DELETE",
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            Prefer: "return=minimal",
          },
        },
      );
      if (!clearResp.ok) {
        const clearErr = await clearResp.text().catch(() => "");
        return new Response(JSON.stringify({ ok: false, error: "Failed to clear synced leftovers", details: clearErr }), {
          status: 502,
          headers: CORS_HEADERS,
        });
      }

      if (leftoversRows.length > 0) {
        const leftoversUpsertResp = await fetch(
          `${supabaseUrl}/rest/v1/materials_leftovers?on_conflict=order_id,leftover_format`,
          {
            method: "POST",
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
              Prefer: "resolution=merge-duplicates,return=minimal",
            },
            body: JSON.stringify(leftoversRows),
          },
        );
        if (!leftoversUpsertResp.ok) {
          const leftoversErr = await leftoversUpsertResp.text().catch(() => "");
          return new Response(
            JSON.stringify({ ok: false, error: "Failed to upsert leftovers", details: leftoversErr }),
            { status: 502, headers: CORS_HEADERS },
          );
        }
      }
      leftoversSynced = leftoversRows.length;
    }

    return new Response(JSON.stringify({ ok: true, synced: rows.length, leftoversSynced }), {
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

