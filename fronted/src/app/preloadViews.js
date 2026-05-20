/**
 * Предзагрузка вьюх: import() кэшируется браузером, повторный переход быстрее.
 */

const VIEW_LOADERS = {
  shipment: () => import("../views/ShipmentView"),
  overview: () => import("../views/OverviewView"),
  workshop: () => import("../views/WorkshopView"),
  warehouse: () => import("../views/WarehouseView"),
  warehouseMissing: () => import("../views/WarehouseMissingView"),
  strapStock: () => import("../views/StrapStockView"),
  labor: () => import("../views/LaborView"),
  stats: () => import("../views/StatsView"),
  furniture: () => import("../views/FurnitureView"),
  metal: () => import("../views/MetalView"),
  metalProcess: () => import("../views/MetalProcessView"),
  sheetMirror: () => import("../views/SheetMirrorView"),
  db: () => import("../views/DatabaseCatalogView"),
  admin: () => import("../views/AdminView"),
};

const preloaded = new Set();

/** Hover на пункт навигации — начать качать чанк заранее. */
export function preloadView(viewId) {
  if (preloaded.has(viewId)) return;
  const loader = VIEW_LOADERS[viewId];
  if (!loader) return;
  preloaded.add(viewId);
  loader().catch(() => {
    preloaded.delete(viewId);
  });
}

/** Фоновая предзагрузка частых вкладок после первого рендера. */
export function preloadCriticalViews() {
  setTimeout(() => preloadView("overview"), 500);
  setTimeout(() => preloadView("workshop"), 1000);
  setTimeout(() => preloadView("warehouse"), 1500);
  setTimeout(() => preloadView("stats"), 2000);
  setTimeout(() => preloadView("labor"), 2500);
  setTimeout(() => preloadView("furniture"), 3000);
  setTimeout(() => preloadView("metal"), 3500);
}
