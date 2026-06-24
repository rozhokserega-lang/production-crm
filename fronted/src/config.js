/** Только из env. */
const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const supabaseAnon = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
const supabaseProxyUrl = String(import.meta.env.VITE_SUPABASE_PROXY_URL || "").trim();
const supabaseDirectUrl = String(import.meta.env.VITE_SUPABASE_DIRECT_URL || "").trim();

export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnon;
export const SUPABASE_PROXY_URL = supabaseProxyUrl;
export const SUPABASE_DIRECT_URL = supabaseDirectUrl;

function parseListEnv(name, fallback) {
  const raw = String(import.meta.env[name] || "").trim();
  if (!raw) return fallback;
  const parsed = raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

export const KROMKA_EXECUTORS = parseListEnv("VITE_KROMKA_EXECUTORS", ["Слава", "Сережа"]);
export const PRAS_EXECUTORS = parseListEnv("VITE_PRAS_EXECUTORS", ["Леха", "Виталик"]);
export const ALL_EXECUTORS = Array.from(new Set([...KROMKA_EXECUTORS, ...PRAS_EXECUTORS]));
