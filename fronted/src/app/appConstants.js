export const CRM_ROLES = ["viewer", "operator", "manager", "admin"];

export const CRM_ROLE_LABELS = {
  viewer: "Наблюдатель",
  operator: "Оператор",
  manager: "Менеджер",
  admin: "Админ",
};

export const TABS = [
  { id: "pilka", label: "Пила" },
  { id: "kromka", label: "Кромка" },
  { id: "pras", label: "Присадка" },
  { id: "assembly", label: "Сборка" },
  { id: "done", label: "Финал" },
];

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

export const DEFAULT_SHIPMENT_PREFS = {
  weekFilter: "all",
  shipmentSort: "name",
  showAwaiting: true,
  showOnPilka: true,
  showOnKromka: true,
  showOnPras: true,
  showReadyAssembly: true,
  // Собран / готово к отправке клиенту — "ждёт отправку" (отдельно от "готовы к сборке").
  showAwaitShipment: true,
  showShipped: true,
  collapsedSections: {},
};

export const STAGE_SYNC_META = {
  webSetPilkaInWork: { code: "pilka_in_work", label: "Пила: в работе" },
  webSetPilkaDone: { code: "pilka_done", label: "Пила: готово" },
  webSetPilkaPause: { code: "pilka_pause", label: "Пила: пауза" },
  webSetKromkaInWork: { code: "kromka_in_work", label: "Кромка: в работе" },
  webSetKromkaDone: { code: "kromka_done", label: "Кромка: готово" },
  webSetKromkaPause: { code: "kromka_pause", label: "Кромка: пауза" },
  webSetPrasInWork: { code: "pras_in_work", label: "Присадка: в работе" },
  webSetPrasDone: { code: "pras_done", label: "Присадка: готово" },
  webSetPrasPause: { code: "pras_pause", label: "Присадка: пауза" },
  webSetAssemblyDone: { code: "assembly_done", label: "Сборка: готово" },
  webSetShippingDone: { code: "shipping_done", label: "Отгрузка: готово" },
};
