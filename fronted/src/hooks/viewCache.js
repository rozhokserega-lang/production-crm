const VIEW_CACHE_TTL_MS = {
  overview: 60 * 1000,
  workshop: 60 * 1000,
  stats: 60 * 1000,
  sheetMirror: 60 * 1000,
  labor: 60 * 1000,
  shipment: 90 * 1000,
  warehouse: 2 * 60 * 1000,
  furniture: 5 * 60 * 1000,
};

const ALL_CACHED_VIEWS = Object.freeze(Object.keys(VIEW_CACHE_TTL_MS));
const viewCacheStore = new Map();

function normalizeView(view) {
  return String(view || "").trim();
}

function getViewTtlMs(view) {
  const key = normalizeView(view);
  return VIEW_CACHE_TTL_MS[key] ?? 60 * 1000;
}

function isCacheableView(view) {
  const key = normalizeView(view);
  return Boolean(key && VIEW_CACHE_TTL_MS[key]);
}

export function getCachedViews() {
  return [...ALL_CACHED_VIEWS];
}

export function getViewCache(view) {
  const key = normalizeView(view);
  if (!isCacheableView(key)) return null;
  const entry = viewCacheStore.get(key);
  if (!entry) return null;
  if (Date.now() - entry.savedAt > getViewTtlMs(key)) {
    viewCacheStore.delete(key);
    return null;
  }
  return entry.snapshot ?? null;
}

export function setViewCache(view, snapshot) {
  const key = normalizeView(view);
  if (!isCacheableView(key) || snapshot == null) return;
  viewCacheStore.set(key, {
    savedAt: Date.now(),
    snapshot,
  });
}

export function invalidateViewCache(view) {
  const key = normalizeView(view);
  if (!key) return;
  viewCacheStore.delete(key);
}

export function invalidateViewCaches(views = []) {
  (Array.isArray(views) ? views : []).forEach((view) => {
    invalidateViewCache(view);
  });
}

export function clearAllViewCaches() {
  viewCacheStore.clear();
}

export function getMutationInvalidationViews(view) {
  const key = normalizeView(view);
  if (["overview", "workshop", "stats"].includes(key)) {
    return ["overview", "workshop", "stats", "shipment", "warehouse", "sheetMirror", "strapStock"];
  }
  if (key === "shipment") {
    return ["shipment", "overview", "workshop", "stats", "warehouse", "furniture", "sheetMirror", "strapStock"];
  }
  if (key === "warehouse") {
    return ["warehouse", "shipment", "overview", "workshop", "stats", "sheetMirror", "strapStock"];
  }
  if (key === "furniture") {
    return ["furniture", "shipment", "workshop", "warehouse", "strapStock"];
  }
  if (key === "labor") {
    return ["labor"];
  }
  if (key === "sheetMirror") {
    return ["sheetMirror", "shipment", "overview", "workshop", "stats"];
  }
  return getCachedViews();
}
