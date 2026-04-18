/** Только из env. Раньше здесь был захардкоженный URL Web App — убран, чтобы не слать данные в чужой скрипт. */
export const GAS_WEBAPP_URL = String(import.meta.env.VITE_GAS_WEBAPP_URL || "").trim();

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const supabaseAnon = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnon);
const explicitProviderRaw = String(import.meta.env.VITE_BACKEND_PROVIDER || "").trim().toLowerCase();
const isProd = Boolean(import.meta.env.PROD);

function resolveBackendProvider() {
  if (explicitProviderRaw) {
    return explicitProviderRaw;
  }
  const inferred = hasSupabaseEnv ? "supabase" : "gas";
  if (isProd && typeof console !== "undefined" && console.warn) {
    console.warn(
      "[config] VITE_BACKEND_PROVIDER не задан; для production лучше задать явно (gas|supabase|shadow). " +
        `Сейчас используется вывод по окружению: "${inferred}".`
    );
  }
  return inferred;
}

/**
 * gas | supabase | shadow.
 * Целевой режим: supabase; gas/shadow — совместимость и аварийный fallback ниже.
 */
let backendProvider = resolveBackendProvider();

if (!["gas", "supabase", "shadow"].includes(backendProvider)) {
  throw new Error(`Неподдерживаемый VITE_BACKEND_PROVIDER: ${backendProvider}`);
}

if ((backendProvider === "supabase" || backendProvider === "shadow") && !hasSupabaseEnv) {
  if (backendProvider === "supabase" && explicitProviderRaw === "supabase") {
    if (typeof console !== "undefined" && console.error) {
      console.error(
        "[config] VITE_BACKEND_PROVIDER=supabase, но VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY пусты или неверны. " +
          "Исправьте fronted/.env.production и пересоберите npm run build."
      );
    }
    if (String(GAS_WEBAPP_URL || "").trim()) {
      backendProvider = "gas";
    }
  } else {
    throw new Error(
      "Для VITE_BACKEND_PROVIDER=supabase|shadow требуются VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY."
    );
  }
}

export const BACKEND_PROVIDER = backendProvider;

export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnon;

if ((BACKEND_PROVIDER === "gas" || BACKEND_PROVIDER === "shadow") && !String(GAS_WEBAPP_URL || "").trim()) {
  throw new Error("Для VITE_BACKEND_PROVIDER=gas|shadow требуется VITE_GAS_WEBAPP_URL.");
}

/**
 * Дублирование части RPC в Google Apps Script (legacy).
 * По умолчанию выключено: только Supabase. Чтобы снова включить дубли, задайте
 * VITE_HYBRID_DUPLICATE_ACTIONS=webSetPilkaDone,... и VITE_GAS_WEBAPP_URL.
 */
const hybridActionsRaw = String(import.meta.env.VITE_HYBRID_DUPLICATE_ACTIONS || "").trim();

export const HYBRID_DUPLICATE_ACTIONS = hybridActionsRaw
  ? hybridActionsRaw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
  : [];

/** GID листа Google Sheet для вкладки «Google Mirror» (`webGetSheetOrdersMirror`). */
export const SHEET_MIRROR_GID = String(import.meta.env.VITE_SHEET_MIRROR_GID || "1772676601").trim();
