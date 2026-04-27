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
  PLAN_SYNC_SHEET_ID,
  PLAN_SYNC_GID,
  SHEET_MIRROR_GID,
} from "../constants/views";

export { STAGE_SYNC_META } from "../constants/stages";

export type { ViewItem, TabItem, ShipmentPrefs, CrmRole } from "../constants/views";
export type { StageSyncMetaItem } from "../constants/stages";
