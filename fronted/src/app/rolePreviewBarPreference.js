export const CRM_ROLE_PREVIEW_BAR_PREF_KEY = "crm_admin_role_preview_bar_enabled";
export const CRM_ROLE_PREVIEW_BAR_PREF_EVENT = "crm-role-preview-bar-pref-changed";

export function readRolePreviewBarEnabled() {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(CRM_ROLE_PREVIEW_BAR_PREF_KEY);
    if (raw === "0" || raw === "false") return false;
    return true;
  } catch (_) {
    return true;
  }
}

export function writeRolePreviewBarEnabled(enabled) {
  if (typeof window === "undefined") return;
  const next = Boolean(enabled);
  try {
    window.localStorage.setItem(CRM_ROLE_PREVIEW_BAR_PREF_KEY, next ? "1" : "0");
  } catch (_) {
    /* ignore storage failures */
  }
  try {
    window.dispatchEvent(new CustomEvent(CRM_ROLE_PREVIEW_BAR_PREF_EVENT, { detail: { enabled: next } }));
  } catch (_) {
    /* ignore */
  }
}
