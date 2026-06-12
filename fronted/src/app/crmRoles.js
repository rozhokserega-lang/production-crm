export const CRM_ROLES = [
  "viewer",
  "warehouse",
  "operator_pilka",
  "operator_kromka",
  "operator_pras",
  "operator",
  "manager",
  "admin",
];

export const CRM_ROLE_LABELS = {
  viewer: "Наблюдатель",
  warehouse: "Склад",
  operator_pilka: "Оператор пилы",
  operator_kromka: "Оператор кромки",
  operator_pras: "Оператор присадки",
  operator: "Оператор (все этапы)",
  manager: "Менеджер",
  admin: "Админ",
};

/** Действие цеха → этап для проверки прав. */
export const WORKSHOP_ACTION_STAGE = {
  webSetPilkaInWork: "pilka",
  webSetPilkaDone: "pilka",
  webSetPilkaPause: "pilka",
  webSetPilkaWait: "pilka",
  webSetKromkaInWork: "kromka",
  webSetKromkaDone: "kromka",
  webSetKromkaPause: "kromka",
  webSetKromkaWait: "kromka",
  webSetPrasInWork: "pras",
  webSetPrasDone: "pras",
  webSetPrasPause: "pras",
  webSetPrasWait: "pras",
  webSetAssemblyDone: "assembly",
  webSetWarehouseKitReady: "final",
  webSetWarehouseKitInWork: "final",
  webSetWarehouseKitDone: "final",
  webSetShippingDone: "final",
};

export function normalizeCrmRole(rawRole) {
  const role = String(rawRole || "").trim().toLowerCase();
  return CRM_ROLES.includes(role) ? role : "viewer";
}

export function resolveWorkshopStageForAction(action) {
  return WORKSHOP_ACTION_STAGE[String(action || "").trim()] || null;
}

/** Полный доступ к производству (отгрузка, металл, мебель и т.д.). */
export function canOperateProductionForRole(role) {
  const r = normalizeCrmRole(role);
  return r === "operator" || r === "manager" || r === "admin";
}

/** Права на конкретный этап цеха. */
export function canOperateWorkshopStageForRole(role, stage) {
  const r = normalizeCrmRole(role);
  const s = String(stage || "").trim().toLowerCase();
  if (r === "admin" || r === "manager" || r === "operator") return true;
  if (s === "pilka") return r === "operator_pilka";
  if (s === "kromka") return r === "operator_kromka";
  if (s === "pras") return r === "operator_pras";
  return false;
}

export function canUseOperatorPilkaModeForRole(role) {
  return canOperateWorkshopStageForRole(role, "pilka");
}

/** Списание листов после «Пила: Готово». */
export function canConsumePilkaSheetsForRole(role) {
  return canOperateWorkshopStageForRole(role, "pilka");
}

const RESTRICTED_WORKSHOP_OPERATOR_ROLES = new Set([
  "operator_pilka",
  "operator_kromka",
  "operator_pras",
]);

/** Оператор одного участка — ограниченный набор экранов. */
export function isRestrictedWorkshopOperatorRole(role) {
  return RESTRICTED_WORKSHOP_OPERATOR_ROLES.has(normalizeCrmRole(role));
}

/** null = все основные разделы (кроме admin/db по canAdminSettings). */
export function getAllowedViewIdsForRole(role) {
  const r = normalizeCrmRole(role);
  if (r === "operator_pilka") return ["workshop", "cutting"];
  if (r === "operator_kromka") return ["workshop"];
  if (r === "operator_pras") return ["workshop"];
  return null;
}

export function canAccessViewForRole(role, viewId, { canAdminSettings = false } = {}) {
  const id = String(viewId || "").trim();
  if ((id === "admin" || id === "db") && !canAdminSettings) return false;
  if (id === "metalProcess" || id === "warehouseMissing") {
    if (isRestrictedWorkshopOperatorRole(role)) return false;
  }
  const allowed = getAllowedViewIdsForRole(role);
  if (!allowed) return true;
  return allowed.includes(id);
}

export function getDefaultViewForRole(role) {
  const r = normalizeCrmRole(role);
  if (r === "operator_pilka") return "workshop";
  if (r === "operator_kromka") return "workshop";
  if (r === "operator_pras") return "workshop";
  return "shipment";
}

export function getDefaultWorkshopTabForRole(role) {
  const r = normalizeCrmRole(role);
  if (r === "operator_pilka") return "pilka";
  if (r === "operator_kromka") return "kromka";
  if (r === "operator_pras") return "pras";
  return "pilka";
}

/** null = все вкладки цеха. */
export function getAllowedWorkshopTabsForRole(role) {
  const r = normalizeCrmRole(role);
  if (r === "operator_pilka") return ["pilka"];
  if (r === "operator_kromka") return ["kromka"];
  if (r === "operator_pras") return ["pras"];
  return null;
}

export function canAccessWorkshopTabForRole(role, tabId) {
  const allowed = getAllowedWorkshopTabsForRole(role);
  if (!allowed) return true;
  return allowed.includes(String(tabId || "").trim());
}
