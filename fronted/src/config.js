export const GAS_WEBAPP_URL =
  import.meta.env.VITE_GAS_WEBAPP_URL ||
  "https://script.google.com/macros/s/AKfycbyJLC4u8eVOmhwcP-XbKa_IH608u-jaXtgjwkrgEP9IXUi9ckzcRkN7KJguUsQmIYZfkA/exec";

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const supabaseAnon = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnon);
const explicitProviderRaw = String(import.meta.env.VITE_BACKEND_PROVIDER || "").trim().toLowerCase();
const isProd = Boolean(import.meta.env.PROD);

function resolveBackendProvider() {
  if (explicitProviderRaw) {
    return explicitProviderRaw;
  }
  if (isProd) {
    throw new Error(
      "VITE_BACKEND_PROVIDER обязателен для production-сборки (допустимо: gas|supabase|shadow)."
    );
  }
  return hasSupabaseEnv ? "supabase" : "gas";
}

/** gas | supabase | shadow — в production режим задается только явно через VITE_BACKEND_PROVIDER. */
export const BACKEND_PROVIDER = resolveBackendProvider();

export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnon;

if (!["gas", "supabase", "shadow"].includes(BACKEND_PROVIDER)) {
  throw new Error(`Неподдерживаемый VITE_BACKEND_PROVIDER: ${BACKEND_PROVIDER}`);
}

if ((BACKEND_PROVIDER === "supabase" || BACKEND_PROVIDER === "shadow") && !hasSupabaseEnv) {
  throw new Error(
    "Для VITE_BACKEND_PROVIDER=supabase|shadow требуются VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY."
  );
}

if ((BACKEND_PROVIDER === "gas" || BACKEND_PROVIDER === "shadow") && !String(GAS_WEBAPP_URL || "").trim()) {
  throw new Error("Для VITE_BACKEND_PROVIDER=gas|shadow требуется VITE_GAS_WEBAPP_URL.");
}

const defaultHybridActions = [
  "webSetPilkaDone",
  "webSetKromkaDone",
  "webSetPrasDone",
  "webSetAssemblyDone",
  "webSetShippingDone",
  "webSendShipmentToWork",
  "webConsumeSheetsByOrderId",
];

const hybridActionsRaw = String(import.meta.env.VITE_HYBRID_DUPLICATE_ACTIONS || "").trim();

export const HYBRID_DUPLICATE_ACTIONS = hybridActionsRaw
  ? hybridActionsRaw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
  : defaultHybridActions;
