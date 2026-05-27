export const CRM_SUPABASE_PROXY_PREF_KEY = "crm_supabase_use_proxy";
export const CRM_SUPABASE_PROXY_PREF_EVENT = "crm-supabase-proxy-pref-changed";

export function readSupabaseProxyEnabled() {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(CRM_SUPABASE_PROXY_PREF_KEY);
    if (raw === "0" || raw === "false") return false;
    return true;
  } catch (_) {
    return true;
  }
}

export function writeSupabaseProxyEnabled(enabled) {
  if (typeof window === "undefined") return;
  const next = Boolean(enabled);
  try {
    window.localStorage.setItem(CRM_SUPABASE_PROXY_PREF_KEY, next ? "1" : "0");
  } catch (_) {
    /* ignore storage failures */
  }
  try {
    window.dispatchEvent(new CustomEvent(CRM_SUPABASE_PROXY_PREF_EVENT, { detail: { enabled: next } }));
  } catch (_) {
    /* ignore */
  }
}
