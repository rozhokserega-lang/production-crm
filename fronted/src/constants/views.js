export const VIEWS = [
  { id: "shipment", label: "Отгрузка" },
  { id: "floorMap", label: "Карта" },
  { id: "overview", label: "Обзор заказов" },
  { id: "workshop", label: "Производство" },
  { id: "warehouse", label: "Склад" },
  { id: "strapStock", label: "Обвязка" },
  { id: "metal", label: "Металл" },
  { id: "cutting", label: "Раскрой" },
  { id: "labor", label: "Трудоемкость" },
  { id: "stats", label: "Статистика" },
  { id: "furniture", label: "Мебель" },
  { id: "db", label: "БД" },
  { id: "admin", label: "Админ" },
];

export const TABS = [
  { id: "pilka", label: "Пила" },
  { id: "kromka", label: "Кромка" },
  { id: "pras", label: "Присадка" },
  { id: "assembly", label: "Сборка" },
  { id: "done", label: "Финал" },
  { id: "debt", label: "Долг" },
];

export { CRM_ROLES, CRM_ROLE_LABELS } from "../app/crmRoles";

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
  "Обвязка (1158_56)",
  "Обвязка (600_56)",
  "Обвязка (502_80)",
  "Обвязка (544_80)",
  "Обвязка (288_80)",
  "Обвязка (520_75.5)",
  "Обвязка (522_100)",
  "Фасад (396_305)",
  "Фасад (153x320)",
];

export const STRAP_SHEET_WIDTH = 2800;
export const STRAP_SHEET_HEIGHT = 2070;

// Google Sheet IDs
export const WAREHOUSE_SYNC_SHEET_ID = "1SyFYOpXyHHMP31qYV5-XL8fINVUUDCrXIrewaZqkYkA";
export const WAREHOUSE_SYNC_GID = "1501570173";
export const LEFTOVERS_SYNC_GID = "762227238";
/** Значение по умолчанию и запасной вариант, если в браузере не задано своё имя вкладки. */
export const CONSUME_LOG_SHEET_NAME = "расход май 2026";
