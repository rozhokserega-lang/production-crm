/** Домены данных CRM — используются для точечной фоновой перезагрузки по Realtime. */

export const REALTIME_TABLE_DOMAINS = Object.freeze({
  orders: ["orders"],
  shipment_plan_cells: ["shipment"],
  labor_facts: ["labor"],
  materials_stock: ["warehouse", "shipment"],
  materials_leftovers: ["warehouse"],
  materials_moves: ["warehouse"],
  crm_audit_log: ["admin"],
  furniture_product_map: ["furniture", "shipment"],
  furniture_detail_item_map: ["furniture", "shipment"],
  metal_components_stock: ["metal"],
  metal_work_queue: ["metal", "metalProcess"],
});

/** Какие домены нужны активному экрану (пересечение с таблицей → что грузить). */
export const VIEW_DOMAINS = Object.freeze({
  shipment: ["shipment", "orders"],
  warehouse: ["warehouse"],
  labor: ["labor"],
  furniture: ["furniture"],
  workshop: ["orders", "shipment", "furniture"],
  floorMap: ["orders", "shipment", "furniture"],
  overview: ["orders", "shipment"],
  stats: ["orders"],
  strapStock: ["orders", "furniture"],
  metal: ["metal"],
  metalProcess: ["metalProcess", "metal"],
  admin: ["admin"],
  hardware: ["warehouse", "shipment", "furniture"],
  warehouseMissing: ["warehouse", "shipment", "furniture"],
  cutting: ["orders"],
  db: [],
});

const INTERNAL_DOMAINS = new Set(["orders", "shipment", "warehouse", "labor", "furniture"]);
const EXTERNAL_DOMAINS = new Set(["metal", "metalProcess", "admin"]);

export function preferStagedOrdersReloadForView(view) {
  return String(view || "") !== "stats";
}

export function getViewDomains(view) {
  const key = String(view || "").trim();
  return VIEW_DOMAINS[key] || ["orders"];
}

export function resolveDomainsForRealtimeEvent(table, view) {
  const tableName = String(table || "").trim();
  const fromTable = REALTIME_TABLE_DOMAINS[tableName];
  if (!fromTable?.length) return [];
  const viewDomains = new Set(getViewDomains(view));
  return fromTable.filter((domain) => viewDomains.has(domain));
}

export function isInternalDomain(domain) {
  return INTERNAL_DOMAINS.has(domain);
}

export function isExternalDomain(domain) {
  return EXTERNAL_DOMAINS.has(domain);
}

export function partitionDomains(domains) {
  const internal = [];
  const external = [];
  (Array.isArray(domains) ? domains : []).forEach((domain) => {
    if (INTERNAL_DOMAINS.has(domain)) internal.push(domain);
    else if (EXTERNAL_DOMAINS.has(domain)) external.push(domain);
  });
  return { internal, external };
}
