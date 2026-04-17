const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || "").trim();

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("SUPABASE_URL and SUPABASE_ANON_KEY are required for RPC smoke.");
  process.exit(1);
}

const requiredRpcs = [
  "web_get_orders_all",
  "web_get_orders_pilka",
  "web_get_orders_kromka",
  "web_get_orders_pras",
  "web_get_labor_table",
];

async function callRpc(rpcName) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${rpcName} failed (${response.status}): ${text.slice(0, 300)}`);
  }

  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Keep nullable payload, we only need successful status.
  }

  const rows = Array.isArray(json) ? json.length : json == null ? 0 : 1;
  return { rpcName, rows };
}

async function main() {
  const report = [];
  for (const rpcName of requiredRpcs) {
    const result = await callRpc(rpcName);
    report.push(result);
    console.log(`[rpc-smoke] ${rpcName}: ok (${result.rows} rows)`);
  }
  console.log("[rpc-smoke] done", JSON.stringify(report));
}

main().catch((error) => {
  console.error("[rpc-smoke] failed:", error.message || error);
  process.exit(1);
});
