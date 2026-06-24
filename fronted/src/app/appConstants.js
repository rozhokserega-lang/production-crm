/**
 * Единый источник констант.
 * Всё, что было определено здесь, теперь живёт в constants/views.js и constants/stages.js.
 * Этот файл ре-экспортит оттуда для обратной совместимости.
 */
export {
  VIEWS,
  TABS,
  CRM_ROLES,
  CRM_ROLE_LABELS,
  DEFAULT_SHIPMENT_PREFS,
  STRAP_OPTIONS,
  STRAP_SHEET_WIDTH,
  STRAP_SHEET_HEIGHT,
  WAREHOUSE_SYNC_SHEET_ID,
  WAREHOUSE_SYNC_GID,
  LEFTOVERS_SYNC_GID,
  CONSUME_LOG_SHEET_NAME,
} from "../constants/views";
