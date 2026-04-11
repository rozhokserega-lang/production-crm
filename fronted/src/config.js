export const GAS_WEBAPP_URL =
  import.meta.env.VITE_GAS_WEBAPP_URL ||
  "https://script.google.com/macros/s/AKfycbyJLC4u8eVOmhwcP-XbKa_IH608u-jaXtgjwkrgEP9IXUi9ckzcRkN7KJguUsQmIYZfkA/exec";

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const supabaseAnon = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnon);

/** gas | supabase | shadow — явно задайте VITE_BACKEND_PROVIDER или подставьте URL+ключ Supabase. */
export const BACKEND_PROVIDER = String(
  import.meta.env.VITE_BACKEND_PROVIDER || (hasSupabaseEnv ? "supabase" : "gas")
).toLowerCase();

export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnon;
