const METAL_UI_PREFS_KEY = "crm_metal_process_ui_v1";

const SUB_VIEWS = new Set(["plan", "kanban", "production", "stats", "catalog"]);
const PRODUCTION_TABS = new Set(["laser", "saw", "bending", "welding", "painting", "done"]);

const DEFAULTS = {
  subView: "plan",
  productionTab: "laser",
};

export function readMetalUiPrefs() {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = JSON.parse(window.localStorage.getItem(METAL_UI_PREFS_KEY) || "{}");
    return {
      subView: SUB_VIEWS.has(raw.subView) ? raw.subView : DEFAULTS.subView,
      productionTab: PRODUCTION_TABS.has(raw.productionTab) ? raw.productionTab : DEFAULTS.productionTab,
    };
  } catch (_) {
    return { ...DEFAULTS };
  }
}

export function writeMetalUiPrefs(patch) {
  if (typeof window === "undefined") return;
  try {
    const prev = JSON.parse(window.localStorage.getItem(METAL_UI_PREFS_KEY) || "{}");
    window.localStorage.setItem(METAL_UI_PREFS_KEY, JSON.stringify({ ...prev, ...patch }));
  } catch (_) {
    // ignore storage errors
  }
}

export { SUB_VIEWS, PRODUCTION_TABS };
