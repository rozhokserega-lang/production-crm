/** Отдельные URL для режимов работы (SPA, nginx → index.html). */
export const CRM_PATH_SKLAD = "/sklad";

export function normalizeCrmPathname(pathname) {
  const raw = String(pathname || "/").trim();
  if (!raw || raw === "/") return "/";
  const withoutTrailing = raw.replace(/\/+$/, "") || "/";
  return withoutTrailing.toLowerCase();
}

/** view id или null, если путь не задаёт экран. */
export function readViewFromPathname(pathname) {
  const path = normalizeCrmPathname(pathname);
  if (path === CRM_PATH_SKLAD) return "warehouseMissing";
  return null;
}

/** Путь только для «выделенных» экранов; остальные живут на /. */
export function getDedicatedPathForView(view) {
  if (view === "warehouseMissing") return CRM_PATH_SKLAD;
  return null;
}

export function syncBrowserPathForView(view, { replace = false } = {}) {
  if (typeof window === "undefined") return;
  const dedicated = getDedicatedPathForView(view);
  const current = normalizeCrmPathname(window.location.pathname);
  if (dedicated) {
    if (current !== dedicated) {
      const fn = replace ? "replaceState" : "pushState";
      window.history[fn]({ crmView: view }, "", dedicated);
    }
    return;
  }
  if (current === CRM_PATH_SKLAD) {
    window.history.replaceState({ crmView: view }, "", "/");
  }
}

export function readInitialViewFromStorage() {
  if (typeof window === "undefined") return "shipment";
  try {
    const domain = window.localStorage.getItem("crm_work_domain_v1");
    if (domain === "metal") return "metalProcess";
    if (domain === "warehouse") return "warehouseMissing";
  } catch (_) {
    // ignore
  }
  return "shipment";
}
