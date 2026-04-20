import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  callBackend,
  getSupabaseRealtimeClient,
  isLikelyNetworkError,
  supabaseCall,
} from "./api";
import {
  BACKEND_PROVIDER,
  KROMKA_EXECUTORS,
  PRAS_EXECUTORS,
  SHEET_MIRROR_GID,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from "./config";
import furnitureWorkbookUrl from "./assets/furniture.xlsx?url";
import {
  getOrderStageDisplayLabel as getStageLabel,
  getOverviewLaneId,
  OVERVIEW_POST_PRODUCTION_LANE_IDS,
  isCustomerShippedOverall,
  isOrderCustomerShipped,
  PipelineStage,
  resolvePipelineStage,
} from "./orderPipeline";
import {
  getReadableTextColor,
  isBlueCell,
  isRedCell,
  isYellowCell,
  parseColor,
  passesBlueYellowFilter,
} from "./utils/colorUtils";
import {
  getShipmentCellStatus,
  getShipmentCellStatusShort,
  getShipmentStageKey,
  isGarbageShipmentItemName,
  isObvyazkaSectionName,
  isStorageLikeName,
  normText,
  sectionSortKey,
  shipmentOrderItemWeekKey,
} from "./utils/shipmentUtils";
import {
  buildFurnitureTemplates,
  canonicalStrapProductName,
  detailPatternToStrapName,
  extractDetailSizeToken,
  furnitureProductLabel,
  isStrapVirtualRowId,
  normalizeDetailPatternKey,
  normalizeFurnitureKey,
  normalizeStrapProductKey,
  parseFurnitureSheet,
  resolveFurnitureTemplateForPreview,
  resolveStrapMaterialByProduct,
  strapNameToOrderItem,
  toNum,
} from "./utils/furnitureUtils";
import {
  useBaseOrderFilter,
  isOrdersDomainView,
  useLaborFilter,
  loadFurnitureDomainData,
  loadShipmentDomainData,
  loadWarehouseDomainData,
  loadOrdersDomainData,
  useOrders,
  useSheetMirrorFilter,
  useShipmentFilter,
  useWorkshopRows,
} from "./hooks/useOrders";
import { useDataLoader } from "./hooks/useDataLoader";
import { useCrmRole } from "./hooks/useCrmRole";
import { ConsumeDialog } from "./components/ConsumeDialog";
import { PlanDialog } from "./components/PlanDialog";
import { StrapDialog } from "./components/StrapDialog";
import { AdminView } from "./views/AdminView";
import { WorkshopView } from "./views/WorkshopView";
import { ShipmentView } from "./views/ShipmentView";
import { OverviewView } from "./views/OverviewView";
import { LaborView } from "./views/LaborView";
import { WarehouseView } from "./views/WarehouseView";
import { StatsView } from "./views/StatsView";
import { SheetMirrorView } from "./views/SheetMirrorView";
import { FurnitureView } from "./views/FurnitureView";
import {
  CRM_ROLES,
  CRM_ROLE_LABELS,
  DEFAULT_SHIPMENT_PREFS,
  STAGE_SYNC_META,
  TABS,
  VIEWS,
} from "./app/appConstants";
import {
  getOverallStatusDisplay,
  stageBg,
  stageLabel,
  statusClass,
} from "./app/statusHelpers";
import {
  getMaterialLabel,
  getPlanPreviewArticleCode,
  hasArticleLikeCode,
  mergeOrderPreferNewer,
  shipmentOrderKey,
} from "./app/orderHelpers";
import {
  mapStageFieldToKey,
  normalizeStageStatus,
  parseStageAuditRows,
} from "./app/auditHelpers";
import {
  buildPlanPreviewQrPayload,
  buildQrCodeUrl,
  resolvePlanPreviewArticleByName,
} from "./app/planPreviewHelpers";
import {
  extractErrorMessage,
  normalizeCatalogDedupKey,
  normalizeCatalogItemName,
  toUserError,
} from "./app/errorCatalogHelpers";
import {
  formatDateTimeRu,
  isShipmentCellMissingError,
  normalizeOrder,
} from "./app/rowHelpers";
import {
  logConsumeToGoogleSheetEdge,
  notifyAssemblyReadyTelegramEdge,
  notifyFinalStageTelegramEdge,
  syncLeftoversToGoogleSheetEdge,
  syncPlanCellToGoogleSheetEdge,
  syncWarehouseFromGoogleSheetEdge,
} from "./app/edgeSyncService";
import {
  buildNotifyPayload,
  buildPilkaDoneDialogInit,
  buildConsumeDialogData,
  buildStageSyncPayload,
  getDefaultSheetsQty,
} from "./app/runActionHelpers";
import {
  buildShipmentCellAttempts,
  runShipmentCellActionWithFallback,
} from "./app/shipmentActionHelpers";
import {
  getStatsDeleteActionKey,
  resolveStatsOrderSourceCell,
} from "./app/statsDeleteHelpers";
import {
  buildCreatePlanDialogInit,
  buildStrapPlanCellPayload,
  buildStrapPreviewPlans,
  buildStrapPlanRows,
  buildStrapDialogInit,
  remapStrapDraftByOptions,
} from "./app/shipmentDialogHelpers";
import {
  buildShipmentPreviewPlans,
  enrichPreviewFromFurniture,
  enrichPreviewWithStrapProduct,
} from "./app/shipmentPreviewHelpers";
import {
  applyImportPlanRows,
  buildImportArticleMap,
  buildShipmentExportRows,
  formatImportShipmentPartialError,
  formatShipmentImportError,
  formatShipmentExportPartialError,
  getImportPlanNoValidRowsError,
  getShipmentExportNoArticlesError,
  loadImportCatalogRows,
  parseImportPlanRows,
} from "./app/shipmentExportHelpers";
import {
  buildLaborFactPayload,
  formatLaborImportError,
  formatLaborSaveRowError,
  getLaborImportNoValidRowsError,
  markLaborImportRowSaved,
  parseLaborImportRows,
} from "./app/laborImportHelpers";

/** Для KPI «Статистика»: собрано, готово к отправке клиенту, отгружено. */
const TERMINAL_PIPELINE_STAGES = new Set([
  PipelineStage.ASSEMBLED,
  PipelineStage.READY_TO_SHIP,
  PipelineStage.SHIPPED,
]);

const ACTION_OPTIMISTIC_MAP = {
  webSetPilkaInWork: {
    field: "pilkaStatus",
    snakeField: "pilka_status",
    value: (payload) => `В работе${payload?.executor ? ` (${payload.executor})` : ""}`,
    pipelineStage: "pilka",
  },
  webSetPilkaDone: { field: "pilkaStatus", snakeField: "pilka_status", value: "Готово", pipelineStage: "kromka" },
  webSetPilkaPause: { field: "pilkaStatus", snakeField: "pilka_status", value: "Пауза", pipelineStage: "pilka" },
  webSetKromkaInWork: {
    field: "kromkaStatus",
    snakeField: "kromka_status",
    value: (payload) => `В работе${payload?.executor ? ` (${payload.executor})` : ""}`,
    pipelineStage: "kromka",
  },
  webSetKromkaDone: { field: "kromkaStatus", snakeField: "kromka_status", value: "Готово", pipelineStage: "pras" },
  webSetKromkaPause: { field: "kromkaStatus", snakeField: "kromka_status", value: "Пауза", pipelineStage: "kromka" },
  webSetPrasInWork: {
    field: "prasStatus",
    snakeField: "pras_status",
    value: (payload) => `В работе${payload?.executor ? ` (${payload.executor})` : ""}`,
    pipelineStage: "pras",
  },
  webSetPrasDone: { field: "prasStatus", snakeField: "pras_status", value: "Готово", pipelineStage: "assembly" },
  webSetPrasPause: { field: "prasStatus", snakeField: "pras_status", value: "Пауза", pipelineStage: "pras" },
  webSetAssemblyDone: {
    field: "assemblyStatus",
    snakeField: "assembly_status",
    value: "Собрано",
    pipelineStage: "assembled",
  },
  webSetShippingDone: {
    field: "overallStatus",
    snakeField: "overall_status",
    value: "Отгружено",
    pipelineStage: "shipped",
  },
};

function applyOptimisticOrderRow(row, action, payload = {}) {
  const config = ACTION_OPTIMISTIC_MAP[action];
  if (!config) return row;
  const nextValue = typeof config.value === "function" ? config.value(payload) : config.value;
  return {
    ...row,
    [config.field]: nextValue,
    [config.snakeField]: nextValue,
    ...(config.pipelineStage ? { pipelineStage: config.pipelineStage, pipeline_stage: config.pipelineStage } : {}),
  };
}

const SHIPMENT_SECTION_ORDER = [];
const STRAP_OPTIONS = [
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
const STRAP_SHEET_WIDTH = 2800;
const STRAP_SHEET_HEIGHT = 2070;
const WAREHOUSE_SYNC_SHEET_ID = "1SyFYOpXyHHMP31qYV5-XL8fINVUUDCrXIrewaZqkYkA";
const WAREHOUSE_SYNC_GID = "1501570173";
const LEFTOVERS_SYNC_GID = "762227238";
const CONSUME_LOG_SHEET_NAME = "расход апрель 2026";
// Google Sheet (вкладка "Отгрузка") для записи плана
const PLAN_SYNC_SHEET_ID = "1gRMs2AVxIXwmQLLnB2WIoRW7mPkGc9usyaUrXZAHuIs";
const PLAN_SYNC_GID = "1998084017";

function resolveDefaultConsumeSheets(order, shipmentOrders) {
  const direct = Number(order?.sheetsNeeded ?? order?.sheets_needed ?? 0);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const orderId = String(order?.orderId || order?.order_id || "").trim();
  const sourceRowId = String(order?.sourceRowId || order?.source_row_id || "").trim();
  const week = String(order?.week || "").trim();
  const item = String(order?.item || "").trim();
  const all = Array.isArray(shipmentOrders) ? shipmentOrders : [];

  const getSheets = (x) => Number(x?.sheetsNeeded ?? x?.sheets_needed ?? 0);

  if (orderId) {
    const byOrderId = all.find((x) => String(x?.orderId || x?.order_id || "").trim() === orderId && getSheets(x) > 0);
    if (byOrderId) return getSheets(byOrderId);
  }
  if (sourceRowId && week) {
    const byRowWeek = all.find(
      (x) =>
        String(x?.sourceRowId || x?.source_row_id || "").trim() === sourceRowId &&
        String(x?.week || "").trim() === week &&
        getSheets(x) > 0
    );
    if (byRowWeek) return getSheets(byRowWeek);
  }
  if (item && week) {
    const byItemWeek = all.find(
      (x) =>
        String(x?.item || "").trim() === item &&
        String(x?.week || "").trim() === week &&
        getSheets(x) > 0
    );
    if (byItemWeek) return getSheets(byItemWeek);
  }
  return 0;
}

function resolveDefaultConsumeSheetsFromBoard(order, shipmentBoard) {
  const direct = Number(order?.sheetsNeeded ?? order?.sheets_needed ?? 0);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const sourceRowId = String(order?.sourceRowId || order?.source_row_id || "").trim();
  const week = String(order?.week || "").trim();
  const item = String(order?.item || "").trim();
  const sections = Array.isArray(shipmentBoard?.sections) ? shipmentBoard.sections : [];

  let byRowWeek = 0;
  let byItemWeek = 0;
  for (const section of sections) {
    for (const it of section?.items || []) {
      const rowId = String(it?.sourceRowId || it?.source_row_id || it?.row || "").trim();
      const itemName = String(it?.item || "").trim();
      for (const c of it?.cells || []) {
        const cellWeek = String(c?.week || "").trim();
        const sheets = Number(c?.sheetsNeeded ?? c?.sheets_needed ?? 0);
        if (!(Number.isFinite(sheets) && sheets > 0)) continue;
        if (sourceRowId && week && rowId === sourceRowId && cellWeek === week) byRowWeek = Math.max(byRowWeek, sheets);
        if (item && week && itemName === item && cellWeek === week) byItemWeek = Math.max(byItemWeek, sheets);
      }
    }
  }
  return byRowWeek || byItemWeek || 0;
}

function normalizeShipmentBoard(data) {
  if (data && Array.isArray(data.sections)) return data;
  if (!Array.isArray(data)) return { sections: [] };
  const sectionMap = new Map();
  data.forEach((row, idx) => {
    const sectionName = String(row?.section_name || row?.sectionName || "Прочее").trim() || "Прочее";
    const itemName = String(row?.item || "").trim();
    if (!itemName) return;
    if (!sectionMap.has(sectionName)) sectionMap.set(sectionName, new Map());
    const itemMap = sectionMap.get(sectionName);
    const rowKey = String(row?.row_ref || row?.rowRef || row?.source_row_id || `${sectionName}:${itemName}`);
    if (!itemMap.has(rowKey)) {
      itemMap.set(rowKey, {
        row: rowKey,
        sourceRowId: String(row?.source_row_id || row?.sourceRowId || rowKey),
        item: itemName,
        material: row?.material || "",
        cells: [],
      });
    }
    itemMap.get(rowKey).cells.push({
      col: row?.source_col_id || row?.sourceColId || row?.col_ref || row?.colRef || String(idx + 1),
      sourceColId: row?.source_col_id || row?.sourceColId || row?.col_ref || row?.colRef || String(idx + 1),
      week: row?.week || "",
      qty: Number(row?.qty || 0),
      bg: row?.bg || "#ffffff",
      canSendToWork: !!row?.can_send_to_work || !!row?.canSendToWork,
      inWork: !!row?.in_work || !!row?.inWork,
      sheetsNeeded: Number(row?.sheets_needed ?? row?.sheetsNeeded ?? 0),
      outputPerSheet: Number(row?.output_per_sheet ?? row?.outputPerSheet ?? 0),
      availableSheets: Number(row?.available_sheets ?? row?.availableSheets ?? 0),
      materialEnoughForOrder:
        row?.material_enough_for_order == null
          ? row?.materialEnoughForOrder
          : !!row?.material_enough_for_order,
      note: row?.note || "",
    });
  });
  const sections = [...sectionMap.entries()].map(([name, items]) => ({
    name,
    items: [...items.values()],
  }));
  return { sections };
}

function mergeShipmentBoardWithTable(board, tableRows) {
  const normalized = normalizeShipmentBoard(board);
  const rows = Array.isArray(tableRows) ? tableRows : [];
  if (!rows.length) return normalized;

  const bySource = new Map();
  rows.forEach((r) => {
    const sourceRow = String(r?.source_row_id || r?.sourceRowId || "").trim();
    const sourceCol = String(r?.source_col_id || r?.sourceColId || "").trim();
    if (!sourceRow || !sourceCol) return;
    bySource.set(`${sourceRow}|${sourceCol}`, {
      availableSheets: Number(r?.available_sheets ?? r?.availableSheets ?? 0),
      sheetsNeeded: Number(r?.sheets_needed ?? r?.sheetsNeeded ?? 0),
      materialEnoughForOrder:
        r?.material_enough_for_order == null
          ? (r?.materialEnoughForOrder == null ? undefined : !!r?.materialEnoughForOrder)
          : !!r?.material_enough_for_order,
    });
  });

  return {
    ...normalized,
    sections: (normalized.sections || []).map((section) => ({
      ...section,
      items: (section.items || []).map((item) => ({
        ...item,
        cells: (item.cells || []).map((cell) => {
          const key = `${String(item?.sourceRowId || item?.row || "").trim()}|${String(cell?.sourceColId || cell?.col || "").trim()}`;
          const fromTable = bySource.get(key);
          if (!fromTable) return cell;
          return {
            ...cell,
            availableSheets: fromTable.availableSheets,
            sheetsNeeded: fromTable.sheetsNeeded > 0 ? fromTable.sheetsNeeded : cell.sheetsNeeded,
            materialEnoughForOrder:
              fromTable.materialEnoughForOrder == null ? cell.materialEnoughForOrder : fromTable.materialEnoughForOrder,
          };
        }),
      })),
    })),
  };
}

function parseStrapSize(name) {
  const m = String(name || "").match(/\((\d+)\s*[_xх]\s*(\d+)\)/i);
  if (!m) return null;
  const length = Number(m[1]);
  const width = Number(m[2]);
  if (!(length > 0 && width > 0)) return null;
  return { length, width };
}

function formatDateTimeForPrint(date) {
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildPreviewRowsFromFurnitureTemplate(template, orderQty) {
  const qtyNum = Number(orderQty || 0);
  const baseQty = Number(template?.baseQty || 0) > 0 ? Number(template.baseQty) : 1;
  if (!(qtyNum > 0) || !Array.isArray(template?.details)) return [];
  return template.details.map((d) => {
    const perUnit = Number(d?.perUnit || 0);
    const raw = perUnit > 0 ? perUnit * qtyNum : 0;
    const rounded = Math.round(raw * 1000) / 1000;
    const normalizedQty = Number.isInteger(rounded) ? String(Math.trunc(rounded)) : String(rounded).replace(".", ",");
    const partName = String(d?.detailName || "").trim();
    return {
      part: partName,
      qty: normalizedQty,
      baseQty,
    };
  }).filter((x) => x.part);
}

export default function App() {
  function normalizeExecutorList(rawList, fallback) {
    const source = Array.isArray(rawList) ? rawList : [];
    const normalized = source
      .map((x) => String(x || "").trim())
      .filter(Boolean);
    return normalized.length > 0 ? normalized : fallback;
  }

  const [view, setView] = useState("shipment");
  const {
    tab,
    setTab,
    rows,
    setRows,
    query,
    setQuery,
    loading,
    setLoading,
  } = useOrders();
  /** Подраздел внутри «Обзор заказов»: канбан или список отгруженных (вкладка в конце блока). */
  const [overviewSubView, setOverviewSubView] = useState("kanban");
  const [shipmentBoard, setShipmentBoard] = useState({ sections: [] });
  const [planCatalogRows, setPlanCatalogRows] = useState([]);
  const [sectionCatalogRows, setSectionCatalogRows] = useState([]);
  const [sectionArticleRows, setSectionArticleRows] = useState([]);
  const [shipmentOrders, setShipmentOrders] = useState([]);
  const [selectedShipments, setSelectedShipments] = useState([]);
  const [planPreviews, setPlanPreviews] = useState([]);
  const [hoverTip, setHoverTip] = useState({ visible: false, text: "", x: 0, y: 0 });
  const [weekFilter, setWeekFilter] = useState("all");
  const [showAwaiting, setShowAwaiting] = useState(true);
  const [showOnPilka, setShowOnPilka] = useState(true);
  const [showOnKromka, setShowOnKromka] = useState(true);
  const [showOnPras, setShowOnPras] = useState(true);
  const [showReadyAssembly, setShowReadyAssembly] = useState(true);
  const [showAwaitShipment, setShowAwaitShipment] = useState(true);
  const [showShipped, setShowShipped] = useState(true);
  const [hiddenShipmentGroups, setHiddenShipmentGroups] = useState({});
  const [shipmentSort, setShipmentSort] = useState("name");
  const [shipmentViewMode, setShipmentViewMode] = useState("table");
  const [statsSort, setStatsSort] = useState("stage");
  const [laborSort, setLaborSort] = useState("total_desc");
  const [laborSubView, setLaborSubView] = useState("total");
  const [laborPlannerQtyByGroup, setLaborPlannerQtyByGroup] = useState({});
  const [collapsedSections, setCollapsedSections] = useState({});
  const [actionLoading, setActionLoading] = useState("");
  const [pendingStageActionKeys, setPendingStageActionKeys] = useState(() => new Set());
  const [error, setError] = useState("");
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [executorByOrder, setExecutorByOrder] = useState({});
  const [executorOptions, setExecutorOptions] = useState({
    kromka: KROMKA_EXECUTORS,
    pras: PRAS_EXECUTORS,
  });
  const [consumeDialogOpen, setConsumeDialogOpen] = useState(false);
  const [consumeEditMode, setConsumeEditMode] = useState(false);
  const [consumeDialogData, setConsumeDialogData] = useState(null);
  const [consumeMaterial, setConsumeMaterial] = useState("");
  const [consumeQty, setConsumeQty] = useState("");
  const [consumeSaving, setConsumeSaving] = useState(false);
  const [consumeError, setConsumeError] = useState("");
  const [consumeLoading, setConsumeLoading] = useState(false);
  const [strapDialogOpen, setStrapDialogOpen] = useState(false);
  const [strapTargetProduct, setStrapTargetProduct] = useState("");
  const [strapPlanWeek, setStrapPlanWeek] = useState("");
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [planSection, setPlanSection] = useState("Прочее");
  const [planArticle, setPlanArticle] = useState("");
  const [planMaterial, setPlanMaterial] = useState("");
  const [planWeek, setPlanWeek] = useState("");
  const [planQty, setPlanQty] = useState("");
  const [planSaving, setPlanSaving] = useState(false);
  const [strapDraft, setStrapDraft] = useState(() =>
    STRAP_OPTIONS.reduce((acc, name) => ({ ...acc, [name]: "" }), {})
  );
  const [strapItems, setStrapItems] = useState([]);
  const [laborRows, setLaborRows] = useState([]);
  const [laborImportedRows, setLaborImportedRows] = useState([]);
  const [laborSaveSelected, setLaborSaveSelected] = useState({});
  const [laborSavingByKey, setLaborSavingByKey] = useState({});
  const [laborSavedByKey, setLaborSavedByKey] = useState({});
  const [stageAuditRows, setStageAuditRows] = useState([]);
  const [activeOrderIds, setActiveOrderIds] = useState([]);
  const [warehouseRows, setWarehouseRows] = useState([]);
  const [materialsStockRows, setMaterialsStockRows] = useState([]);
  const [leftoversRows, setLeftoversRows] = useState([]);
  const [consumeHistoryRows, setConsumeHistoryRows] = useState([]);
  const [warehouseSubView, setWarehouseSubView] = useState("sheets");
  const [warehouseSyncLoading, setWarehouseSyncLoading] = useState(false);
  const [leftoversSyncLoading, setLeftoversSyncLoading] = useState(false);
  const [furnitureLoading, setFurnitureLoading] = useState(false);
  const [furnitureError, setFurnitureError] = useState("");
  const [furnitureWorkbook, setFurnitureWorkbook] = useState(null);
  const [furnitureActiveSheet, setFurnitureActiveSheet] = useState("");
  const [furnitureShowFormulas, setFurnitureShowFormulas] = useState(false);
  const [furnitureArticleRows, setFurnitureArticleRows] = useState([]);
  const [furnitureDetailArticleRows, setFurnitureDetailArticleRows] = useState([]);
  const [furnitureSelectedProduct, setFurnitureSelectedProduct] = useState("");
  const [furnitureSelectedQty, setFurnitureSelectedQty] = useState("1");
  const importPlanFileRef = useRef(null);
  const importLaborFileRef = useRef(null);
  const stageActionSeqRef = useRef(new Map());
  const authEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
  const isActionPending = useCallback((key) => pendingStageActionKeys.has(key), [pendingStageActionKeys]);

  function denyActionByRole(message) {
    setError(message);
    return false;
  }

  const { load } = useDataLoader({
    view,
    tab,
    callBackend,
    SHEET_MIRROR_GID,
    setLoading,
    setError,
    setRows,
    setShipmentBoard,
    setPlanCatalogRows,
    setSectionCatalogRows,
    setSectionArticleRows,
    setShipmentOrders,
    setFurnitureDetailArticleRows,
    setMaterialsStockRows,
    setLeftoversRows,
    setWarehouseRows,
    setLaborRows,
    setFurnitureArticleRows,
    normalizeShipmentBoard,
    mergeShipmentBoardWithTable,
    normalizeOrder,
    isOrdersDomainView,
    loadOrdersDomainData,
    loadShipmentDomainData,
    loadWarehouseDomainData,
    loadFurnitureDomainData,
    toUserError,
  });
  const {
    crmRole,
    crmAuthStrict,
    crmAuthStrictSaving,
    crmUsers,
    crmUsersLoading,
    crmUsersSaving,
    auditLog,
    auditLoading,
    auditError,
    auditAction,
    auditEntity,
    auditLimit,
    auditOffset,
    newCrmUserId,
    newCrmUserRole,
    newCrmUserNote,
    authEmail,
    authPassword,
    authSaving,
    authUser,
    setNewCrmUserId,
    setNewCrmUserRole,
    setNewCrmUserNote,
    setAuditAction,
    setAuditEntity,
    setAuthEmail,
    setAuthPassword,
    toggleCrmAuthStrict,
    loadCrmUsers,
    loadAuditLog,
    updateCrmUserRole,
    removeCrmUserRole,
    createCrmUserRole,
    signInWithSupabase,
    signOutSupabaseUser,
  } = useCrmRole({
    view,
    callBackend,
    toUserError,
    authEnabled,
    load,
    setError,
  });
  const canOperateProduction = crmRole === "operator" || crmRole === "manager" || crmRole === "admin";
  const canManageOrders = crmRole === "manager" || crmRole === "admin";
  const canAdminSettings = crmRole === "admin";
  const crmRoleLabel = CRM_ROLE_LABELS[crmRole] || CRM_ROLE_LABELS.viewer;
  const authUserLabel = String(authUser?.email || authUser?.phone || authUser?.id || "").trim();

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return undefined;
    const client = getSupabaseRealtimeClient();
    if (!client) return undefined;
    let disposed = false;
    let reloadTimer = null;

    const scheduleReload = () => {
      if (disposed) return;
      if (reloadTimer) window.clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(() => {
        reloadTimer = null;
        load().catch(() => {});
      }, 300);
    };

    const channel = client
      .channel("crm-orders-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        scheduleReload,
      )
      .subscribe();

    return () => {
      disposed = true;
      if (reloadTimer) window.clearTimeout(reloadTimer);
      client.removeChannel(channel).catch(() => {});
    };
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    async function loadCrmExecutors() {
      try {
        const payload = await callBackend("webGetCrmExecutors");
        if (cancelled) return;
        const source =
          Array.isArray(payload) && payload.length > 0 && payload[0] && typeof payload[0] === "object"
            ? payload[0]
            : payload && typeof payload === "object"
              ? payload
              : {};
        setExecutorOptions({
          kromka: normalizeExecutorList(source.kromka_executors || source.kromka, KROMKA_EXECUTORS),
          pras: normalizeExecutorList(source.pras_executors || source.pras, PRAS_EXECUTORS),
        });
      } catch (_) {
        // Keep environment defaults if RPC is missing or unavailable.
      }
    }
    loadCrmExecutors();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (view !== "overview") setOverviewSubView("kanban");
  }, [view]);

  useEffect(() => {
    let alive = true;
    setFurnitureLoading(true);
    setFurnitureError("");
    fetch(furnitureWorkbookUrl)
      .then((r) => r.arrayBuffer())
      .then((buf) => XLSX.read(buf, { type: "array", cellFormula: true, cellNF: true, cellText: true }))
      .then((wb) => {
        if (!alive) return;
        const names = Array.isArray(wb?.SheetNames) ? wb.SheetNames : [];
        setFurnitureWorkbook(wb);
        const nextSheet = names.includes(furnitureActiveSheet) ? furnitureActiveSheet : String(names[0] || "");
        setFurnitureActiveSheet(nextSheet);
        const templates = buildFurnitureTemplates(wb, nextSheet);
        const firstProduct = String(templates[0]?.productName || "");
        setFurnitureSelectedProduct((prev) => prev || firstProduct);
      })
      .catch((e) => {
        if (!alive) return;
        setFurnitureError(`Не удалось прочитать файл Мебель.xlsx: ${extractErrorMessage(e)}`);
      })
      .finally(() => {
        if (!alive) return;
        setFurnitureLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (view !== "warehouse") setWarehouseSubView("sheets");
  }, [view]);
  useEffect(() => {
    if (view !== "labor") setLaborSubView("total");
  }, [view]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("shipmentUiPrefs");
      if (!raw) return;
      const prefs = JSON.parse(raw);
      if (prefs && typeof prefs === "object") {
        if (typeof prefs.weekFilter === "string") setWeekFilter(prefs.weekFilter);
        if (typeof prefs.shipmentSort === "string") setShipmentSort(prefs.shipmentSort);
        if (typeof prefs.showAwaiting === "boolean") setShowAwaiting(prefs.showAwaiting);
        if (typeof prefs.showOnPilka === "boolean") setShowOnPilka(prefs.showOnPilka);
        if (typeof prefs.showOnKromka === "boolean") setShowOnKromka(prefs.showOnKromka);
        if (typeof prefs.showOnPras === "boolean") setShowOnPras(prefs.showOnPras);
        if (typeof prefs.showReadyAssembly === "boolean") setShowReadyAssembly(prefs.showReadyAssembly);
        if (typeof prefs.showAwaitShipment === "boolean") setShowAwaitShipment(prefs.showAwaitShipment);
        if (typeof prefs.showShipped === "boolean") setShowShipped(prefs.showShipped);
        if (typeof prefs.showOnlyEmpty === "boolean") setShowAwaiting(prefs.showOnlyEmpty);
        if (typeof prefs.showCompletedRedCells === "boolean") setShowShipped(prefs.showCompletedRedCells);
        if (prefs.collapsedSections && typeof prefs.collapsedSections === "object") {
          setCollapsedSections(prefs.collapsedSections);
        }
      }
    } catch (_) {}
  }, []);

  function resetShipmentFilters() {
    setWeekFilter(DEFAULT_SHIPMENT_PREFS.weekFilter);
    setShipmentSort(DEFAULT_SHIPMENT_PREFS.shipmentSort);
    setShowAwaiting(DEFAULT_SHIPMENT_PREFS.showAwaiting);
    setShowOnPilka(DEFAULT_SHIPMENT_PREFS.showOnPilka);
    setShowOnKromka(DEFAULT_SHIPMENT_PREFS.showOnKromka);
    setShowOnPras(DEFAULT_SHIPMENT_PREFS.showOnPras);
    setShowReadyAssembly(DEFAULT_SHIPMENT_PREFS.showReadyAssembly);
    setShowAwaitShipment(DEFAULT_SHIPMENT_PREFS.showAwaitShipment);
    setShowShipped(DEFAULT_SHIPMENT_PREFS.showShipped);
    setHiddenShipmentGroups({});
    setCollapsedSections(DEFAULT_SHIPMENT_PREFS.collapsedSections);
  }

  useEffect(() => {
    try {
      localStorage.setItem(
        "shipmentUiPrefs",
        JSON.stringify({
          weekFilter,
          shipmentSort,
          showAwaiting,
          showOnPilka,
          showOnKromka,
          showOnPras,
          showReadyAssembly,
          showAwaitShipment,
          showShipped,
          collapsedSections,
        })
      );
    } catch (_) {}
  }, [
    weekFilter,
    shipmentSort,
    showAwaiting,
    showOnPilka,
    showOnKromka,
    showOnPras,
    showReadyAssembly,
    showAwaitShipment,
    showShipped,
    collapsedSections,
  ]);

  function sectionCollapseKey(name) {
    return `${shipmentSort}:${String(name || "")}`;
  }

  function isSectionCollapsed(name) {
    return !!collapsedSections[sectionCollapseKey(name)];
  }

  function toggleSectionCollapsed(name) {
    const key = sectionCollapseKey(name);
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function isDone(s) {
    const v = String(s || "").toLowerCase();
    return v.includes("готов") || v.includes("собрано");
  }
  function getCurrentStage(order) {
    return getStageLabel(order);
  }
  function getColorGroup(item) {
    const text = String(item || "").trim();
    if (!text) return "Без цвета";
    const parts = text.split(".").map((x) => String(x || "").trim()).filter(Boolean);
    const tail = String(parts[parts.length - 1] || "").trim();
    return tail || "Без цвета";
  }
  function resolvePlanMaterial(articleRow) {
    const fromApi = String(articleRow?.material || "").trim();
    if (fromApi) return fromApi;
    const itemName = String(articleRow?.itemName || "").trim();
    const parsedColor = getColorGroup(itemName);
    if (parsedColor && parsedColor !== "Без цвета") return parsedColor;
    return "";
  }
  function getWeekday(order) {
    const d = new Date(order?.createdAt || "");
    if (!isFinite(d.getTime())) return "Неизвестно";
    return d.toLocaleDateString("ru-RU", { weekday: "long" });
  }
  function getStageClassByLabel(label) {
    const s = String(label || "").toLowerCase();
    if (s.includes("отгруж")) return "ship";
    if (s.includes("отправ") && !s.includes("готово к отправке")) return "ship";
    if (s.includes("собран")) return "done";
    if (s.includes("готов")) return "ready";
    if (s.includes("присад")) return "pras";
    if (s.includes("кром")) return "kromka";
    return "pilka";
  }
  function isInWork(s) {
    return String(s || "").toLowerCase().includes("в работе");
  }

  function closeConsumeDialog() {
    setConsumeDialogOpen(false);
    setConsumeEditMode(false);
    setConsumeDialogData(null);
    setConsumeMaterial("");
    setConsumeQty("");
    setConsumeError("");
    setConsumeSaving(false);
    setConsumeLoading(false);
  }

  async function submitConsume(materialRaw, qtyRaw) {
    if (!canOperateProduction) {
      setConsumeError("Недостаточно прав для списания листов.");
      return;
    }
    if (!consumeDialogData?.orderId) return;
    const material = String(materialRaw || "").trim();
    const qty = Number(String(qtyRaw || "").replace(",", "."));
    if (!material) return setConsumeError("Укажите материал");
    if (!isFinite(qty) || qty <= 0) return setConsumeError("Некорректное количество");
    setConsumeSaving(true);
    setConsumeError("");
    try {
      await callBackend("webConsumeSheetsByOrderId", {
        orderId: consumeDialogData.orderId,
        material,
        qty,
      });
      logConsumeToGoogleSheet({
        orderId: consumeDialogData.orderId,
        item: String(consumeDialogData.item || ""),
        material,
        week: String(consumeDialogData.week || ""),
        qty,
      });
      closeConsumeDialog();
      await load();
      syncLeftoversToGoogleSheet({ silent: true });
    } catch (e) {
      setConsumeError(String(e.message || e));
    } finally {
      setConsumeSaving(false);
    }
  }

  async function notifyAssemblyReadyTelegram(meta = {}) {
    const baseUrl = String(SUPABASE_URL || "").replace(/\/$/, "");
    const token = String(SUPABASE_ANON_KEY || "").trim();
    if (!baseUrl || !token) return;
    try {
      await notifyAssemblyReadyTelegramEdge(baseUrl, token, meta);
    } catch (_) {
      // Notification is best-effort and should not block production workflow.
    }
  }

  async function notifyFinalStageTelegram(meta = {}) {
    const baseUrl = String(SUPABASE_URL || "").replace(/\/$/, "");
    const token = String(SUPABASE_ANON_KEY || "").trim();
    if (!baseUrl || !token) return;
    try {
      await notifyFinalStageTelegramEdge(baseUrl, token, meta);
    } catch (_) {
      // Notification is best-effort and should not block production workflow.
    }
  }

  async function syncWarehouseFromGoogleSheet() {
    const baseUrl = String(SUPABASE_URL || "").replace(/\/$/, "");
    const token = String(SUPABASE_ANON_KEY || "").trim();
    if (!baseUrl || !token) {
      setError("Не настроен доступ к Supabase (URL/ANON key).");
      return;
    }
    setWarehouseSyncLoading(true);
    setError("");
    try {
      await syncWarehouseFromGoogleSheetEdge(baseUrl, token, {
        sheetId: WAREHOUSE_SYNC_SHEET_ID,
        gid: WAREHOUSE_SYNC_GID,
        leftoversGid: LEFTOVERS_SYNC_GID,
      });
      await load();
    } catch (e) {
      setError(`Не удалось синхронизировать склад: ${extractErrorMessage(e)}`);
    } finally {
      setWarehouseSyncLoading(false);
    }
  }

  async function syncLeftoversToGoogleSheet(options = {}) {
    const silent = Boolean(options.silent);
    const baseUrl = String(SUPABASE_URL || "").replace(/\/$/, "");
    const token = String(SUPABASE_ANON_KEY || "").trim();
    if (!baseUrl || !token) {
      if (!silent) setError("Не настроен доступ к Supabase (URL/ANON key).");
      return;
    }
    if (!silent) setLeftoversSyncLoading(true);
    if (!silent) setError("");
    try {
      await syncLeftoversToGoogleSheetEdge(baseUrl, token, {
        sheetId: WAREHOUSE_SYNC_SHEET_ID,
        gid: LEFTOVERS_SYNC_GID,
      });
    } catch (e) {
      if (!silent) {
        setError(`Не удалось выгрузить остатки в Google Sheet: ${extractErrorMessage(e)}`);
      }
    } finally {
      if (!silent) setLeftoversSyncLoading(false);
    }
  }

  async function logConsumeToGoogleSheet(meta = {}) {
    const baseUrl = String(SUPABASE_URL || "").replace(/\/$/, "");
    const token = String(SUPABASE_ANON_KEY || "").trim();
    if (!baseUrl || !token) return;
    try {
      await logConsumeToGoogleSheetEdge(baseUrl, token, {
        sheetId: WAREHOUSE_SYNC_SHEET_ID,
        sheetName: CONSUME_LOG_SHEET_NAME,
        orderId: String(meta.orderId || "").trim(),
        item: String(meta.item || "").trim(),
        material: String(meta.material || "").trim(),
        week: String(meta.week || "").trim(),
        qty: Number(meta.qty || 0),
      });
    } catch (_) {
      // Best-effort sync to sheet should not block core consumption flow.
    }
  }

  async function syncPlanCellToGoogleSheet(meta = {}) {
    // Best-effort: обновление Google Sheet не должно ломать сохранение плана в Supabase.
    if (!["supabase", "shadow"].includes(String(BACKEND_PROVIDER || ""))) return;
    const baseUrl = String(SUPABASE_URL || "").replace(/\/$/, "");
    const token = String(SUPABASE_ANON_KEY || "").trim();
    if (!baseUrl || !token) return;

    const payload = {
      sheetId: PLAN_SYNC_SHEET_ID,
      gid: PLAN_SYNC_GID,
      sectionName: String(meta.sectionName || "").trim(),
      item: String(meta.item || "").trim(),
      material: String(meta.material || "").trim(),
      week: String(meta.week || "").trim(),
      qty: Number(meta.qty || 0),
      stageCode: String(meta.stageCode || "").trim(),
      stage: String(meta.stage || "").trim(),
      stageComment: String(meta.stageComment || "").trim(),
      orderId: String(meta.orderId || "").trim(),
    };
    if (!payload.sectionName || !payload.item || !payload.material || !payload.week || !Number.isFinite(payload.qty) || payload.qty <= 0) {
      return;
    }

    try {
      await syncPlanCellToGoogleSheetEdge(baseUrl, token, payload);
    } catch (_) {
      // Keep saving plan resilient; still log to console for troubleshooting.
      console.warn("[CRM] sync-plan-cell-to-gsheet failed (best-effort)", payload);
    }
  }

  function openPilkaDoneConsumeDialog(orderId, meta = {}) {
    const init = buildPilkaDoneDialogInit(orderId, meta);
    const isPlankOrder = init.isPlankOrder;
    const defaultQty = init.consumeQty;

    // Open dialog immediately; fetch hints in background.
    setConsumeDialogData(init.consumeDialogData);
    setConsumeMaterial(init.consumeMaterial);
    setConsumeQty(init.consumeQty);
    setConsumeEditMode(true);
    setConsumeError("");
    setConsumeLoading(true);
    setConsumeDialogOpen(true);

    // Do not block UI while fetching consume options.
    callBackend("webGetConsumeOptions", { orderId })
      .then((options) => {
        setConsumeDialogData(options || { orderId });
        const suggested = isPlankOrder
          ? "Черный"
          : String(options?.suggestedMaterial || meta.material || "").trim();
        if (suggested) setConsumeMaterial(suggested);
        const suggestedSheetsRaw = options?.suggestedSheets ?? options?.sheetsNeeded ?? defaultQty ?? 0;
        const suggestedSheets = Number(suggestedSheetsRaw);
        if (Number.isFinite(suggestedSheets) && suggestedSheets > 0) {
          setConsumeQty((prev) => {
            const prevNum = Number(String(prev || "").replace(",", "."));
            if (Number.isFinite(prevNum) && prevNum > 0) return prev;
            return String(suggestedSheets);
          });
        }
        if (!isPlankOrder && suggested) setConsumeEditMode(false);
      })
      .catch(() => {
        // Keep manual mode without hints.
      })
      .finally(() => setConsumeLoading(false));
  }

  function openPilkaDoneConsumeDialogOnError(orderId, meta = {}, error) {
    const init = buildPilkaDoneDialogInit(orderId, meta, { useMetaMaterialOnError: true });
    setConsumeDialogData(init.consumeDialogData);
    setConsumeMaterial(init.consumeMaterial);
    setConsumeQty(init.consumeQty);
    setConsumeEditMode(true);
    setConsumeLoading(false);
    setConsumeError(`Этап "Пила: Готово" вернул ошибку, но списание можно выполнить вручную: ${extractErrorMessage(error)}`);
    setConsumeDialogOpen(true);
  }

  async function runAction(action, orderId, payload = {}, meta = {}) {
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для изменения этапов производства.");
      return;
    }
    const key = `${action}:${orderId}`;
    const seq = (stageActionSeqRef.current.get(key) || 0) + 1;
    stageActionSeqRef.current.set(key, seq);
    setPendingStageActionKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    setError("");
    const targetOrderId = String(orderId || "");
    const hasOptimisticRule = Boolean(ACTION_OPTIMISTIC_MAP[action]);
    let rowsSnapshot = null;
    let shipmentOrdersSnapshot = null;
    if (hasOptimisticRule) {
      const patchList = (list, setSnapshot) =>
        list.map((row) => {
          const rowOrderId = String(row.orderId || row.order_id || "");
          if (rowOrderId !== targetOrderId) return row;
          setSnapshot(row);
          return applyOptimisticOrderRow(row, action, payload);
        });
      setRows((prev) =>
        patchList(prev, (row) => {
          rowsSnapshot = row;
        }),
      );
      setShipmentOrders((prev) =>
        patchList(prev, (row) => {
          shipmentOrdersSnapshot = row;
        }),
      );
    }
    try {
      const data = await callBackend(action, { orderId, ...payload });
      const stageSync = STAGE_SYNC_META[action];
      if (stageSync) {
        const sourceOrder = orderIndexById.get(String(orderId)) || {};
        const stageSyncPayload = buildStageSyncPayload({
          orderId,
          meta,
          sourceOrder,
          stageSync,
          getMaterialLabel,
          resolveSectionNameForOrder,
        });
        if (stageSyncPayload) {
          void syncPlanCellToGoogleSheet(stageSyncPayload);
        }
      }
      if (action === "webSetPrasDone" && meta.notifyOnAssembly) {
        notifyAssemblyReadyTelegram(buildNotifyPayload(orderId, meta));
      }
      if (action === "webSetShippingDone" && meta.notifyOnFinalStage) {
        notifyFinalStageTelegram(buildNotifyPayload(orderId, meta));
      }
      if (action === "webSetPilkaDone") {
        openPilkaDoneConsumeDialog(orderId, meta);
        return;
      }
      // Non-blocking reconcile: optimistic state updates instantly, backend sync runs in background.
      void load();
    } catch (e) {
      if (hasOptimisticRule && stageActionSeqRef.current.get(key) === seq) {
        if (rowsSnapshot) {
          setRows((prev) =>
            prev.map((row) => {
              const rowOrderId = String(row.orderId || row.order_id || "");
              return rowOrderId === targetOrderId ? rowsSnapshot : row;
            }),
          );
        }
        if (shipmentOrdersSnapshot) {
          setShipmentOrders((prev) =>
            prev.map((row) => {
              const rowOrderId = String(row.orderId || row.order_id || "");
              return rowOrderId === targetOrderId ? shipmentOrdersSnapshot : row;
            }),
          );
        }
      }
      if (action === "webSetPilkaDone") {
        openPilkaDoneConsumeDialogOnError(orderId, meta, e);
      }
      setError(toUserError(e));
    } finally {
      if (stageActionSeqRef.current.get(key) === seq) {
        setPendingStageActionKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    }
  }

  const weeks = useMemo(() => {
    if (view === "shipment") {
      const set = new Set();
      (shipmentBoard.sections || []).forEach((s) =>
        (s.items || []).forEach((it) =>
          (it.cells || []).forEach((c) => c.week && set.add(String(c.week)))
        )
      );
      return [...set].sort((a, b) => Number(a) - Number(b));
    }
    if (view === "labor") {
      return [...new Set(laborRows.map((x) => String(x.week || "")).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
    }
    return [...new Set(rows.map((x) => String(x.week || "")).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
  }, [rows, shipmentBoard, laborRows, view]);
  const planCatalogBySection = useMemo(() => {
    const map = {};
    // Base options from current shipment cells.
    (shipmentBoard.sections || []).forEach((s) => {
      const section = String(s?.name || "").trim();
      if (!section) return;
      (s.items || []).forEach((it) => {
        const itemName = String(it?.item || "").trim();
        if (!itemName) return;
        const materialLabel = getMaterialLabel(itemName, it?.material);
        if (!map[section]) map[section] = [];
        const exists = map[section].some((x) => normText(x.material) === normText(materialLabel));
        if (!exists) map[section].push({ material: materialLabel, itemName });
      });
      map[section].sort((a, b) => a.material.localeCompare(b.material, "ru"));
    });
    // Merge full catalog so materials are available even without active shipment rows.
    (planCatalogRows || []).forEach((row) => {
      const section = String(row?.section_name || row?.sectionName || "").trim();
      const itemName = String(row?.item_name || row?.itemName || "").trim();
      const material = String(row?.material || "").trim();
      if (!section || !itemName || !material) return;
      if (!map[section]) map[section] = [];
      const exists = map[section].some((x) => normText(x.material) === normText(material));
      if (!exists) map[section].push({ material, itemName });
    });
    Object.keys(map).forEach((section) => {
      map[section].sort((a, b) => a.material.localeCompare(b.material, "ru"));
    });
    return map;
  }, [shipmentBoard, planCatalogRows]);
  const shipmentSectionNames = useMemo(() => {
    const names = Object.keys(planCatalogBySection).filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, "ru"));
  }, [planCatalogBySection]);
  const sectionCatalogNames = useMemo(() => {
    return (sectionCatalogRows || [])
      .map((x) => String(x.section_name || x.sectionName || "").trim())
      .filter(Boolean);
  }, [sectionCatalogRows]);
  const sectionOptions = useMemo(() => {
    return [...sectionCatalogNames, ...shipmentSectionNames, "Прочее"]
      .filter((v, i, a) => a.indexOf(v) === i);
  }, [sectionCatalogNames, shipmentSectionNames]);
  const sectionArticles = useMemo(() => {
    const hasWhiteAliasSection = sectionOptions.includes(`${planSection} белый`);
    const rows = (sectionArticleRows || [])
      .map((x) => ({
        sectionName: String(x.section_name || x.sectionName || "").trim(),
        article: String(x.article || "").trim(),
        itemName: normalizeCatalogItemName(String(x.item_name || x.itemName || "").trim()),
        material: String(x.material || "").trim(),
      }))
      .filter((x) => x.sectionName === planSection && x.article && x.itemName)
      .filter((x) => {
        if (!hasWhiteAliasSection) return true;
        return !/(белый|белые ноги)/i.test(x.itemName);
      })
      .sort((a, b) => a.itemName.localeCompare(b.itemName, "ru"));
    const byItemName = new Map();
    rows.forEach((row) => {
      const dedupKey = normalizeCatalogDedupKey(row.itemName);
      if (!byItemName.has(dedupKey)) {
        byItemName.set(dedupKey, row);
      }
    });
    return [...byItemName.values()];
  }, [sectionArticleRows, planSection, sectionOptions]);
  const selectedArticleRow = useMemo(() => {
    return sectionArticles.find((x) => x.itemName === planArticle) || null;
  }, [sectionArticles, planArticle]);
  function handlePlanSectionChange(nextSection) {
    setPlanSection(nextSection);
    const firstArticle = (sectionArticleRows || [])
      .map((x) => ({
        sectionName: String(x.section_name || x.sectionName || "").trim(),
        article: String(x.article || "").trim(),
        itemName: String(x.item_name || x.itemName || "").trim(),
        material: String(x.material || "").trim(),
      }))
      .find((x) => x.sectionName === nextSection && x.article);
    setPlanArticle(firstArticle?.itemName || "");
    setPlanMaterial(resolvePlanMaterial(firstArticle));
  }
  function handlePlanArticleChange(nextArticle) {
    setPlanArticle(nextArticle);
    const matched = sectionArticles.find((x) => x.itemName === nextArticle);
    setPlanMaterial(resolvePlanMaterial(matched));
  }
  const articleLookupByItemKey = useMemo(() => {
    const map = new Map();
    (sectionArticleRows || []).forEach((x) => {
      const article = String(x.article || "").trim();
      const itemName = String(x.item_name || x.itemName || "").trim();
      if (!article || !itemName) return;
      const key = normalizeFurnitureKey(itemName);
      if (!key || map.has(key)) return;
      map.set(key, article);
    });
    return map;
  }, [sectionArticleRows]);
  const resolvedPlanItem = useMemo(() => {
    return String(selectedArticleRow?.itemName || "").trim();
  }, [selectedArticleRow]);

  const shipmentOrderMaps = useMemo(() => {
    const byRowWeek = new Map();
    const byItemWeek = new Map();
    (shipmentOrders || []).forEach((o) => {
      const week = String(o?.week || "").trim();
      if (!week) return;
      const sourceRow = String(o?.source_row_id || o?.sourceRowId || "").trim();
      if (sourceRow) mergeOrderPreferNewer(byRowWeek, shipmentOrderKey(sourceRow, week), o);
      const item = String(o?.item || "").trim();
      if (item) mergeOrderPreferNewer(byItemWeek, shipmentOrderItemWeekKey(item, week), o);
    });
    return { byRowWeek, byItemWeek };
  }, [shipmentOrders]);
  const baseOrderFiltered = useBaseOrderFilter({
    rows,
    view,
    tab,
    query,
    weekFilter,
    getOverviewLaneId,
    isStorageLikeName,
    isObvyazkaSectionName,
    isGarbageShipmentItemName,
  });
  const laborFiltered = useLaborFilter({
    laborRows,
    query,
    weekFilter,
  });
  const sheetMirrorFiltered = useSheetMirrorFilter({
    rows,
    query,
  });

  const orderIndexById = useMemo(() => {
    const map = new Map();
    const add = (x) => {
      const id = String(x?.orderId || x?.order_id || "").trim();
      if (!id || map.has(id)) return;
      map.set(id, x);
    };
    (rows || []).forEach(add);
    (shipmentOrders || []).forEach(add);
    return map;
  }, [rows, shipmentOrders]);

  function resolveSectionNameForOrder(order) {
    const week = String(order?.week || "").trim();
    const sourceRowId = String(order?.sourceRowId || order?.source_row_id || "").trim();
    const itemName = String(order?.item || "").trim();
    if (!week) return "";
    const sections = Array.isArray(shipmentBoard?.sections) ? shipmentBoard.sections : [];
    for (const section of sections) {
      const sectionName = String(section?.name || "").trim();
      const items = Array.isArray(section?.items) ? section.items : [];
      for (const it of items) {
        const rowId = String(it?.sourceRowId || it?.source_row_id || it?.row || "").trim();
        const cells = Array.isArray(it?.cells) ? it.cells : [];
        for (const c of cells) {
          const cellWeek = String(c?.week || "").trim();
          if (!cellWeek || cellWeek !== week) continue;
          if (sourceRowId && rowId && rowId === sourceRowId) return sectionName;
          if (!sourceRowId && itemName && String(it?.item || "").trim() === itemName) return sectionName;
        }
      }
    }
    return "";
  }

  function passesShipmentStageFilter(stageKey) {
    if (stageKey === "awaiting") return showAwaiting;
    if (stageKey === "on_pilka_wait" || stageKey === "on_pilka_work") return showOnPilka;
    if (stageKey === "on_kromka_wait" || stageKey === "on_kromka_work") return showOnKromka;
    if (stageKey === "on_pras_wait" || stageKey === "on_pras_work") return showOnPras;
    if (stageKey === "ready_assembly") return showReadyAssembly;
    if (stageKey === "assembled_wait_ship") return showAwaitShipment;
    if (stageKey === "shipped") return showShipped;
    return true;
  }
  const shipmentFiltered = useShipmentFilter({
    shipmentBoard,
    shipmentOrderMaps,
    query,
    weekFilter,
    isStorageLikeName,
    isObvyazkaSectionName,
    isGarbageShipmentItemName,
    getShipmentStageKey,
    passesShipmentStageFilter,
  });

  const filtered = useMemo(() => {
    if (view === "shipment") return shipmentFiltered;
    if (view === "labor") return laborFiltered;
    if (view === "sheetMirror") return sheetMirrorFiltered;
    return baseOrderFiltered;
  }, [
    baseOrderFiltered,
    laborFiltered,
    sheetMirrorFiltered,
    shipmentFiltered,
    view,
  ]);

  useEffect(() => {
    if (view !== "labor" || laborSubView !== "stages") {
      setStageAuditRows([]);
      setActiveOrderIds([]);
      return;
    }
    if (!canManageOrders) {
      setStageAuditRows([]);
      setActiveOrderIds([]);
      return;
    }

    let cancelled = false;
    const ids = (filtered || [])
      .map((x) => String(x?.orderId || x?.order_id || "").trim())
      .filter(Boolean);
    setActiveOrderIds(Array.from(new Set(ids)));

    async function loadLaborStageTimeline() {
      try {
        const payload = await callBackend("webGetAuditLog", {
          limit: 1000,
          offset: 0,
          action: null,
        });
        if (cancelled) return;
        setStageAuditRows(Array.isArray(payload) ? payload : []);
      } catch (e) {
        if (cancelled) return;
        setStageAuditRows([]);
        setError(toUserError(e));
      }
    }

    loadLaborStageTimeline();
    return () => {
      cancelled = true;
    };
  }, [view, laborSubView, canManageOrders, filtered, setError]);

  const overviewShippedOnly = useMemo(() => {
    if (view !== "overview") return [];
    return filtered.filter((x) => getOverviewLaneId(x) === "shipped");
  }, [view, filtered]);

  const visibleCellsForItem = useCallback((it) => {
    const sourceRow = it?.sourceRowId != null ? String(it.sourceRowId) : String(it?.row || "");
    return (it?.cells || []).filter((c) => {
      const qtyOk = (Number(c.qty) || 0) > 0;
      if (!qtyOk) return false;
      const byWeek = weekFilter === "all" || String(c.week || "") === weekFilter;
      if (!byWeek) return false;
      const stageKey = getShipmentStageKey(c, sourceRow, shipmentOrderMaps, it.item);
      return passesShipmentStageFilter(stageKey);
    });
  }, [weekFilter, shipmentOrderMaps, passesShipmentStageFilter]);

  function weekSortValue(it) {
    const arr = visibleCellsForItem(it)
      .map((c) => Number(c.week))
      .filter((n) => Number.isFinite(n));
    if (!arr.length) return 9999;
    return Math.min(...arr);
  }

  function colorSortValue(it) {
    return normText(it?.material || "");
  }

  function sortItemsForShipment(items) {
    const arr = [...(items || [])];
    arr.sort((a, b) => {
      if (shipmentSort === "week") {
        const wa = weekSortValue(a);
        const wb = weekSortValue(b);
        if (wa !== wb) return wa - wb;
      } else if (shipmentSort === "color") {
        const wa = weekSortValue(a);
        const wb = weekSortValue(b);
        if (wa !== wb) return wa - wb;
        const ca = colorSortValue(a);
        const cb = colorSortValue(b);
        if (ca !== cb) return ca.localeCompare(cb, "ru");
      }
      return String(a.item || "").localeCompare(String(b.item || ""), "ru");
    });
    return arr;
  }

  const strapStockByMaterial = useMemo(() => {
    const result = { "Черный": 0, "Белый": 0 };
    if (!Array.isArray(materialsStockRows) || materialsStockRows.length === 0) return result;
    materialsStockRows.forEach((row) => {
      const material = String(row?.material || "").trim();
      const key = normalizeFurnitureKey(material);
      const qtySheets = Number(row?.qty_sheets ?? row?.qtySheets ?? 0);
      const qty = Number.isFinite(qtySheets) ? qtySheets : 0;
      if (key.includes("черн")) result["Черный"] = Math.max(result["Черный"], qty);
      if (key.includes("бел")) result["Белый"] = Math.max(result["Белый"], qty);
    });
    return result;
  }, [materialsStockRows]);

  const shipmentRenderSections = useMemo(() => {
    if (view !== "shipment") return [];

    let baseSections = [];

    // Режим "по названию": текущие секции по моделям (как было).
    if (shipmentSort === "name") {
      baseSections = [...filtered]
        .sort((a, b) => {
          const ka = sectionSortKey(a.name, SHIPMENT_SECTION_ORDER);
          const kb = sectionSortKey(b.name, SHIPMENT_SECTION_ORDER);
          if (ka !== kb) return ka - kb;
          return String(a.name || "").localeCompare(String(b.name || ""), "ru");
        })
        .map((section) => ({
          name: section.name,
          items: sortItemsForShipment(section.items || []),
        }));
    } else {
      // Для режимов "по цвету" и "по неделе" убираем секции по моделям.
      const groups = {};
      (filtered || []).forEach((section) => {
        (section.items || []).forEach((it) => {
          const visibleCells = visibleCellsForItem(it);
          if (!visibleCells.length) return;

          if (shipmentSort === "color") {
            const key = String(it.material || "Материал не указан").trim() || "Материал не указан";
            if (!groups[key]) groups[key] = [];
            groups[key].push({ ...it, cells: visibleCells });
            return;
          }

          // shipmentSort === "week"
          visibleCells.forEach((cell) => {
            const wk = String(cell.week || "-").trim() || "-";
            const key = `Неделя ${wk}`;
            if (!groups[key]) groups[key] = {};
            const rowKey = String(it.row);
            if (!groups[key][rowKey]) groups[key][rowKey] = { ...it, cells: [] };
            groups[key][rowKey].cells.push(cell);
          });
        });
      });

      if (shipmentSort === "color") {
        baseSections = Object.keys(groups)
          .sort((a, b) => a.localeCompare(b, "ru"))
          .map((name) => ({
            name,
            items: sortItemsForShipment(groups[name]),
          }));
      } else {
        baseSections = Object.keys(groups)
          .sort((a, b) => {
            const na = Number(String(a).replace(/[^\d]/g, ""));
            const nb = Number(String(b).replace(/[^\d]/g, ""));
            if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
            return String(a).localeCompare(String(b), "ru");
          })
          .map((name) => ({
            name,
            items: sortItemsForShipment(Object.values(groups[name])),
          }));
      }
    }

    if (!strapItems.length) return baseSections;
    const strapRows = strapItems.map((x, idx) => {
      const size = parseStrapSize(x.name);
      const stripsPerSheet = size ? Math.floor(STRAP_SHEET_HEIGHT / size.width) : 0;
      const perStrip = size ? Math.floor(STRAP_SHEET_WIDTH / size.length) : 0;
      const outputPerSheet = stripsPerSheet * perStrip;
      const qty = Number(x.qty || 0);
      const sheetsNeeded = outputPerSheet > 0 ? Math.ceil(qty / outputPerSheet) : 0;
      const material = resolveStrapMaterialByProduct(x.productName || "");
      const availableSheets = Number(strapStockByMaterial[material] || 0);
      return {
        row: `strap-order:${idx}`,
        sourceRowId: `strap-order:${idx}`,
        item: strapNameToOrderItem(x.name),
        strapProduct: String(x.productName || "").trim(),
        material,
        cells: [
          {
            col: `strap-order-col:${idx}`,
            sourceColId: `strap-order-col:${idx}`,
            week: "-",
            qty,
            bg: "#ffffff",
            canSendToWork: false,
            inWork: false,
            sheetsNeeded,
            outputPerSheet,
            availableSheets,
            note: "Обвязка: добавлена как заказ",
          },
        ],
      };
    });

    return [...baseSections, { name: "Обвязка", items: sortItemsForShipment(strapRows) }];
  }, [view, shipmentSort, filtered, strapItems, strapStockByMaterial]);

  const kpi = useMemo(() => {
    const total = filtered.length;
    const stageWork = (o) => {
      if (view !== "workshop") return statusClass(o) === "work";
      if (tab === "pilka") return isInWork(o.pilkaStatus);
      if (tab === "kromka") return isInWork(o.kromkaStatus);
      if (tab === "pras") return isInWork(o.prasStatus);
      if (tab === "assembly") return isInWork(o.assemblyStatus);
      if (tab === "done") return false;
      return isInWork(o.pilkaStatus) || isInWork(o.kromkaStatus) || isInWork(o.prasStatus);
    };
    const onPause = (s) => String(s || "").toLowerCase().includes("пауза");
    const stagePause = (o) => {
      if (view !== "workshop") return statusClass(o) === "pause";
      if (tab === "pilka") return onPause(o.pilkaStatus);
      if (tab === "kromka") return onPause(o.kromkaStatus);
      if (tab === "pras") return onPause(o.prasStatus);
      if (tab === "assembly") return onPause(o.assemblyStatus);
      if (tab === "done") return false;
      return onPause(o.pilkaStatus) || onPause(o.kromkaStatus) || onPause(o.prasStatus);
    };
    const work = filtered.filter(stageWork).length;
    const paused = filtered.filter(stagePause).length;
    const done =
      view === "workshop"
        ? filtered.filter((x) => resolvePipelineStage(x) === PipelineStage.ASSEMBLED).length
        : filtered.filter((x) => TERMINAL_PIPELINE_STAGES.has(resolvePipelineStage(x))).length;
    return { total, work, paused, done };
  }, [filtered, view, tab]);
  const statsGroups = useMemo(() => {
    if (view !== "stats") return [];
    const map = {};
    filtered.forEach((o) => {
      let key = "";
      if (statsSort === "stage") key = getCurrentStage(o);
      else if (statsSort === "readiness") {
        const cls = statusClass(o);
        key = cls === "done" ? "Готово" : cls === "work" ? "В работе" : cls === "pause" ? "Пауза" : "Ожидание";
      } else if (statsSort === "color") key = getColorGroup(o.item);
      else key = getWeekday(o);
      if (!map[key]) map[key] = { key, count: 0, qty: 0, orders: [] };
      map[key].count += 1;
      map[key].qty += Number(o.qty || 0);
      map[key].orders.push(o);
    });
    return Object.values(map).sort((a, b) => String(a.key).localeCompare(String(b.key), "ru"));
  }, [filtered, view, tab, statsSort]);
  const statsList = useMemo(() => {
    if (view !== "stats") return [];
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (statsSort === "stage") {
        const sa = getStageLabel(a);
        const sb = getStageLabel(b);
        if (sa !== sb) return sa.localeCompare(sb, "ru");
      } else if (statsSort === "readiness") {
        const ra = statusClass(a);
        const rb = statusClass(b);
        if (ra !== rb) return ra.localeCompare(rb, "ru");
      } else if (statsSort === "color") {
        const ca = getColorGroup(a.item);
        const cb = getColorGroup(b.item);
        if (ca !== cb) return ca.localeCompare(cb, "ru");
      } else if (statsSort === "weekday") {
        const wa = getWeekday(a);
        const wb = getWeekday(b);
        if (wa !== wb) return wa.localeCompare(wb, "ru");
      }
      return String(a.item || "").localeCompare(String(b.item || ""), "ru");
    });
    return arr;
  }, [filtered, view, statsSort]);
  const workshopRows = useWorkshopRows({
    filtered,
    view,
    tab,
    isDone,
    isInWork,
    getOverviewLaneId,
    isOrderCustomerShipped,
  });
  const overviewColumns = useMemo(() => {
    if (view !== "overview") return [];
    const defs = [
      { id: "pilka", title: "Пила" },
      { id: "kromka", title: "Кромка" },
      { id: "pras", title: "Присадка" },
      { id: "workshop_complete", title: "Готов к сборке" },
      { id: "assembled", title: "Собран" },
      { id: "ready_to_ship", title: "Готово к отправке" },
    ];
    const grouped = Object.fromEntries(defs.map((x) => [x.id, []]));
    (filtered || []).forEach((o) => {
      const lane = getOverviewLaneId(o);
      if (!grouped[lane]) grouped[lane] = [];
      grouped[lane].push(o);
    });
    defs.forEach((d) => {
      grouped[d.id].sort((a, b) => String(a.item || "").localeCompare(String(b.item || ""), "ru"));
    });
    return defs.map((d) => ({ ...d, items: grouped[d.id] || [] }));
  }, [filtered, view]);
  const shipmentKpi = useMemo(() => {
    if (view !== "shipment") return { totalOrders: 0, totalQty: 0, readyAssembly: 0, assembled: 0 };
    let totalOrders = 0;
    let totalQty = 0;
    let readyAssembly = 0;
    let assembled = 0;
    (filtered || []).forEach((s) => {
      (s.items || []).forEach((it) => {
        (it.cells || []).forEach((c) => {
          totalOrders += 1;
          totalQty += Number(c.qty) || 0;
          if (c.canSendToWork) readyAssembly += 1;
          if (c.inWork) assembled += 1;
        });
      });
    });
    return { totalOrders, totalQty, readyAssembly, assembled };
  }, [filtered, view]);
  const shipmentTableRows = useMemo(() => {
    if (view !== "shipment") return [];
    const rowsFlat = [];
    shipmentRenderSections.forEach((section) => {
      (section.items || []).forEach((it) => {
        visibleCellsForItem(it).forEach((c) => {
          const sourceRow = it.sourceRowId != null ? String(it.sourceRowId) : String(it.row);
          const sourceCol = c.sourceColId != null ? String(c.sourceColId) : String(c.col);
          const stageKey = getShipmentStageKey(c, sourceRow, shipmentOrderMaps, it.item);
          const displayBg = stageBg(stageKey, c.bg || "#ffffff");
          rowsFlat.push({
            key: `${sourceRow}-${sourceCol}`,
            section: section.name,
            item: it.item,
            strapProduct: String(it.strapProduct || ""),
            material: it.material || "",
            week: c.week || "-",
            qty: Number(c.qty || 0),
            sheets: Number(c.sheetsNeeded || 0),
            outputPerSheet: Number(c.outputPerSheet || 0),
            availableSheets: Number(c.availableSheets || 0),
            bg: displayBg,
            status: stageLabel(stageKey),
            stageKey,
            canSendToWork: !!c.canSendToWork,
            inWork: !!c.inWork,
            sourceRow,
            sourceCol,
          });
        });
      });
    });
    return rowsFlat;
  }, [view, shipmentRenderSections, shipmentOrderMaps, visibleCellsForItem]);
  const shipmentMaterialBalance = useMemo(() => {
    const byMaterial = new Map();
    shipmentTableRows.forEach((row) => {
      const material = String(row.material || "Материал не указан").trim();
      const key = normalizeFurnitureKey(material);
      const needed = Number(row.sheets || 0);
      const available = Number(row.availableSheets || 0);
      if (!byMaterial.has(key)) byMaterial.set(key, { material, needed: 0, available: 0 });
      const bucket = byMaterial.get(key);
      bucket.needed += needed;
      bucket.available = Math.max(bucket.available, available);
    });
    return byMaterial;
  }, [shipmentTableRows]);
  const shipmentTableRowsWithStockStatus = useMemo(() => {
    return shipmentTableRows.map((row) => {
      const key = normalizeFurnitureKey(row.material || "");
      const totals = shipmentMaterialBalance.get(key) || { needed: 0, available: 0 };
      const deficit = Math.max(0, Number(totals.needed || 0) - Number(totals.available || 0));
      return {
        ...row,
        materialNeededTotal: Number(totals.needed || 0),
        materialAvailableTotal: Number(totals.available || 0),
        materialDeficit: deficit,
        materialHasDeficit: deficit > 0,
      };
    });
  }, [shipmentTableRows, shipmentMaterialBalance]);
  const shipmentTableGroupNames = useMemo(() => {
    return [...new Set(shipmentTableRowsWithStockStatus.map((row) => String(row.section || "Прочее")))]
      .sort((a, b) => a.localeCompare(b, "ru"));
  }, [shipmentTableRowsWithStockStatus]);
  const visibleShipmentTableRows = useMemo(() => {
    return shipmentTableRowsWithStockStatus.filter((row) => !hiddenShipmentGroups[String(row.section || "Прочее")]);
  }, [shipmentTableRowsWithStockStatus, hiddenShipmentGroups]);
  const shipmentPlanDeficits = useMemo(() => {
    return [...shipmentMaterialBalance.values()]
      .map((x) => ({
        material: x.material,
        needed: Number(x.needed || 0),
        available: Number(x.available || 0),
        deficit: Math.max(0, Number(x.needed || 0) - Number(x.available || 0)),
      }))
      .filter((x) => x.deficit > 0)
      .sort((a, b) => b.deficit - a.deficit || a.material.localeCompare(b.material, "ru"));
  }, [shipmentMaterialBalance]);
  const laborTableRows = useMemo(() => {
    if (view !== "labor") return [];
    const toNum = (v) => Number(v || 0);
    const list = [...filtered].map((x) => ({
      orderId: String(x.order_id || x.orderId || ""),
      item: String(x.item || ""),
      week: String(x.week || ""),
      qty: toNum(x.qty),
      pilkaMin: toNum(x.pilka_min ?? x.pilkaMin),
      kromkaMin: toNum(x.kromka_min ?? x.kromkaMin),
      prasMin: toNum(x.pras_min ?? x.prasMin),
      assemblyMin: toNum(x.assembly_min ?? x.assemblyMin),
      totalMin: toNum(x.total_min ?? x.totalMin),
      dateFinished: String(x.date_finished || x.dateFinished || ""),
      importedLocal: Boolean(x.imported_local || x.importedLocal),
      importKey: String(x.import_key || x.importKey || ""),
    }));
    list.sort((a, b) => {
      if (laborSort === "total_asc") return a.totalMin - b.totalMin;
      if (laborSort === "week") return Number(a.week || 0) - Number(b.week || 0);
      if (laborSort === "item") return a.item.localeCompare(b.item, "ru");
      return b.totalMin - a.totalMin;
    });
    return list;
  }, [filtered, laborSort, view]);
  const laborOrdersRows = useMemo(() => {
    if (view !== "labor") return [];
    const completed = laborTableRows.filter((x) => x.pilkaMin > 0 && x.kromkaMin > 0 && x.prasMin > 0);
    const norm = (v) =>
      String(v || "")
        .toLowerCase()
        .replace(/[ё]/g, "е")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
    const resolveGroup = (itemRaw) => {
      const n = norm(itemRaw);
      if (n.includes("обвязка") || n.includes("планка")) return "";
      if (n.includes("1153") && n.includes("320")) return "";
      if (n.includes("avella lite") || n.includes("авелла лайт") || n.includes("авела лайт")) return "Avella lite";
      if (n.includes("avella") || n.includes("авелла") || n.includes("авела")) return "Avella";
      if (n.includes("cremona") || n.includes("кремона")) return "Cremona";
      if (n.includes("stabile") || n.includes("стабиле")) return "Stabile";
      if (n.includes("donini grande")) return "Donini Grande";
      if (n.includes("donini r")) return "Donini r";
      if (n.includes("donini")) return "Donini";
      if (n.includes("solito2")) return "Solito2";
      if (n.includes("solito") || n.includes("солито")) return "Solito";
      if (n.includes("премьер") || n.includes("premier")) return "Премьер";
      if (n.includes("тв лофт") || n.includes("tv loft") || n.includes("тумба под тв")) return "ТВ Лофт";
      if (n.includes("классико") || n.includes("classico")) return "Классико";
      if (n.includes("siena")) return "Siena";
      const first = String(itemRaw || "").split(".")[0].trim();
      return first || "Прочее";
    };
    const grouped = new Map();
    completed.forEach((x) => {
      const group = resolveGroup(x.item);
      if (!group) return;
      if (!grouped.has(group)) {
        grouped.set(group, {
          group,
          orders: 0,
          qty: 0,
          pilkaMin: 0,
          kromkaMin: 0,
          prasMin: 0,
          totalMin: 0,
          lastDate: "",
        });
      }
      const g = grouped.get(group);
      g.orders += 1;
      g.qty += Number(x.qty || 0);
      g.pilkaMin += Number(x.pilkaMin || 0);
      g.kromkaMin += Number(x.kromkaMin || 0);
      g.prasMin += Number(x.prasMin || 0);
      g.totalMin += Number(x.totalMin || 0);
      const d = String(x.dateFinished || "");
      if (d && (!g.lastDate || d > g.lastDate)) g.lastDate = d;
    });
    const ORDER = [
      "Avella",
      "Avella lite",
      "Cremona",
      "Donini",
      "Donini Grande",
      "Donini r",
      "Solito",
      "Solito2",
      "Stabile",
      "Премьер",
      "ТВ Лофт",
    ];
    const rank = new Map(ORDER.map((x, i) => [x, i]));
    return [...grouped.values()]
      .map((g) => {
        const total = Number(g.totalMin || 0);
        const pilkaShare = total > 0 ? (g.pilkaMin * 100) / total : 0;
        const kromkaShare = total > 0 ? (g.kromkaMin * 100) / total : 0;
        const prasShare = total > 0 ? (g.prasMin * 100) / total : 0;
        return {
          ...g,
          laborPerOrderHour: g.orders > 0 ? total / g.orders / 60 : 0,
          laborPerQtyMin: g.qty > 0 ? total / g.qty : 0,
          laborPerQtyHour: g.qty > 0 ? total / g.qty / 60 : 0,
          pilkaShare,
          kromkaShare,
          prasShare,
        };
      })
      .sort((a, b) => {
        const ra = rank.has(a.group) ? rank.get(a.group) : 9999;
        const rb = rank.has(b.group) ? rank.get(b.group) : 9999;
        if (ra !== rb) return ra - rb;
        return a.group.localeCompare(b.group, "ru");
      });
  }, [laborTableRows, view]);
  const laborStageTimelineRows = useMemo(() => {
    if (view !== "labor" || laborSubView !== "stages") return [];
    const q = query.trim().toLowerCase();
    const activeSet = new Set((activeOrderIds || []).map((x) => String(x || "").trim()).filter(Boolean));
    const events = parseStageAuditRows(stageAuditRows).sort(
      (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
    );
    const byOrder = new Map();
    const ensureOrder = (orderId) => {
      if (!byOrder.has(orderId)) {
        byOrder.set(orderId, {
          orderId,
          pilkaStatus: "-",
          pilkaStart: "",
          pilkaEnd: "",
          kromkaStatus: "-",
          kromkaStart: "",
          kromkaEnd: "",
          prasStatus: "-",
          prasStart: "",
          prasEnd: "",
          lastEventAt: "",
        });
      }
      return byOrder.get(orderId);
    };
    events.forEach((event) => {
      const orderId = String(event.orderId || "").trim();
      if (!orderId || orderId === "-") return;
      const row = ensureOrder(orderId);
      row.lastEventAt = event.createdAt || row.lastEventAt;
      (event.changed || []).forEach((c) => {
        const stage = mapStageFieldToKey(c.key);
        if (!stage) return;
        const nextStatus = normalizeStageStatus(c.after);
        const prevStatus = normalizeStageStatus(c.before);
        const ts = String(event.createdAt || "").trim();
        row[`${stage}Status`] = nextStatus;
        if (nextStatus === "В работе" && ts) row[`${stage}Start`] = ts;
        if (nextStatus === "Готово" && ts) {
          row[`${stage}End`] = ts;
          if (!row[`${stage}Start`] && prevStatus === "В работе") row[`${stage}Start`] = ts;
        }
      });
    });
    const allRows = [...byOrder.values()]
      .filter((r) => !q || String(r.orderId || "").toLowerCase().includes(q))
      .sort((a, b) => new Date(b.lastEventAt || 0).getTime() - new Date(a.lastEventAt || 0).getTime());
    if (activeSet.size === 0) return allRows;
    const scopedRows = allRows.filter((r) => activeSet.has(String(r.orderId || "").trim()));
    // If labor table ids don't intersect with audit ids, still show stage timeline instead of empty state.
    return scopedRows.length > 0 ? scopedRows : allRows;
  }, [view, laborSubView, stageAuditRows, query, activeOrderIds]);
  const laborPlannerRows = useMemo(() => {
    if (view !== "labor") return [];
    return laborOrdersRows
      .filter((r) => Number(r.laborPerQtyMin || 0) > 0)
      .map((r) => {
        const plannedQtyRaw = laborPlannerQtyByGroup[r.group];
        const plannedQty = Number(String(plannedQtyRaw ?? "").replace(",", "."));
        const kits = Number.isFinite(plannedQty) && plannedQty > 0 ? plannedQty : 0;
        const totalMin = kits * Number(r.laborPerQtyMin || 0);
        const hours = Math.floor(totalMin / 60);
        const minutes = Math.round(totalMin % 60);
        const hhmm = `${hours}:${String(minutes).padStart(2, "0")}`;
        return {
          group: r.group,
          laborPerQtyMin: Number(r.laborPerQtyMin || 0),
          kits,
          totalMin,
          hhmm,
        };
      });
  }, [laborOrdersRows, laborPlannerQtyByGroup, view]);
  const laborKpi = useMemo(() => {
    const totalOrders = laborTableRows.length;
    const totalMinutes = laborTableRows.reduce((sum, x) => sum + x.totalMin, 0);
    const totalQty = laborTableRows.reduce((sum, x) => sum + x.qty, 0);
    const avgPerOrder = totalOrders > 0 ? totalMinutes / totalOrders : 0;
    return { totalOrders, totalMinutes, totalQty, avgPerOrder };
  }, [laborTableRows]);
  const furnitureSheetNames = useMemo(() => {
    return Array.isArray(furnitureWorkbook?.SheetNames) ? furnitureWorkbook.SheetNames : [];
  }, [furnitureWorkbook]);
  const furnitureSheetData = useMemo(() => {
    if (!furnitureWorkbook || !furnitureActiveSheet) return { headers: [], rows: [] };
    const parsed = parseFurnitureSheet(furnitureWorkbook, furnitureActiveSheet);
    const q = String(query || "").trim().toLowerCase();
    if (!q) return parsed;
    const rows = parsed.rows.filter((row) =>
      row.some((cell) =>
        String(cell?.value || "").toLowerCase().includes(q) ||
        String(cell?.formula || "").toLowerCase().includes(q)
      )
    );
    return { headers: parsed.headers, rows };
  }, [furnitureWorkbook, furnitureActiveSheet, query]);
  const furnitureTemplates = useMemo(() => {
    if (!furnitureWorkbook || !furnitureActiveSheet) return [];
    return buildFurnitureTemplates(furnitureWorkbook, furnitureActiveSheet);
  }, [furnitureWorkbook, furnitureActiveSheet]);
  const furnitureSelectedTemplate = useMemo(() => {
    return furnitureTemplates.find((x) => x.productName === furnitureSelectedProduct) || null;
  }, [furnitureTemplates, furnitureSelectedProduct]);
  const furnitureQtyNumber = useMemo(() => {
    const n = toNum(furnitureSelectedQty);
    return n > 0 ? n : 0;
  }, [furnitureSelectedQty]);
  const furnitureGeneratedDetails = useMemo(() => {
    if (!furnitureSelectedTemplate || furnitureQtyNumber <= 0) return [];
    const productKey = normalizeStrapProductKey(furnitureSelectedTemplate.productName || "");
    const detailMapBySize = new Map();
    const detailMapByPattern = new Map();
    (furnitureDetailArticleRows || []).forEach((r) => {
      const isActive = r?.is_active ?? r?.isActive;
      if (isActive === false) return;
      const pKey = normalizeStrapProductKey(r.product_name || r.productName || "");
      if (pKey !== productKey) return;
      const pattern = normalizeDetailPatternKey(r.detail_name_pattern || r.detailNamePattern || "");
      const sizeToken = extractDetailSizeToken(r.detail_name_pattern || r.detailNamePattern || "");
      const article = String(r.article || "").trim();
      if (!pattern || !article) return;
      if (sizeToken) {
        if (!detailMapBySize.has(sizeToken)) detailMapBySize.set(sizeToken, new Set());
        detailMapBySize.get(sizeToken).add(article);
      }
      if (!detailMapByPattern.has(pattern)) detailMapByPattern.set(pattern, new Set());
      detailMapByPattern.get(pattern).add(article);
    });
    return (furnitureSelectedTemplate.details || []).map((d) => {
      const raw = d.perUnit * furnitureQtyNumber;
      const qty = Math.round(raw * 1000) / 1000;
      const detailKey = normalizeDetailPatternKey(d.detailName || "");
      const detailSizeToken = extractDetailSizeToken(d.detailName || "");
      const matchedArticles = [];
      if (detailSizeToken && detailMapBySize.has(detailSizeToken)) {
        matchedArticles.push(...Array.from(detailMapBySize.get(detailSizeToken)));
      } else {
        detailMapByPattern.forEach((articles, pattern) => {
          if (detailKey.includes(pattern) || pattern.includes(detailKey)) {
            matchedArticles.push(...Array.from(articles));
          }
        });
      }
      if (matchedArticles.length === 0) {
        detailMapByPattern.forEach((articles, pattern) => {
          if (detailKey.includes(pattern) || pattern.includes(detailKey)) {
          matchedArticles.push(...Array.from(articles));
          }
        });
      }
      return {
        ...d,
        qty,
        linkedArticles: [...new Set(matchedArticles)].sort((a, b) => a.localeCompare(b, "ru")),
      };
    });
  }, [furnitureDetailArticleRows, furnitureSelectedTemplate, furnitureQtyNumber]);
  const furnitureArticleGroups = useMemo(() => {
    if (view !== "furniture") return [];
    const q = String(query || "").trim().toLowerCase();
    const grouped = new Map();
    (furnitureArticleRows || []).forEach((r) => {
      const productName = String(r.product_name || r.productName || "").trim();
      const sectionName = String(r.section_name || r.sectionName || "").trim();
      const article = String(r.article || "").trim();
      const itemName = String(r.item_name || r.itemName || "").trim();
      const color = String(r.table_color || r.tableColor || "").trim();
      if (!productName || !article) return;
      const text = `${productName} ${sectionName} ${article} ${itemName} ${color}`.toLowerCase();
      if (q && !text.includes(q)) return;
      if (!grouped.has(productName)) grouped.set(productName, []);
      grouped.get(productName).push({ productName, sectionName, article, itemName, color });
    });
    return [...grouped.entries()]
      .map(([productName, rows]) => ({
        productName,
        rows: rows.sort((a, b) => a.itemName.localeCompare(b.itemName, "ru")),
      }))
      .sort((a, b) => a.productName.localeCompare(b.productName, "ru"));
  }, [furnitureArticleRows, query, view]);
  useEffect(() => {
    if (view !== "furniture") return;
    if (!furnitureTemplates.length) return;
    if (furnitureTemplates.some((x) => x.productName === furnitureSelectedProduct)) return;
    setFurnitureSelectedProduct(String(furnitureTemplates[0].productName || ""));
  }, [view, furnitureTemplates, furnitureSelectedProduct]);
  const warehouseTableRows = useMemo(() => {
    if (view !== "warehouse") return [];
    const q = String(query || "").trim().toLowerCase();
    return [...warehouseRows]
      .map((x) => ({
        material: String(x.material || ""),
        qtySheets: Number(x.qty_sheets ?? x.qtySheets ?? 0),
        sizeLabel: String(x.size_label || x.sizeLabel || ""),
        widthMm: Number(x.sheet_width_mm ?? x.sheetWidthMm ?? 0),
        heightMm: Number(x.sheet_height_mm ?? x.sheetHeightMm ?? 0),
        updatedAt: String(x.updated_at || x.updatedAt || ""),
      }))
      .filter((x) => !q || x.material.toLowerCase().includes(q))
      .sort((a, b) => a.material.localeCompare(b.material, "ru"));
  }, [query, view, warehouseRows]);
  const leftoversTableRows = useMemo(() => {
    if (view !== "warehouse") return [];
    return [...leftoversRows]
      .map((x) => ({
        orderId: String(x.orderId || x.order_id || ""),
        item: String(x.item || ""),
        material: String(x.material || ""),
        sheetsNeeded: Number(x.sheetsNeeded || x.sheets_needed || 0),
        leftoverFormat: String(x.leftoverFormat || x.leftover_format || ""),
        leftoversQty: Number(x.leftoversQty || x.leftovers_qty || 0),
        createdAt: String(x.createdAt || x.created_at || ""),
      }))
      .filter((x) => {
        const q = String(query || "").trim().toLowerCase();
        return !q || x.material.toLowerCase().includes(q) || x.leftoverFormat.toLowerCase().includes(q);
      })
      .sort((a, b) => a.item.localeCompare(b.item, "ru"));
  }, [leftoversRows, query, view]);
  const consumeHistoryTableRows = useMemo(() => {
    if (view !== "warehouse") return [];
    const q = String(query || "").trim().toLowerCase();
    return [...consumeHistoryRows]
      .map((x) => ({
        moveId: String(x.move_id || x.moveId || ""),
        createdAt: String(x.created_at || x.createdAt || ""),
        orderId: String(x.order_id || x.orderId || ""),
        material: String(x.material || ""),
        qtySheets: Number(x.qty_sheets ?? x.qtySheets ?? 0),
        comment: String(x.comment || ""),
      }))
      .filter((x) => {
        if (!q) return true;
        return (
          x.orderId.toLowerCase().includes(q) ||
          x.material.toLowerCase().includes(q) ||
          x.comment.toLowerCase().includes(q)
        );
      });
  }, [consumeHistoryRows, query, view]);

  const selectedShipmentSummary = useMemo(() => {
    const items = selectedShipments.map((s) => {
      const qty = Number(s.qty || 0);
      const sheetsRaw = Number(s.sheetsNeeded || 0);
      const outputPerSheet = Number(s.outputPerSheet || 0);
      const sheetsNeeded =
        sheetsRaw > 0
          ? sheetsRaw
          : (outputPerSheet > 0 && qty > 0 ? Math.ceil(qty / outputPerSheet) : 0);
      const material = String(s.material || "Материал не указан");
      return { ...s, qty, sheetsNeeded, material, outputPerSheet, sheetsExact: sheetsRaw > 0 };
    });
    const byMaterial = {};
    let totalSheets = 0;
    items.forEach((x) => {
      totalSheets += x.sheetsNeeded;
      byMaterial[x.material] = (byMaterial[x.material] || 0) + x.sheetsNeeded;
    });
    const materials = Object.keys(byMaterial)
      .sort((a, b) => a.localeCompare(b, "ru"))
      .map((m) => ({ material: m, sheets: byMaterial[m] }));
    return {
      items,
      materials,
      selectedCount: items.length,
      totalSheets,
    };
  }, [selectedShipments]);
  const sendableSelectedCount = useMemo(
    () => selectedShipments.filter((x) => !!x.canSendToWork).length,
    [selectedShipments]
  );
  const selectedShipmentStockCheck = useMemo(() => {
    const byMaterial = new Map();
    selectedShipments.forEach((s) => {
      const material = String(s.material || "Материал не указан").trim();
      const key = normalizeFurnitureKey(material);
      const qty = Number(s.qty || 0);
      const sheetsRaw = Number(s.sheetsNeeded || 0);
      const outputPerSheet = Number(s.outputPerSheet || 0);
      const sheetsNeeded =
        sheetsRaw > 0
          ? sheetsRaw
          : (outputPerSheet > 0 && qty > 0 ? Math.ceil(qty / outputPerSheet) : 0);
      const availableSheets = Number(s.availableSheets || 0);
      if (!byMaterial.has(key)) {
        byMaterial.set(key, { material, needed: 0, available: 0, sourceKeys: new Set() });
      }
      const bucket = byMaterial.get(key);
      bucket.needed += sheetsNeeded;
      bucket.available = Math.max(bucket.available, availableSheets);
      bucket.sourceKeys.add(`${String(s.row || "").trim()}|${String(s.col || "").trim()}`);
    });
    const deficits = [...byMaterial.values()]
      .map((x) => ({ ...x, deficit: x.needed - x.available }))
      .filter((x) => x.deficit > 0);
    const deficitSourceKeys = new Set();
    deficits.forEach((x) => x.sourceKeys.forEach((k) => deficitSourceKeys.add(k)));
    return { deficits, deficitSourceKeys };
  }, [selectedShipments]);

  const strapCalculation = useMemo(() => {
    const lines = [];
    let totalSheets = 0;
    for (const x of strapItems) {
      const size = parseStrapSize(x.name);
      const qty = Number(x.qty || 0);
      if (!size || !(qty > 0)) continue;
      const stripsPerSheet = Math.floor(STRAP_SHEET_HEIGHT / size.width);
      const perStrip = Math.floor(STRAP_SHEET_WIDTH / size.length);
      const perSheet = stripsPerSheet * perStrip;
      if (perSheet <= 0) {
        lines.push({ name: x.name, qty, perSheet: 0, sheets: 0, invalid: true });
        continue;
      }
      const sheets = Math.ceil(qty / perSheet);
      totalSheets += sheets;
      lines.push({ name: x.name, qty, perSheet, sheets, invalid: false });
    }
    return { lines, totalSheets };
  }, [strapItems]);

  const strapOptionsByProduct = useMemo(() => {
    const grouped = new Map();
    (furnitureDetailArticleRows || []).forEach((r) => {
      const isActive = r?.is_active ?? r?.isActive;
      if (isActive === false) return;
      const productRaw = String(r.product_name || r.productName || "").trim();
      const productName = canonicalStrapProductName(productRaw);
      const pattern = String(r.detail_name_pattern || r.detailNamePattern || "").trim();
      if (!productName) return;
      const optionName = detailPatternToStrapName(pattern);
      if (!optionName) return;
      const key = normalizeStrapProductKey(productName);
      if (!grouped.has(key)) grouped.set(key, { productName, options: new Set() });
      const bucket = grouped.get(key).options;
      if (optionName === "Обвязка") {
        const pKey = normalizeStrapProductKey(productName);
        if (pKey === "донини" || pKey === "донини белый") {
          bucket.add("Обвязка (1000_80)");
          bucket.add("Обвязка (558_80)");
          return;
        }
      }
      bucket.add(optionName);
    });
    const rows = [...grouped.values()].map((x) => ({
      productName: x.productName,
      options: [...x.options].sort((a, b) => a.localeCompare(b, "ru")),
    }));
    rows.sort((a, b) => a.productName.localeCompare(b.productName, "ru"));
    return rows;
  }, [furnitureDetailArticleRows]);

  const strapProductBySizeToken = useMemo(() => {
    const map = new Map();
    (furnitureDetailArticleRows || []).forEach((r) => {
      const isActive = r?.is_active ?? r?.isActive;
      if (isActive === false) return;
      const productRaw = String(r.product_name || r.productName || "").trim();
      const productName = canonicalStrapProductName(productRaw);
      const pattern = String(r.detail_name_pattern || r.detailNamePattern || "").trim();
      if (!productName) return;
      const token = extractDetailSizeToken(pattern);
      if (!token) return;
      const key = normalizeStrapProductKey(token);
      if (!map.has(key)) {
        map.set(key, productName);
        return;
      }
      const existing = String(map.get(key) || "");
      if (normalizeStrapProductKey(existing) !== normalizeStrapProductKey(productName)) {
        // Ambiguous mapping for same size token, skip wrong auto-substitution.
        map.set(key, "");
      }
    });
    return map;
  }, [furnitureDetailArticleRows]);

  const strapProductsByArticleCode = useMemo(() => {
    const buckets = new Map();
    const splitArticleCodes = (raw) =>
      String(raw || "")
        .split(/[,\n;]+/g)
        .map((x) => String(x || "").trim().toUpperCase())
        .filter(Boolean);
    (furnitureDetailArticleRows || []).forEach((r) => {
      const isActive = r?.is_active ?? r?.isActive;
      if (isActive === false) return;
      const productRaw = String(r.product_name || r.productName || "").trim();
      const productName = canonicalStrapProductName(productRaw);
      const articles = splitArticleCodes(r.article);
      if (!productName || articles.length === 0) return;
      articles.forEach((article) => {
        if (!buckets.has(article)) buckets.set(article, new Set());
        buckets.get(article).add(productName);
      });
    });
    return new Map(
      [...buckets.entries()].map(([article, set]) => [article, [...set.values()]])
    );
  }, [furnitureDetailArticleRows]);

  const strapProductNames = useMemo(() => {
    if (strapOptionsByProduct.length > 0) return strapOptionsByProduct.map((x) => x.productName);
    return ["Обвязка"];
  }, [strapOptionsByProduct]);

  const strapOptionsForSelectedProduct = useMemo(() => {
    if (strapOptionsByProduct.length === 0) return STRAP_OPTIONS;
    const key = normalizeStrapProductKey(strapTargetProduct || strapProductNames[0] || "");
    const hit = strapOptionsByProduct.find((x) => normalizeStrapProductKey(x.productName) === key);
    return hit?.options?.length ? hit.options : [];
  }, [strapOptionsByProduct, strapTargetProduct, strapProductNames]);

  useEffect(() => {
    if (!strapProductNames.length) return;
    if (strapProductNames.some((name) => normalizeStrapProductKey(name) === normalizeStrapProductKey(strapTargetProduct))) return;
    setStrapTargetProduct(strapProductNames[0]);
  }, [strapProductNames, strapTargetProduct]);

  async function sendSelectedShipmentToWork() {
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для отправки заказов в работу.");
      return;
    }
    if (!selectedShipments.length) return;
    const sendable = selectedShipments.filter((s) => !!s.canSendToWork);
    if (!sendable.length) {
      setError("Среди выбранных ячеек нет доступных для отправки в работу.");
      return;
    }
    setActionLoading("shipment:bulk");
    setError("");
    try {
      for (const s of sendable) {
        const attempts = buildShipmentCellAttempts(s);
        await runShipmentCellActionWithFallback({
          callBackend,
          backendAction: "webSendShipmentToWork",
          attempts,
          isMissingError: isShipmentCellMissingError,
          requestBuilder: (p) => ({ row: p.row, col: p.col }),
        });
      }
      setPlanPreviews([]);
      setSelectedShipments([]);
      await load();
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setActionLoading("");
    }
  }

  async function deleteSelectedShipmentPlan() {
    if (!canManageOrders) {
      denyActionByRole("Недостаточно прав для удаления позиций из плана.");
      return;
    }
    if (!selectedShipments.length) return;
    const deletable = selectedShipments.filter((s) => !!s.canSendToWork);
    if (!deletable.length) {
      setError("Среди выбранных ячеек нет доступных для удаления из плана.");
      return;
    }
    const ok = window.confirm(`Удалить ${deletable.length} поз. из плана? Это действие необратимо.`);
    if (!ok) return;
    setActionLoading("shipment:delete");
    setError("");
    try {
      for (const s of deletable) {
        const attempts = buildShipmentCellAttempts(s);
        await runShipmentCellActionWithFallback({
          callBackend,
          backendAction: "webDeleteShipmentPlanCell",
          attempts,
          isMissingError: isShipmentCellMissingError,
          requestBuilder: (p) => ({ p_row: p.row, p_col: p.col }),
        });
      }
      setPlanPreviews([]);
      setSelectedShipments([]);
      await load();
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setActionLoading("");
    }
  }

  async function deleteStatsOrder(order) {
    if (!canManageOrders) {
      denyActionByRole("Недостаточно прав для удаления заказов.");
      return;
    }
    const orderId = String(order?.orderId || order?.order_id || "").trim();
    if (!orderId) {
      setError("Для этого заказа не найден orderId.");
      return;
    }
    const ok = window.confirm(
      `Удалить заказ ${orderId || ""} из плана? Действие необратимо.`
    );
    if (!ok) return;
    const actionKey = getStatsDeleteActionKey(order, rows);
    setActionLoading(actionKey);
    setError("");
    try {
      try {
        await callBackend("webDeleteOrderById", {
          orderId,
          p_order_id: orderId,
        });
      } catch (deleteByOrderErr) {
        const msg = String(deleteByOrderErr?.message || deleteByOrderErr || "");
        const missingAction =
          msg.includes("не настроен для action") ||
          msg.includes("Unknown action") ||
          msg.includes("not configured");
        if (!missingAction) throw deleteByOrderErr;
        // Fallback for legacy backends without delete-by-order endpoint.
        const source = await resolveStatsOrderSourceCell(order, rows, callBackend);
        const sourceRow = source.row;
        const sourceCol = source.col;
        if (!sourceRow || !sourceCol) {
          setError("Для этого заказа не найдена привязка к ячейке плана (row/col).");
          return;
        }
        await callBackend("webDeleteShipmentPlanCell", {
          p_row: sourceRow,
          p_col: sourceCol,
          row: sourceRow,
          col: sourceCol,
        });
      }
      await load();
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setActionLoading("");
    }
  }

  function toggleShipmentSelection(payload) {
    setSelectedShipments((prev) => {
      const exists = prev.some((s) => s.row === payload.row && s.col === payload.col);
      if (exists) return prev.filter((s) => !(s.row === payload.row && s.col === payload.col));
      return [...prev, payload];
    });
  }

  function openStrapDialog() {
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для добавления обвязки.");
      return;
    }
    const init = buildStrapDialogInit({
      strapItems,
      strapProductNames,
      weekFilter,
      weeks,
      strapOptionsByProduct,
      defaultOptions: STRAP_OPTIONS,
      normalizeProductKey: normalizeStrapProductKey,
    });
    setStrapTargetProduct(init.defaultProduct);
    setStrapPlanWeek(init.defaultWeek);
    setStrapDraft(init.draft);
    setStrapDialogOpen(true);
  }

  useEffect(() => {
    if (!strapDialogOpen) return;
    const options = strapOptionsForSelectedProduct;
    const nextDraft = remapStrapDraftByOptions(options, strapDraft);
    setStrapDraft(nextDraft);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strapDialogOpen, strapTargetProduct, strapOptionsForSelectedProduct.join("|")]);

  function openCreatePlanDialog() {
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для добавления плана.");
      return;
    }
    const init = buildCreatePlanDialogInit({
      sectionOptions,
      weeks,
      sectionArticleRows,
      resolvePlanMaterial,
    });
    setPlanSection(init.section);
    setPlanArticle(init.article);
    setPlanMaterial(init.material);
    setPlanWeek(init.week);
    setPlanQty(init.qty);
    setPlanDialogOpen(true);
  }

  function closeCreatePlanDialog() {
    if (planSaving) return;
    setPlanDialogOpen(false);
  }

  async function saveCreatePlanDialog() {
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для изменения плана.");
      return;
    }
    const item = String(resolvedPlanItem || "").trim();
    const material = String(planMaterial || "").trim();
    const week = String(planWeek || "").trim();
    const qty = Number(String(planQty || "").replace(",", "."));
    if (!item) {
      setError("Выберите материал для изделия.");
      return;
    }
    if (!material) {
      setError("Выберите материал.");
      return;
    }
    if (!week) {
      setError("Укажите неделю плана.");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Количество должно быть больше 0.");
      return;
    }
    setPlanSaving(true);
    setError("");
    try {
      await callBackend("webCreateShipmentPlanCell", {
        sectionName: planSection,
        item,
        material,
        week,
        qty,
      });
      void syncPlanCellToGoogleSheet({ sectionName: planSection, item, material, week, qty });
      setPlanDialogOpen(false);
      await load();
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setPlanSaving(false);
    }
  }

  async function saveStrapDialog() {
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для изменения плана.");
      return;
    }
    const next = buildStrapPlanRows({
      options: strapOptionsForSelectedProduct,
      draft: strapDraft,
      productName: strapTargetProduct || "",
    });
    if (!next.length) {
      setStrapItems([]);
      setStrapDialogOpen(false);
      return;
    }
    const week = String(strapPlanWeek || "").trim();
    if (!week) {
      setError("Укажите неделю плана для обвязки.");
      return;
    }
    setActionLoading("shipment:strapsave");
    setError("");
    try {
      for (const row of next) {
        const payload = buildStrapPlanCellPayload(row, week, {
          resolveStrapMaterialByProduct,
          strapNameToOrderItem,
        });
        await callBackend("webCreateShipmentPlanCell", payload);
        void syncPlanCellToGoogleSheet(payload);
      }
      setStrapItems([]);
      setStrapDialogOpen(false);
      await load();
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setActionLoading("");
    }
  }

  async function previewSelectedShipmentPlan() {
    if (!selectedShipments.length) return;
    const strapSelections = selectedShipments.filter((s) => isStrapVirtualRowId(s.row));
    const shipmentSelections = selectedShipments.filter((s) => !isStrapVirtualRowId(s.row));
    setActionLoading("preview:batch");
    setError("");
    try {
      const generatedAt = formatDateTimeForPrint(new Date());
      const strapPreviews = buildStrapPreviewPlans(strapSelections, generatedAt);
      const enrichPreview = (preview, shipmentRow) => {
        const withFurniture = enrichPreviewFromFurniture(preview, {
          furnitureTemplates,
          resolveFurnitureTemplateForPreview,
          buildPreviewRowsFromFurnitureTemplate,
        });
        return enrichPreviewWithStrapProduct(withFurniture, shipmentRow, {
          canonicalStrapProductName,
          normalizeFurnitureKey,
          getPlanPreviewArticleCode,
          resolvePlanPreviewArticleByName,
          articleLookupByItemKey,
          strapProductsByArticleCode,
          normalizeStrapProductKey,
          extractDetailSizeToken,
          strapProductBySizeToken,
          strapTargetProduct,
        });
      };
      if (shipmentSelections.length === 0) {
        setPlanPreviews(strapPreviews);
        return;
      }
      if (shipmentSelections.length === 1) {
        const s = shipmentSelections[0];
        const preview = await callBackend("webPreviewPlanFromShipment", {
          row: s.row,
          col: s.col,
        });
        const enriched = preview ? enrichPreview({ ...preview, _key: `${s.row}-${s.col}` }, s) : null;
        const plans = enriched ? [enriched] : [];
        plans.push(...strapPreviews);
        setPlanPreviews(plans);
      } else {
        const { plans = [], failedCount = 0, batchError } = await buildShipmentPreviewPlans(shipmentSelections, {
          callBackend,
          enrichPreview,
        });
        if (failedCount > 0) {
          setError(
            `Часть предпросмотров не построена (${failedCount} шт). ` +
            `Причина: ${extractErrorMessage(batchError)}`
          );
        }
        if (!plans.length && strapPreviews.length === 0) {
          throw new Error("Не удалось построить предпросмотр ни для одной выбранной позиции.");
        }
        plans.push(...strapPreviews);
        setPlanPreviews(plans);
      }
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setActionLoading("");
    }
  }

  function exportSelectedShipmentToExcel() {
    if (!selectedShipments.length) return;
    const planNumberRaw = window.prompt("Введите номер плана для экспорта:", String(selectedShipments[0]?.week || ""));
    if (planNumberRaw == null) return;
    const planNumber = String(planNumberRaw || "").trim();
    if (!planNumber) {
      setError("Укажите номер плана.");
      return;
    }

    const { rows, missingItems } = buildShipmentExportRows(selectedShipments, {
      articleLookupByItemKey,
      normalizeItemKey: normalizeFurnitureKey,
    });
    if (!rows.length) {
      setError(getShipmentExportNoArticlesError());
      return;
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "План");
    XLSX.writeFile(wb, `План_${planNumber}.xlsx`);

    if (missingItems.length > 0) {
      setError(formatShipmentExportPartialError(missingItems.length));
    } else {
      setError("");
    }
  }

  async function importShipmentPlanFromExcelFile(file) {
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для импорта плана.");
      return;
    }
    if (!file) return;
    const planNumberRaw = window.prompt("Введите номер плана для импорта:", "");
    if (planNumberRaw == null) return;
    const planNumber = String(planNumberRaw || "").trim();
    if (!planNumber) {
      setError("Укажите номер плана.");
      return;
    }

    setActionLoading("shipment:import");
    setError("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const firstSheet = String(wb?.SheetNames?.[0] || "");
      if (!firstSheet) throw new Error("В файле не найден лист.");
      const ws = wb.Sheets[firstSheet];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
      const importRows = parseImportPlanRows(rows);
      if (!importRows.length) {
        throw new Error(getImportPlanNoValidRowsError());
      }

      const importCatalogRows = await loadImportCatalogRows({
        supabaseCall,
        callBackend,
        sectionArticleRows,
      });

      const articleMap = buildImportArticleMap(importCatalogRows);

      const { imported, missing } = await applyImportPlanRows(importRows, articleMap, {
        callBackend,
        planNumber,
      });

      await load();
      if (missing.length > 0) {
        setError(formatImportShipmentPartialError(imported, missing));
      }
    } catch (e) {
      setError(formatShipmentImportError(extractErrorMessage(e)));
    } finally {
      setActionLoading("");
      if (importPlanFileRef.current) importPlanFileRef.current.value = "";
    }
  }

  function exportLaborTotalToExcel() {
    if (view !== "labor" || laborSubView !== "total") return;
    if (!laborTableRows.length) {
      setError("Нет данных для экспорта общей трудоемкости.");
      return;
    }

    const header = [
      "ID заказа",
      "Изделие",
      "План",
      "Кол-во",
      "Пилка (мин)",
      "Кромка (мин)",
      "Присадка (мин)",
      "Итого (мин)",
      "Дата завершения",
    ];
    const body = laborTableRows.map((r) => [
      String(r.orderId || ""),
      String(r.item || ""),
      String(r.week || ""),
      Number(r.qty || 0),
      Number(r.pilkaMin || 0),
      Number(r.kromkaMin || 0),
      Number(r.prasMin || 0),
      Number(r.totalMin || 0),
      String(r.dateFinished || ""),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Общая трудоемкость");
    XLSX.writeFile(wb, `Трудоемкость_общая_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setError("");
  }

  async function importLaborTotalFromExcelFile(file) {
    if (!file) return;
    setActionLoading("labor:import");
    setError("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const firstSheet = String(wb?.SheetNames?.[0] || "");
      if (!firstSheet) throw new Error("В файле не найден лист.");
      const ws = wb.Sheets[firstSheet];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
      if (!rows.length) throw new Error("Файл пустой.");
      const nowKey = Date.now();
      const imported = parseLaborImportRows(rows, nowKey);

      if (!imported.length) {
        throw new Error(getLaborImportNoValidRowsError());
      }

      setLaborImportedRows((prev) => [...prev, ...imported]);
    } catch (e) {
      setError(formatLaborImportError(extractErrorMessage(e)));
    } finally {
      setActionLoading("");
      if (importLaborFileRef.current) importLaborFileRef.current.value = "";
    }
  }

  async function saveImportedLaborRowToDb(row) {
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для сохранения трудоемкости в БД.");
      return;
    }
    const key = String(row?.importKey || "");
    if (!key) return;
    setLaborSavingByKey((prev) => ({ ...prev, [key]: true }));
    setError("");
    try {
      await callBackend("webUpsertLaborFact", buildLaborFactPayload(row));
      setLaborSavedByKey((prev) => ({ ...prev, [key]: true }));
      setLaborSaveSelected((prev) => ({ ...prev, [key]: false }));
      setLaborImportedRows((prev) => markLaborImportRowSaved(prev, key));
      await load();
    } catch (e) {
      setError(formatLaborSaveRowError(extractErrorMessage(e)));
    } finally {
      setLaborSavingByKey((prev) => ({ ...prev, [key]: false }));
    }
  }

  return (
    <div className="page">
      <header className="top">
        <h1>Управление производственными заказами</h1>
        <div className="top-actions">
          {authEnabled && (
            <div className="auth-controls">
              {authUserLabel ? (
                <>
                  <span className="role-badge role-viewer" title="Текущий авторизованный пользователь Supabase">
                    Вход: {authUserLabel}
                  </span>
                  <button
                    type="button"
                    className="mini"
                    disabled={authSaving}
                    onClick={signOutSupabaseUser}
                    title="Выйти из текущей Supabase-сессии"
                  >
                    {authSaving ? "Выход..." : "Выйти"}
                  </button>
                </>
              ) : (
                <>
                  <input
                    className="auth-input"
                    type="email"
                    placeholder="Email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    autoComplete="username"
                  />
                  <input
                    className="auth-input"
                    type="password"
                    placeholder="Пароль"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") signInWithSupabase();
                    }}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="mini ok"
                    disabled={authSaving}
                    onClick={signInWithSupabase}
                    title="Войти через Supabase Auth"
                  >
                    {authSaving ? "Вход..." : "Войти"}
                  </button>
                </>
              )}
            </div>
          )}
          <span className={`role-badge role-${crmRole}`} title="Текущая роль CRM">
            Роль: {crmRoleLabel}
          </span>
          {canAdminSettings && (
            <button
              type="button"
              className={`strict-mode-toggle ${crmAuthStrict ? "enabled" : ""}`}
              onClick={toggleCrmAuthStrict}
              disabled={crmAuthStrictSaving}
              title="Управление строгим режимом авторизации CRM"
            >
              {crmAuthStrictSaving
                ? "Сохраняю..."
                : `Strict mode: ${crmAuthStrict ? "ON" : "OFF"}`}
            </button>
          )}
        </div>
      </header>

      <section className="view-switch">
        {VIEWS.map((v) => (
          (v.id !== "admin" || canAdminSettings) && (
          <button
            key={v.id}
            className={view === v.id ? "tab active" : "tab"}
            onClick={() => {
              setView(v.id);
              if (v.id === "workshop") setTab("pilka");
            }}
          >
            {v.label}
          </button>
          )
        ))}
      </section>

      <section className="kpi-grid">
        {view === "shipment" ? (
          <>
            <div className="kpi"><span>Заказов</span><b>{shipmentKpi.totalOrders}</b></div>
            <div className="kpi"><span>Кол-во (шт)</span><b>{shipmentKpi.totalQty}</b></div>
            <div className="kpi"><span>К отправке в работу</span><b>{shipmentKpi.readyAssembly}</b></div>
            <div className="kpi"><span>Отправлено в цех</span><b>{shipmentKpi.assembled}</b></div>
          </>
        ) : view === "overview" && overviewSubView === "shipped" ? (
          <>
            <div className="kpi">
              <span>Отгружено заказов</span>
              <b>{overviewShippedOnly.length}</b>
            </div>
            <div className="kpi">
              <span>Суммарно шт</span>
              <b>{overviewShippedOnly.reduce((s, x) => s + (Number(x.qty) || 0), 0)}</b>
            </div>
          </>
        ) : view === "overview" ? (
          <>
            <div className="kpi"><span>Всего заказов</span><b>{filtered.length}</b></div>
            <div className="kpi">
              <span>В производстве</span>
              <b>
                {
                  filtered.filter(
                    (x) => !OVERVIEW_POST_PRODUCTION_LANE_IDS.includes(getOverviewLaneId(x))
                  ).length
                }
              </b>
            </div>
            <div className="kpi"><span>На паузе</span><b>{filtered.filter((x) => statusClass(x) === "pause").length}</b></div>
            <div className="kpi">
              <span>Готово к отправке</span>
              <b>{filtered.filter((x) => getOverviewLaneId(x) === "ready_to_ship").length}</b>
            </div>
            <div className="kpi">
              <span>Отгружено</span>
              <b>{filtered.filter((x) => getOverviewLaneId(x) === "shipped").length}</b>
            </div>
          </>
        ) : view === "labor" ? (
          <>
            <div className="kpi"><span>Заказов</span><b>{laborKpi.totalOrders}</b></div>
            <div className="kpi"><span>Общее время (мин)</span><b>{Math.round(laborKpi.totalMinutes)}</b></div>
            <div className="kpi"><span>Всего изделий</span><b>{Math.round(laborKpi.totalQty)}</b></div>
            <div className="kpi"><span>Среднее / заказ (мин)</span><b>{Math.round(laborKpi.avgPerOrder)}</b></div>
          </>
        ) : view === "workshop" ? (
          <>
            <div className="kpi"><span>Всего</span><b>{kpi.total}</b></div>
            <div className="kpi"><span>В работе</span><b>{kpi.work}</b></div>
            <div className="kpi"><span>На паузе</span><b>{kpi.paused}</b></div>
            <div className="kpi"><span>Собрано</span><b>{kpi.done}</b></div>
          </>
        ) : (
          <>
            <div className="kpi"><span>Всего</span><b>{kpi.total}</b></div>
            <div className="kpi"><span>В работе</span><b>{kpi.work}</b></div>
            <div className="kpi"><span>На паузе</span><b>{kpi.paused}</b></div>
            <div className="kpi">
              <span>Собрано и отгрузка</span>
              <b>{kpi.done}</b>
            </div>
          </>
        )}
      </section>

      <section className="controls">
        {view === "overview" && (
          <div className="tabs tabs--overview-sub">
            <button
              type="button"
              className={overviewSubView === "kanban" ? "tab active" : "tab"}
              onClick={() => setOverviewSubView("kanban")}
            >
              Канбан
            </button>
            <button
              type="button"
              className={overviewSubView === "shipped" ? "tab active" : "tab"}
              onClick={() => setOverviewSubView("shipped")}
            >
              Отгружено
            </button>
          </div>
        )}
        {view === "workshop" && (
          <div className="tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={tab === t.id ? "tab active" : "tab"}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        {view === "warehouse" && (
          <div className="tabs tabs--overview-sub">
            <button
              type="button"
              className={warehouseSubView === "sheets" ? "tab active" : "tab"}
              onClick={() => setWarehouseSubView("sheets")}
            >
              Листы
            </button>
            <button
              type="button"
              className={warehouseSubView === "leftovers" ? "tab active" : "tab"}
              onClick={() => setWarehouseSubView("leftovers")}
            >
              Остатки
            </button>
            <button
              type="button"
              className={warehouseSubView === "history" ? "tab active" : "tab"}
              onClick={() => setWarehouseSubView("history")}
            >
              История списаний
            </button>
            <button
              type="button"
              className="mini ok"
              disabled={warehouseSyncLoading || loading}
              onClick={syncWarehouseFromGoogleSheet}
              title="Синхронизировать материалы из основной Google-таблицы склада"
            >
              {warehouseSyncLoading ? "Синхронизация..." : "Синхр. склад"}
            </button>
            <button
              type="button"
              className="mini ok"
              disabled={leftoversSyncLoading || loading}
              onClick={() => syncLeftoversToGoogleSheet()}
              title="Выгрузить остатки в лист 'Остатки' Google-таблицы"
            >
              {leftoversSyncLoading ? "Выгрузка..." : "Выгрузить остатки"}
            </button>
          </div>
        )}
        {view === "labor" && (
          <div className="tabs tabs--overview-sub">
            <button
              type="button"
              className={laborSubView === "total" ? "tab active" : "tab"}
              onClick={() => setLaborSubView("total")}
            >
              Общая
            </button>
            <button
              type="button"
              className={laborSubView === "orders" ? "tab active" : "tab"}
              onClick={() => setLaborSubView("orders")}
            >
              По заказам
            </button>
            <button
              type="button"
              className={laborSubView === "planner" ? "tab active" : "tab"}
              onClick={() => setLaborSubView("planner")}
            >
              Планировщик
            </button>
            <button
              type="button"
              className={laborSubView === "stages" ? "tab active" : "tab"}
              onClick={() => setLaborSubView("stages")}
            >
              Этапы
            </button>
          </div>
        )}
        <div className="filters">
          {view !== "furniture" && (
            <input
              placeholder={view === "shipment" ? "Поиск отгрузки: название или ID" : view === "warehouse" ? (warehouseSubView === "leftovers" ? "Поиск по цвету или размеру" : warehouseSubView === "history" ? "Поиск: заказ, материал, комментарий" : "Поиск материала") : "Поиск по названию или ID"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          {view !== "warehouse" && view !== "furniture" && !(view === "labor" && laborSubView === "stages") && (
            <select value={weekFilter} onChange={(e) => setWeekFilter(e.target.value)}>
              <option value="all">Все недели</option>
              {weeks.map((w) => <option key={w} value={w}>Неделя {w}</option>)}
            </select>
          )}
          {view === "stats" && (
            <select value={statsSort} onChange={(e) => setStatsSort(e.target.value)}>
              <option value="stage">Сортировка: по этапам</option>
              <option value="readiness">Сортировка: по готовности</option>
              <option value="color">Сортировка: по цвету</option>
              <option value="weekday">Сортировка: по дням недели</option>
            </select>
          )}
          {view === "shipment" && (
            <select value={shipmentSort} onChange={(e) => setShipmentSort(e.target.value)}>
              <option value="name">Сортировка: по названию</option>
              <option value="week">Сортировка: по неделе плана</option>
              <option value="color">Сортировка: по цвету</option>
            </select>
          )}
          {view === "shipment" && (
            <select value={shipmentViewMode} onChange={(e) => setShipmentViewMode(e.target.value)}>
              <option value="table">Вид: таблица</option>
              <option value="cards">Вид: карточки</option>
            </select>
          )}
          {view === "labor" && laborSubView === "total" && (
            <select value={laborSort} onChange={(e) => setLaborSort(e.target.value)}>
              <option value="total_desc">Трудоемкость: больше времени</option>
              <option value="total_asc">Трудоемкость: меньше времени</option>
              <option value="week">Трудоемкость: по неделе</option>
              <option value="item">Трудоемкость: по изделию</option>
            </select>
          )}
          {view === "labor" && laborSubView === "total" && (
            <div className="filters-right">
              <button className="mini" onClick={exportLaborTotalToExcel} disabled={!laborTableRows.length}>
                Экспорт Excel (общая)
              </button>
              <input
                ref={importLaborFileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files && e.target.files[0];
                  importLaborTotalFromExcelFile(f);
                }}
              />
              <button
                className="mini"
                disabled={actionLoading === "labor:import"}
                onClick={() => importLaborFileRef.current?.click()}
              >
                {actionLoading === "labor:import" ? "Импорт..." : "Импорт Excel (общая)"}
              </button>
              <button
                className="mini"
                disabled={!laborImportedRows.length}
                onClick={() => {
                  setLaborImportedRows([]);
                  setLaborSaveSelected({});
                  setLaborSavingByKey({});
                  setLaborSavedByKey({});
                }}
                title="Очистить только импортированные локальные строки"
              >
                Очистить импорт
              </button>
            </div>
          )}
          {view === "shipment" && (
            <div className="filters-right">
              <label className="empty-only-toggle">
                <input
                  type="checkbox"
                  checked={showAwaiting}
                  onChange={(e) => setShowAwaiting(e.target.checked)}
                />
                <span>Ожидаю заказ</span>
              </label>
              <label className="empty-only-toggle">
                <input
                  type="checkbox"
                  checked={showOnPilka}
                  onChange={(e) => setShowOnPilka(e.target.checked)}
                />
                <span>На пиле</span>
              </label>
              <label className="empty-only-toggle">
                <input
                  type="checkbox"
                  checked={showOnKromka}
                  onChange={(e) => setShowOnKromka(e.target.checked)}
                />
                <span>На кромке</span>
              </label>
              <label className="empty-only-toggle">
                <input
                  type="checkbox"
                  checked={showOnPras}
                  onChange={(e) => setShowOnPras(e.target.checked)}
                />
                <span>На присадке</span>
              </label>
              <label className="empty-only-toggle">
                <input
                  type="checkbox"
                  checked={showReadyAssembly}
                  onChange={(e) => setShowReadyAssembly(e.target.checked)}
                />
                <span>Готовы к сборке</span>
              </label>
              <label className="empty-only-toggle">
                <input
                  type="checkbox"
                  checked={showAwaitShipment}
                  onChange={(e) => setShowAwaitShipment(e.target.checked)}
                />
                <span>Ждёт отправку</span>
              </label>
              <label className="empty-only-toggle">
                <input
                  type="checkbox"
                  checked={showShipped}
                  onChange={(e) => setShowShipped(e.target.checked)}
                />
                <span>Отправленные</span>
              </label>
              <button className="mini" onClick={resetShipmentFilters}>
                Сброс фильтров
              </button>
              <button className="mini" disabled={!canOperateProduction} onClick={openStrapDialog}>
                Добавить обвязку
              </button>
              <button className="mini ok" disabled={!canOperateProduction} onClick={openCreatePlanDialog}>
                Добавить план
              </button>
              <button
                className="mini"
                disabled={selectedShipments.length === 0}
                onClick={exportSelectedShipmentToExcel}
              >
                Экспорт в Excel
              </button>
              <input
                ref={importPlanFileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files && e.target.files[0];
                  importShipmentPlanFromExcelFile(f);
                }}
              />
              <button
                className="mini"
                disabled={actionLoading === "shipment:import" || !canOperateProduction}
                onClick={() => importPlanFileRef.current?.click()}
              >
                {actionLoading === "shipment:import" ? "Импорт..." : "Импорт из Excel"}
              </button>
            </div>
          )}
        </div>
      </section>

      {!isOnline && (
        <div className="network-banner" role="status">
          Нет подключения к интернету. Данные могут быть устаревшими.
        </div>
      )}
      {error && <div className="error">{error}</div>}

      <section className="cards">
        {view === "shipment" && (
          <ShipmentView
            selectedShipments={selectedShipments}
            strapItems={strapItems}
            selectedShipmentSummary={selectedShipmentSummary}
            selectedShipmentStockCheck={selectedShipmentStockCheck}
            strapCalculation={strapCalculation}
            shipmentPlanDeficits={shipmentPlanDeficits}
            articleLookupByItemKey={articleLookupByItemKey}
            resolvePlanPreviewArticleByName={resolvePlanPreviewArticleByName}
            buildPlanPreviewQrPayload={buildPlanPreviewQrPayload}
            buildQrCodeUrl={buildQrCodeUrl}
            planPreviews={planPreviews}
            setPlanPreviews={setPlanPreviews}
            filtered={filtered}
            loading={loading}
            shipmentViewMode={shipmentViewMode}
            shipmentTableGroupNames={shipmentTableGroupNames}
            hiddenShipmentGroups={hiddenShipmentGroups}
            setHiddenShipmentGroups={setHiddenShipmentGroups}
            shipmentTableRowsWithStockStatus={shipmentTableRowsWithStockStatus}
            getReadableTextColor={getReadableTextColor}
            getMaterialLabel={getMaterialLabel}
            toggleShipmentSelection={toggleShipmentSelection}
            shipmentRenderSections={shipmentRenderSections}
            toggleSectionCollapsed={toggleSectionCollapsed}
            isSectionCollapsed={isSectionCollapsed}
            sortItemsForShipment={sortItemsForShipment}
            visibleCellsForItem={visibleCellsForItem}
            shipmentMaterialBalance={shipmentMaterialBalance}
            normalizeFurnitureKey={normalizeFurnitureKey}
            getShipmentStageKey={getShipmentStageKey}
            shipmentOrderMaps={shipmentOrderMaps}
            stageBg={stageBg}
            stageLabel={stageLabel}
            setHoverTip={setHoverTip}
            sendableSelectedCount={sendableSelectedCount}
            actionLoading={actionLoading}
            previewSelectedShipmentPlan={previewSelectedShipmentPlan}
            canOperateProduction={canOperateProduction}
            sendSelectedShipmentToWork={sendSelectedShipmentToWork}
            canManageOrders={canManageOrders}
            deleteSelectedShipmentPlan={deleteSelectedShipmentPlan}
            setSelectedShipments={setSelectedShipments}
          />
        )}
        {view === "overview" && (
          <OverviewView
            overviewSubView={overviewSubView}
            filtered={filtered}
            loading={loading}
            overviewColumns={overviewColumns}
            getStageLabel={getStageLabel}
            overviewShippedOnly={overviewShippedOnly}
            formatDateTimeRu={formatDateTimeRu}
          />
        )}
        {view === "labor" && (
          <LaborView
            laborSubView={laborSubView}
            laborTableRows={laborTableRows}
            laborOrdersRows={laborOrdersRows}
            laborPlannerRows={laborPlannerRows}
            laborPlannerQtyByGroup={laborPlannerQtyByGroup}
            setLaborPlannerQtyByGroup={setLaborPlannerQtyByGroup}
            laborStageTimelineRows={laborStageTimelineRows}
            laborSaveSelected={laborSaveSelected}
            setLaborSaveSelected={setLaborSaveSelected}
            laborSavingByKey={laborSavingByKey}
            laborSavedByKey={laborSavedByKey}
            saveImportedLaborRowToDb={saveImportedLaborRowToDb}
            loading={loading}
          />
        )}
        {view === "warehouse" && (
          <WarehouseView
            warehouseSubView={warehouseSubView}
            warehouseTableRows={warehouseTableRows}
            leftoversTableRows={leftoversTableRows}
            consumeHistoryTableRows={consumeHistoryTableRows}
            loading={loading}
          />
        )}
        {view === "stats" && (
          <StatsView
            statsList={statsList}
            loading={loading}
            getStageLabel={getStageLabel}
            getOverallStatusDisplay={getOverallStatusDisplay}
            actionLoading={actionLoading}
            getStatsDeleteActionKey={getStatsDeleteActionKey}
            canManageOrders={canManageOrders}
            deleteStatsOrder={deleteStatsOrder}
          />
        )}
        {view === "sheetMirror" && (
          <SheetMirrorView
            filtered={filtered}
            loading={loading}
            formatDateTimeRu={formatDateTimeRu}
          />
        )}
        {view === "furniture" && (
          <FurnitureView
            furnitureLoading={furnitureLoading}
            furnitureError={furnitureError}
            furnitureSheetData={furnitureSheetData}
            furnitureSelectedProduct={furnitureSelectedProduct}
            setFurnitureSelectedProduct={setFurnitureSelectedProduct}
            furnitureTemplates={furnitureTemplates}
            furnitureProductLabel={furnitureProductLabel}
            furnitureSelectedQty={furnitureSelectedQty}
            setFurnitureSelectedQty={setFurnitureSelectedQty}
            furnitureGeneratedDetails={furnitureGeneratedDetails}
            furnitureSelectedTemplate={furnitureSelectedTemplate}
            furnitureQtyNumber={furnitureQtyNumber}
          />
        )}
        {view === "admin" && (
          <AdminView
            canAdminSettings={canAdminSettings}
            crmUsersLoading={crmUsersLoading}
            crmUsersSaving={crmUsersSaving}
            loadCrmUsers={loadCrmUsers}
            newCrmUserId={newCrmUserId}
            setNewCrmUserId={setNewCrmUserId}
            newCrmUserRole={newCrmUserRole}
            setNewCrmUserRole={setNewCrmUserRole}
            newCrmUserNote={newCrmUserNote}
            setNewCrmUserNote={setNewCrmUserNote}
            createCrmUserRole={createCrmUserRole}
            crmUsers={crmUsers}
            updateCrmUserRole={updateCrmUserRole}
            removeCrmUserRole={removeCrmUserRole}
            auditLog={auditLog}
            auditLoading={auditLoading}
            auditError={auditError}
            auditAction={auditAction}
            auditEntity={auditEntity}
            auditLimit={auditLimit}
            auditOffset={auditOffset}
            setAuditAction={setAuditAction}
            setAuditEntity={setAuditEntity}
            loadAuditLog={loadAuditLog}
            formatDateTimeRu={formatDateTimeRu}
            roleOptions={CRM_ROLES}
            roleLabels={CRM_ROLE_LABELS}
          />
        )}
        {view === "workshop" && (
          <WorkshopView
            workshopRows={workshopRows}
            loading={loading}
            tab={tab}
            shipmentOrders={shipmentOrders}
            shipmentBoard={shipmentBoard}
            statusClass={statusClass}
            resolveDefaultConsumeSheets={resolveDefaultConsumeSheets}
            resolveDefaultConsumeSheetsFromBoard={resolveDefaultConsumeSheetsFromBoard}
            isDone={isDone}
            isInWork={isInWork}
            isOrderCustomerShipped={isOrderCustomerShipped}
            actionLoading={actionLoading}
            isActionPending={isActionPending}
            canOperateProduction={canOperateProduction}
            runAction={runAction}
            executorByOrder={executorByOrder}
            setExecutorByOrder={setExecutorByOrder}
            executorOptions={executorOptions}
            getMaterialLabel={getMaterialLabel}
          />
        )}
      </section>
      {hoverTip.visible && (
        <div
          className="hover-tip"
          style={{ left: `${hoverTip.x}px`, top: `${hoverTip.y}px` }}
        >
          {hoverTip.text}
        </div>
      )}
      <ConsumeDialog
        isOpen={consumeDialogOpen}
        consumeDialogData={consumeDialogData}
        consumeLoading={consumeLoading}
        consumeEditMode={consumeEditMode}
        consumeMaterial={consumeMaterial}
        consumeQty={consumeQty}
        consumeSaving={consumeSaving}
        consumeError={consumeError}
        onSubmit={submitConsume}
        onSetEditMode={setConsumeEditMode}
        onClose={closeConsumeDialog}
        onMaterialChange={setConsumeMaterial}
        onQtyChange={setConsumeQty}
      />
      <StrapDialog
        isOpen={strapDialogOpen}
        strapTargetProduct={strapTargetProduct}
        strapProductNames={strapProductNames}
        strapPlanWeek={strapPlanWeek}
        strapOptionsForSelectedProduct={strapOptionsForSelectedProduct}
        strapDraft={strapDraft}
        isSaving={actionLoading === "shipment:strapsave"}
        onTargetProductChange={setStrapTargetProduct}
        onPlanWeekChange={(value) => setStrapPlanWeek(value.replace(/[^\d-]/g, ""))}
        onDraftValueChange={(name, value) =>
          setStrapDraft((prev) => ({
            ...prev,
            [name]: value.replace(/[^0-9.,]/g, ""),
          }))
        }
        onSave={saveStrapDialog}
        onClose={() => setStrapDialogOpen(false)}
        onClear={() => {
          setStrapItems([]);
          setStrapDraft(strapOptionsForSelectedProduct.reduce((acc, name) => ({ ...acc, [name]: "" }), {}));
          setStrapDialogOpen(false);
        }}
      />
      <PlanDialog
        isOpen={planDialogOpen}
        planSection={planSection}
        sectionOptions={sectionOptions}
        planArticle={planArticle}
        sectionArticles={sectionArticles}
        planMaterial={planMaterial}
        planWeek={planWeek}
        planQty={planQty}
        planSaving={planSaving}
        onSectionChange={handlePlanSectionChange}
        onArticleChange={handlePlanArticleChange}
        onPlanWeekChange={(value) => setPlanWeek(value.replace(/[^\d-]/g, ""))}
        onPlanQtyChange={(value) => setPlanQty(value.replace(/[^0-9.,]/g, ""))}
        onSave={saveCreatePlanDialog}
        onClose={closeCreatePlanDialog}
      />
    </div>
  );
}


