/** Только из env. */
const supabaseUrl: string = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const supabaseAnon: string = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

export const SUPABASE_URL: string = supabaseUrl;
export const SUPABASE_ANON_KEY: string = supabaseAnon;

function parseListEnv(name: string, fallback: string[]): string[] {
  const raw: string = String(import.meta.env[name] || "").trim();
  if (!raw) return fallback;
  const parsed: string[] = raw
    .split(",")
    .map((x: string) => x.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

export const KROMKA_EXECUTORS: string[] = parseListEnv("VITE_KROMKA_EXECUTORS", ["Слава", "Сережа"]);
export const PRAS_EXECUTORS: string[] = parseListEnv("VITE_PRAS_EXECUTORS", ["Леха", "Виталик"]);
export const ALL_EXECUTORS: string[] = Array.from(new Set([...KROMKA_EXECUTORS, ...PRAS_EXECUTORS]));

/** GID листа Google Sheet для вкладки «Google Mirror» (`webGetSheetOrdersMirror`). */
export const SHEET_MIRROR_GID: string = String(import.meta.env.VITE_SHEET_MIRROR_GID || "1772676601").trim();
