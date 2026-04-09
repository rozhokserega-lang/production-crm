export const GAS_WEBAPP_URL =
  import.meta.env.VITE_GAS_WEBAPP_URL ||
  "https://script.google.com/macros/s/AKfycbyJLC4u8eVOmhwcP-XbKa_IH608u-jaXtgjwkrgEP9IXUi9ckzcRkN7KJguUsQmIYZfkA/exec";
export const BACKEND_PROVIDER = (import.meta.env.VITE_BACKEND_PROVIDER || "gas").toLowerCase(); // gas | supabase | shadow
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
