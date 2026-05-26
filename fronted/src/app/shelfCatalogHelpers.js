export const GX_SHELF_CATALOG_STORAGE_KEY = "crm_gx_shelf_catalog_custom_v1";

export const SHELF_COLOR_SUGGESTIONS = ["Вотан", "Сонома", "Бардолино", "Не определен"];
export const SHELF_COLOR_ORDER = ["Вотан", "Сонома", "Бардолино", "Не определен"];

export function inferShelfColorFromItem(item) {
  const code = String(item?.primary?.code || "").toUpperCase();
  const name = String(item?.primary?.name || "").toLowerCase();
  if (code.includes("BVO") || name.includes("вотан")) return "Вотан";
  if (code.includes("WOS") || name.includes("сонома")) return "Сонома";
  if (name.includes("бардолино")) return "Бардолино";
  return "Не определен";
}

export function resolveShelfColor(item) {
  const explicit = String(item?.color || "").trim();
  if (explicit) return explicit;
  return inferShelfColorFromItem(item);
}

export function sortShelfColors(colors = []) {
  const unique = [...new Set(colors.filter(Boolean))];
  return unique.sort((a, b) => {
    const ia = SHELF_COLOR_ORDER.indexOf(a);
    const ib = SHELF_COLOR_ORDER.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return String(a).localeCompare(String(b), "ru", { sensitivity: "base" });
  });
}

export const DEFAULT_GX_SHELF_CATALOG = [
  { primary: { code: "GXss2-900hBVO", name: "Система хранения. 2 секции 900 мм. 3 полки с вешалкой. Чёрная. Дуб вотан" }, pairs: [{ text: "полка 887x340", qty: 4 }, { text: "полка 887x330", qty: 2 }] },
  { primary: { code: "GXss2-900hWOS", name: "Система хранения. 2 секции 900 мм. 3 полки с вешалкой. Белая. Дуб сонома" }, pairs: [{ text: "полка 887x340", qty: 4 }, { text: "полка 887x330", qty: 2 }] },
  { primary: { code: "GXss1-900BVO", name: "Система хранения. 1 секция 900 мм. 5 полок. Чёрная. Дуб вотан" }, pairs: [{ text: "полка 887x340", qty: 5 }] },
  { primary: { code: "GXss1-900WOS", name: "Система хранения. 1 секция 900 мм. 5 полок. Белая. Дуб сонома" }, pairs: [{ text: "полка 887x340", qty: 5 }] },
  { primary: { code: "GXss1-900hBVO", name: "Система хранения. 1 секция 900 мм. 3 полки с вешалкой. Чёрная. Дуб вотан" }, pairs: [{ text: "полка 887x340", qty: 2 }, { text: "полка 887x330", qty: 1 }] },
  { primary: { code: "GXss1-900hWOS", name: "Система хранения. 1 секция 900 мм. 3 полки с вешалкой. Белая. Дуб сонома" }, pairs: [{ text: "полка 887x340", qty: 2 }, { text: "полка 887x330", qty: 1 }] },
  { primary: { code: "GXss1-600BVO", name: "Система хранения. 1 секция 600 мм. 5 полок. Чёрная. Дуб вотан" }, pairs: [{ text: "полка 587x340", qty: 5 }] },
  { primary: { code: "GXss1-600WOS", name: "Система хранения. 1 секция 600 мм. 5 полок. Белая. Дуб сонома" }, pairs: [{ text: "полка 587x340", qty: 5 }] },
  { primary: { code: "GXss2-400-600hBVO", name: "Система хранения. 400+600 мм, полки + вешалка. Чёрная. Дуб вотан" }, pairs: [{ text: "полка 387x340", qty: 5 }, { text: "полка 587x330", qty: 1 }] },
  { primary: { code: "GXss2-400-600hWOS", name: "Система хранения. 400+600 мм, полки + вешалка. Белая. Дуб сонома" }, pairs: [{ text: "полка 387x340", qty: 5 }, { text: "полка 587x330", qty: 1 }] },
  { primary: { code: "GXssShelf900BVO", name: "Полка с кронштейном 900, Чёрная. Дуб вотан" }, pairs: [{ text: "полка 887x340", qty: 1 }] },
  { primary: { code: "GXssShelf900WOS", name: "Полка с кронштейном 900, Белая. Дуб сонома" }, pairs: [{ text: "полка 887x340", qty: 1 }] },
  { primary: { code: "GXssShelf600BVO", name: "Полка с кронштейном 600, Чёрная. Дуб вотан" }, pairs: [{ text: "полка 587x340", qty: 1 }] },
  { primary: { code: "GXssShelf600WOS", name: "Полка с кронштейном 600, Белая. Дуб сонома" }, pairs: [{ text: "полка 587x340", qty: 1 }] },
  { primary: { code: "GXssShelf400BVO", name: "Полка с кронштейном 400, Чёрная. Дуб вотан" }, pairs: [{ text: "полка 387x340", qty: 1 }] },
  { primary: { code: "GXssShelf400WOS", name: "Полка с кронштейном 400, Белая. Дуб сонома" }, pairs: [{ text: "полка 387x340", qty: 1 }] },
  { primary: { code: "GXssShShelf900BVO", name: "Полка обувная с кронштейном 900, Чёрная. Дуб вотан" }, pairs: [{ text: "полка 887x330", qty: 1 }] },
  { primary: { code: "GXssShShelf900WOS", name: "Полка обувная с кронштейном 900, Белая. Дуб сонома" }, pairs: [{ text: "полка 887x330", qty: 1 }] },
  { primary: { code: "GXssShShelf600BVO", name: "Полка обувная с кронштейном 600, Чёрная. Дуб вотан" }, pairs: [{ text: "полка 587x330", qty: 1 }] },
  { primary: { code: "GXssShShelf600WOS", name: "Полка обувная с кронштейном 600, Белая. Дуб сонома" }, pairs: [{ text: "полка 587x330", qty: 1 }] },
  { primary: { code: "GXssShShelf400BVO", name: "Полка обувная с кронштейном 400, Чёрная. Дуб вотан" }, pairs: [{ text: "полка 387x330", qty: 1 }] },
  { primary: { code: "GXssShShelf400WOS", name: "Полка обувная с кронштейном 400, Белая. Дуб сонома" }, pairs: [{ text: "полка 387x330", qty: 1 }] },
];

export function normalizeCatalogCode(code) {
  return String(code || "").trim().toUpperCase();
}

function normalizePair(pair) {
  const text = String(pair?.text || "").trim();
  const qty = Number(String(pair?.qty ?? "").replace(",", "."));
  if (!text || !(qty > 0)) return null;
  return { text, qty };
}

export function normalizeCatalogItem(raw) {
  const code = String(raw?.primary?.code || raw?.code || "").trim();
  const name = String(raw?.primary?.name || raw?.name || "").trim();
  const pairs = (Array.isArray(raw?.pairs) ? raw.pairs : [])
    .map(normalizePair)
    .filter(Boolean);
  if (!code || !name || !pairs.length) return null;
  const color = String(raw?.color || "").trim();
  const dbId = Number(raw?.dbId ?? raw?.id ?? 0) || undefined;
  return {
    primary: { code, name },
    pairs,
    ...(color ? { color } : {}),
    ...(dbId ? { dbId } : {}),
    isCustom: Boolean(raw?.isCustom),
  };
}

export function loadCustomCatalogItems() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GX_SHELF_CATALOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeCatalogItem({ ...item, isCustom: true }))
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

export function saveCustomCatalogItems(items = []) {
  if (typeof window === "undefined") return;
  const normalized = (Array.isArray(items) ? items : [])
    .map((item) => normalizeCatalogItem({ ...item, isCustom: true }))
    .filter(Boolean);
  window.localStorage.setItem(GX_SHELF_CATALOG_STORAGE_KEY, JSON.stringify(normalized));
}

export function clearCustomCatalogItemsStorage() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(GX_SHELF_CATALOG_STORAGE_KEY);
}

export function dbRowToCatalogItem(row) {
  if (!row) return null;
  return normalizeCatalogItem({
    dbId: row.id,
    primary: { code: row.code, name: row.name },
    color: row.color,
    pairs: row.pairs,
    isCustom: true,
  });
}

export function dbRowsToCatalogItems(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => dbRowToCatalogItem(row))
    .filter(Boolean);
}

export function upsertDbCatalogItem(list = [], item) {
  const normalized = normalizeCatalogItem({ ...item, isCustom: true });
  if (!normalized) return list;
  const key = normalizeCatalogCode(normalized.primary.code);
  const next = (Array.isArray(list) ? list : []).filter(
    (entry) => normalizeCatalogCode(entry.primary.code) !== key,
  );
  next.push(normalized);
  return next.sort((a, b) =>
    String(a.primary.code).localeCompare(String(b.primary.code), "ru", { sensitivity: "base" }),
  );
}

export function removeDbCatalogItemById(list = [], id) {
  const targetId = Number(id) || 0;
  if (!targetId) return list;
  return (Array.isArray(list) ? list : []).filter((entry) => Number(entry.dbId) !== targetId);
}

export function catalogDraftToUpsertPayload(draft, dbId = 0) {
  return {
    id: Number(dbId || draft?.dbId || 0) || 0,
    code: String(draft?.code || "").trim(),
    name: String(draft?.name || "").trim(),
    color: String(draft?.color || "").trim() || null,
    pairs: (Array.isArray(draft?.pairs) ? draft.pairs : [])
      .map((pair) => ({
        text: String(pair?.text || "").trim(),
        qty: Number(String(pair?.qty || "").replace(",", ".")),
      }))
      .filter((pair) => pair.text && pair.qty > 0),
  };
}

export function mergeShelfCatalog(defaultItems = DEFAULT_GX_SHELF_CATALOG, customItems = []) {
  const byCode = new Map();
  defaultItems.forEach((item) => {
    const normalized = normalizeCatalogItem(item);
    if (normalized) byCode.set(normalizeCatalogCode(normalized.primary.code), normalized);
  });
  customItems.forEach((item) => {
    const normalized = normalizeCatalogItem({ ...item, isCustom: true });
    if (normalized) byCode.set(normalizeCatalogCode(normalized.primary.code), normalized);
  });
  return Array.from(byCode.values()).sort((a, b) =>
    String(a.primary.code).localeCompare(String(b.primary.code), "ru", { sensitivity: "base" }),
  );
}

export function buildCatalogMap(items = []) {
  return Object.fromEntries(
    items.map((item) => [normalizeCatalogCode(item.primary.code), item]),
  );
}

export function validateCatalogDraft({ code, name, pairs = [] }) {
  const normalizedCode = String(code || "").trim();
  const normalizedName = String(name || "").trim();
  const normalizedPairs = pairs.map(normalizePair).filter(Boolean);
  if (!normalizedCode) return "Укажите артикул.";
  if (!normalizedName) return "Укажите наименование.";
  if (!normalizedPairs.length) return "Добавьте хотя бы одну полку с количеством.";
  return "";
}

export function createEmptyCatalogPair() {
  return { text: "", qty: "1" };
}

export function createEmptyCatalogDraft() {
  return {
    code: "",
    name: "",
    color: "",
    dbId: null,
    pairs: [createEmptyCatalogPair()],
  };
}

export function catalogItemToDraft(item) {
  if (!item) return createEmptyCatalogDraft();
  return {
    code: String(item.primary?.code || ""),
    name: String(item.primary?.name || ""),
    color: String(item.color || ""),
    dbId: item.dbId ?? null,
    pairs: (Array.isArray(item.pairs) ? item.pairs : []).map((pair) => ({
      text: String(pair?.text || ""),
      qty: String(pair?.qty ?? ""),
    })),
  };
}
