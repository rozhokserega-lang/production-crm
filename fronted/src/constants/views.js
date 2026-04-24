export const VIEWS = [
  { id: "shipment", label: "Отгрузка" },
  { id: "overview", label: "Обзор заказов" },
  { id: "workshop", label: "Производство" },
  { id: "warehouse", label: "Склад" },
  { id: "metal", label: "Металл" },
  { id: "labor", label: "Трудоемкость" },
  { id: "stats", label: "Статистика" },
  { id: "furniture", label: "Мебель" },
  { id: "admin", label: "Админ" },
];

export const TABS = [
  { id: "pilka", label: "Пила" },
  { id: "kromka", label: "Кромка" },
  { id: "pras", label: "Присадка" },
  { id: "assembly", label: "Сборка" },
  { id: "done", label: "Финал" },
];

export const CRM_ROLES = ["viewer", "operator", "manager", "admin"];
export const CRM_ROLE_LABELS = {
  viewer: "Наблюдатель",
  operator: "Оператор",
  manager: "Менеджер",
  admin: "Админ",
};

export const DEFAULT_SHIPMENT_PREFS = {
  weekFilter: "all",
  shipmentSort: "name",
  showAwaiting: true,
  showOnPilka: true,
  showOnKromka: true,
  showOnPras: true,
  showReadyAssembly: true,
  showAwaitShipment: true,
  showShipped: true,
  collapsedSections: {},
};

export const STRAP_OPTIONS = [
  "Бока (316_167)",
  "Обвязка (1000_80)",
  "Обвязка (558_80)",
  "Обвязка (750_80)",
  "Обвязка (618_80)",
  "Обвязка (600_80)",
  "Обвязка (586_80)",
  "Обвязка (1158_50)",
  "Обвязка (600_50)",
  "Обвязка (502_80)",
  "Обвязка (544_80)",
  "Обвязка (288_80)",
  "Обвязка (520_80)",
  "Фасад (396_305)",
  "Фасад (153x320)",
];

export const STRAP_SHEET_WIDTH = 2800;
export const STRAP_SHEET_HEIGHT = 2070;

// Google Sheet IDs
export const WAREHOUSE_SYNC_SHEET_ID = "1SyFYOpXyHHMP31qYV5-XL8fINVUUDCrXIrewaZqkYkA";
export const WAREHOUSE_SYNC_GID = "1501570173";
export const LEFTOVERS_SYNC_GID = "762227238";
export const CONSUME_LOG_SHEET_NAME = "расход апрель 2026";
export const PLAN_SYNC_SHEET_ID = "1gRMs2AVxIXwmQLLnB2WIoRW7mPkGc9usyaUrXZAHuIs";
export const PLAN_SYNC_GID = "1998084017";
export const SHEET_MIRROR_GID = "1772676601";
