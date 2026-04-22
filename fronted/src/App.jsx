import { useCallback, useEffect, useRef, useState } from "react";
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
} from "./utils/shipmentUtils";
import {
  buildFurnitureTemplates,
  canonicalStrapProductName,
  extractDetailSizeToken,
  furnitureProductLabel,
  isStrapVirtualRowId,
  normalizeFurnitureKey,
  normalizeStrapProductKey,
  resolveFurnitureTemplateForPreview,
  resolveStrapMaterialByProduct,
  strapNameToOrderItem,
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
import { useShipmentDialogsState } from "./hooks/useShipmentDialogsState";
import { useShipmentUiState } from "./hooks/useShipmentUiState";
import { useShipmentSelectionStats } from "./hooks/useShipmentSelectionStats";
import { useShipmentTableData } from "./hooks/useShipmentTableData";
import { useStrapDerivedData } from "./hooks/useStrapDerivedData";
import { useFurnitureDerivedData } from "./hooks/useFurnitureDerivedData";
import { useDashboardDerivedData } from "./hooks/useDashboardDerivedData";
import { useWarehouseTableData } from "./hooks/useWarehouseTableData";
import { useWarehouseOrderPlanRows } from "./hooks/useWarehouseOrderPlanRows";
import { useLaborDerivedData } from "./hooks/useLaborDerivedData";
import { useLaborStageAnalytics } from "./hooks/useLaborStageAnalytics";
import { useShipmentPlanningDerivedData } from "./hooks/useShipmentPlanningDerivedData";
import { useShipmentOrderIndexes } from "./hooks/useShipmentOrderIndexes";
import { useCommonDerivedData } from "./hooks/useCommonDerivedData";
import { useShipmentBoardRenderDerived } from "./hooks/useShipmentBoardRenderDerived";
import { useLaborState } from "./hooks/useLaborState";
import { useLaborActions } from "./hooks/useLaborActions";
import { useMetalState } from "./hooks/useMetalState";
import { useWorkSchedule } from "./hooks/useWorkSchedule";
import { OrderDrawer } from "./components/OrderDrawer";
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
import { MetalView } from "./views/MetalView";
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
} from "./app/orderHelpers";
import {
  buildPlanPreviewQrPayload,
  buildQrCodeUrl,
  resolvePlanPreviewArticleByName,
} from "./app/planPreviewHelpers";
import {
  extractErrorMessage,
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
  applyOptimisticOrderRow,
  buildPreviewRowsFromFurnitureTemplate,
  formatDateTimeForPrint,
  hasOptimisticActionRule,
  mergeShipmentBoardWithTable,
  normalizeShipmentBoard,
  parseStrapSize,
  resolveDefaultConsumeSheets,
  resolveDefaultConsumeSheetsFromBoard,
} from "./app/appUtils";

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
  const {
    selectedShipments,
    setSelectedShipments,
    planPreviews,
    setPlanPreviews,
    hoverTip,
    setHoverTip,
    weekFilter,
    setWeekFilter,
    showAwaiting,
    setShowAwaiting,
    showOnPilka,
    setShowOnPilka,
    showOnKromka,
    setShowOnKromka,
    showOnPras,
    setShowOnPras,
    showReadyAssembly,
    setShowReadyAssembly,
    showAwaitShipment,
    setShowAwaitShipment,
    showShipped,
    setShowShipped,
    hiddenShipmentGroups,
    setHiddenShipmentGroups,
    shipmentSort,
    setShipmentSort,
    shipmentViewMode,
    setShipmentViewMode,
    resetShipmentFilters,
    isSectionCollapsed,
    toggleSectionCollapsed,
  } = useShipmentUiState(DEFAULT_SHIPMENT_PREFS);
  const [statsSort, setStatsSort] = useState("stage");
  const [actionLoading, setActionLoading] = useState("");
  const [orderDrawerId, setOrderDrawerId] = useState("");
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
  const {
    consumeDialogOpen,
    setConsumeDialogOpen,
    consumeEditMode,
    setConsumeEditMode,
    consumeDialogData,
    setConsumeDialogData,
    consumeMaterial,
    setConsumeMaterial,
    consumeQty,
    setConsumeQty,
    consumeSaving,
    setConsumeSaving,
    consumeError,
    setConsumeError,
    consumeLoading,
    setConsumeLoading,
    strapDialogOpen,
    setStrapDialogOpen,
    strapTargetProduct,
    setStrapTargetProduct,
    strapPlanWeek,
    setStrapPlanWeek,
    strapDraft,
    setStrapDraft,
    strapItems,
    setStrapItems,
    planDialogOpen,
    setPlanDialogOpen,
    planSection,
    setPlanSection,
    planArticle,
    setPlanArticle,
    planMaterial,
    setPlanMaterial,
    planWeek,
    setPlanWeek,
    planQty,
    setPlanQty,
    planSaving,
    setPlanSaving,
  } = useShipmentDialogsState(STRAP_OPTIONS);
  const {
    laborSort,
    setLaborSort,
    laborSubView,
    setLaborSubView,
    laborPlannerQtyByGroup,
    setLaborPlannerQtyByGroup,
    laborRows,
    setLaborRows,
    laborImportedRows,
    setLaborImportedRows,
    laborSaveSelected,
    setLaborSaveSelected,
    laborSavingByKey,
    setLaborSavingByKey,
    laborSavedByKey,
    setLaborSavedByKey,
  } = useLaborState(view);
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
  const [adminCommentSaving, setAdminCommentSaving] = useState(false);
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
  const {
    workScheduleLoading,
    workScheduleSaving,
    workSchedule,
    setWorkSchedule,
    loadWorkSchedule,
    saveWorkSchedule,
  } = useWorkSchedule({
    canAdminSettings,
    view,
    callBackend,
    setError,
    toUserError,
  });
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
  function isDone(s) {
    const v = String(s || "").toLowerCase();
    if (/\bне\s*готов/.test(v) || v.includes("неготов")) return false;
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

  async function adjustMetalStock(metalArticle, deltaQty) {
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для изменения остатков металла.");
      return;
    }
    const article = String(metalArticle || "").trim();
    const delta = Number(deltaQty || 0);
    if (!article || !Number.isFinite(delta) || delta === 0) return;
    setMetalSavingArticle(article);
    setError("");
    try {
      const current = metalStockRows.find((x) => String(x.metal_article || "") === article);
      const currentQty = Number(current?.qty_available || 0);
      const nextQty = Math.max(0, currentQty + delta);
      await callBackend("webSetMetalStock", {
        metalArticle: article,
        metalName: String(current?.metal_name || ""),
        qtyAvailable: nextQty,
      });
      await loadMetalStock();
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setMetalSavingArticle("");
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
    const hasOptimisticRule = hasOptimisticActionRule(action);
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

  const {
    weeks,
    sectionOptions,
    sectionArticles,
    articleLookupByItemKey,
    resolvedPlanItem,
  } = useShipmentPlanningDerivedData({
    view,
    shipmentBoard,
    laborRows,
    rows,
    planCatalogRows,
    sectionCatalogRows,
    sectionArticleRows,
    planSection,
    planArticle,
    normalizeFurnitureKey,
  });
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
  const {
    metalStockRows,
    metalSavingArticle,
    setMetalSavingArticle,
    metalSubView,
    setMetalSubView,
    metalQueueRows,
    metalQueueLoading,
    metalQueueUpdatingId,
    selectedShipmentMetal,
    loadMetalStock,
    loadMetalQueue,
    updateMetalQueueStatus,
  } = useMetalState({
    view,
    callBackend,
    setLoading,
    setError,
    toUserError,
    selectedShipments,
    articleLookupByItemKey,
    normalizeFurnitureKey,
  });

  const { shipmentOrderMaps, orderIndexById } = useShipmentOrderIndexes({
    shipmentOrders,
    rows,
  });
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
    laborRows: [...laborRows, ...laborImportedRows],
    query,
    weekFilter,
  });
  const sheetMirrorFiltered = useSheetMirrorFilter({
    rows,
    query,
  });

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

  const { filtered, orderDrawerLines } = useCommonDerivedData({
    view,
    shipmentFiltered,
    laborFiltered,
    sheetMirrorFiltered,
    baseOrderFiltered,
    rows,
    orderDrawerId,
  });

  const saveOrderAdminComment = useCallback(
    async (text) => {
      const id = String(orderDrawerId || "").trim();
      if (!id || !canAdminSettings) return;
      setAdminCommentSaving(true);
      setError("");
      try {
        await callBackend("webSetOrderAdminComment", { orderId: id, text });
        await load();
      } catch (e) {
        setError(toUserError(e));
      } finally {
        setAdminCommentSaving(false);
      }
    },
    [orderDrawerId, canAdminSettings, load],
  );

  useEffect(() => {
    if (view !== "overview") setOrderDrawerId("");
  }, [view]);

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

  const {
    overviewShippedOnly,
    visibleCellsForItem,
    sortItemsForShipment,
    shipmentRenderSections,
  } = useShipmentBoardRenderDerived({
    view,
    filtered,
    weekFilter,
    shipmentOrderMaps,
    passesShipmentStageFilter,
    shipmentSort,
    materialsStockRows,
    strapItems,
  });

  const { kpi, statsGroups, statsList, overviewColumns, shipmentKpi } = useDashboardDerivedData({
    filtered,
    view,
    tab,
    statsSort,
    isInWork,
    statusClass,
    getCurrentStage,
    getColorGroup,
    getWeekday,
    getStageLabel,
    getOverviewLaneId,
  });
  const workshopRows = useWorkshopRows({
    filtered,
    view,
    tab,
    isDone,
    isInWork,
    getOverviewLaneId,
    isOrderCustomerShipped,
  });
  const {
    shipmentMaterialBalance,
    shipmentTableRowsWithStockStatus,
    shipmentTableGroupNames,
    shipmentPlanDeficits,
  } = useShipmentTableData({
    view,
    shipmentRenderSections,
    shipmentOrderMaps,
    visibleCellsForItem,
    getShipmentStageKey,
    stageBg,
    stageLabel,
    normalizeFurnitureKey,
    hiddenShipmentGroups,
  });
  const warehouseOrderPlanRows = useWarehouseOrderPlanRows({
    shipmentBoard,
    materialsStockRows,
    getMaterialLabel,
    normalizeFurnitureKey,
  });

  function printWarehouseOrderPlanPdf() {
    const rows = warehouseOrderPlanRows;
    if (!rows.length) {
      setError("Дефицита материалов нет — заказывать нечего.");
      return;
    }
    const now = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
    const htmlRows = rows
      .map(
        (r, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td>${String(r.material || "")}</td>
            <td>${r.needed}</td>
            <td>${r.available}</td>
            <td><b>${r.toOrder}</b></td>
          </tr>`,
      )
      .join("");
    const popup = window.open("", "_blank");
    if (!popup) {
      setError("Не удалось открыть окно печати. Разреши pop-up для сайта.");
      return;
    }
    popup.document.write(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Что заказать (склад)</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; color: #0f172a; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    .meta { margin: 0 0 16px; color: #334155; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; font-size: 13px; text-align: left; }
    th { background: #f1f5f9; }
  </style>
</head>
<body>
  <h1>Лист заказа материалов</h1>
  <div class="meta">Сформировано: ${now}</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Материал</th>
        <th>Нужно для плана</th>
        <th>В наличии</th>
        <th>Заказать</th>
      </tr>
    </thead>
    <tbody>${htmlRows}</tbody>
  </table>
</body>
</html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  }
  const { laborTableRows, laborOrdersRows } = useLaborDerivedData({
    view,
    filtered,
    laborSort,
  });
  const { laborStageTimelineRows, laborPlannerRows, laborKpi } = useLaborStageAnalytics({
    view,
    laborSubView,
    stageAuditRows,
    query,
    activeOrderIds,
    laborOrdersRows,
    laborPlannerQtyByGroup,
    laborTableRows,
  });
  const {
    furnitureSheetData,
    furnitureTemplates,
    furnitureSelectedTemplate,
    furnitureQtyNumber,
    furnitureGeneratedDetails,
  } = useFurnitureDerivedData({
    view,
    query,
    furnitureWorkbook,
    furnitureActiveSheet,
    furnitureSelectedProduct,
    setFurnitureSelectedProduct,
    furnitureSelectedQty,
    furnitureDetailArticleRows,
    furnitureArticleRows,
  });
  const { warehouseTableRows, leftoversTableRows, consumeHistoryTableRows } = useWarehouseTableData({
    view,
    query,
    warehouseRows,
    leftoversRows,
    consumeHistoryRows,
  });

  const {
    selectedShipmentSummary,
    sendableSelectedCount,
    selectedShipmentStockCheck,
    strapCalculation,
  } = useShipmentSelectionStats({
    selectedShipments,
    strapItems,
    normalizeFurnitureKey,
    parseStrapSize,
    strapSheetWidth: STRAP_SHEET_WIDTH,
    strapSheetHeight: STRAP_SHEET_HEIGHT,
  });
  const {
    strapOptionsByProduct,
    strapProductBySizeToken,
    strapProductsByArticleCode,
    strapProductNames,
    strapOptionsForSelectedProduct,
  } = useStrapDerivedData({
    furnitureDetailArticleRows,
    strapTargetProduct,
    setStrapTargetProduct,
    fallbackOptions: STRAP_OPTIONS,
  });

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
      const metalDeficits = (selectedShipmentMetal.rows || []).filter((x) => Number(x.deficitQty || 0) > 0);
      const hasMetalDeficit = metalDeficits.length > 0;
      if (hasMetalDeficit) {
        for (const s of sendable) {
          await callBackend("webEnqueueMetalWorkOrder", {
            sourceRow: s.row,
            sourceCol: s.col,
            item: s.item,
            week: s.week,
            qty: Number(s.qty || 0),
            reason: "Нехватка металла при отправке в работу",
            shortage: metalDeficits.map((d) => ({
              metalArticle: d.metalArticle,
              metalName: d.metalName,
              deficitQty: d.deficitQty,
              neededQty: d.neededQty,
              qtyAvailable: d.qtyAvailable,
            })),
          });
        }
      }
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
      if (hasMetalDeficit) {
        setError("Заказы отправлены в работу. Позиции по нехватке металла добавлены в очередь 'Металл в работу'.");
        if (view === "metal") {
          await loadMetalQueue();
        }
      }
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

      const { imported, missing, marked } = await applyImportPlanRows(importRows, articleMap, {
        callBackend,
        planNumber,
        markMissingAsPlanRows: true,
      });

      await load();
      if (missing.length > 0) {
        setError(formatImportShipmentPartialError(imported, missing, marked));
      }
    } catch (e) {
      setError(formatShipmentImportError(extractErrorMessage(e)));
    } finally {
      setActionLoading("");
      if (importPlanFileRef.current) importPlanFileRef.current.value = "";
    }
  }

  const {
    importLaborFileRef,
    exportLaborTotalToExcel,
    importLaborTotalFromExcelFile,
    saveImportedLaborRowToDb,
  } = useLaborActions({
    view,
    laborSubView,
    laborTableRows,
    setError,
    setActionLoading,
    canOperateProduction,
    denyActionByRole,
    callBackend,
    load,
    setLaborImportedRows,
    setLaborSaveSelected,
    setLaborSavingByKey,
    setLaborSavedByKey,
  });

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
              <span>Отправка</span>
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
            <button
              type="button"
              className="mini"
              disabled={warehouseOrderPlanRows.length === 0}
              onClick={printWarehouseOrderPlanPdf}
              title="Сформировать PDF, что нужно заказать для закрытия плана"
            >
              Что заказать
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
        {view === "metal" && (
          <div className="tabs tabs--overview-sub">
            <button
              type="button"
              className={metalSubView === "queue" ? "tab active" : "tab"}
              onClick={() => setMetalSubView("queue")}
            >
              В работе
            </button>
            <button
              type="button"
              className={metalSubView === "stock" ? "tab active" : "tab"}
              onClick={() => setMetalSubView("stock")}
            >
              Наличие
            </button>
          </div>
        )}
        <div className="filters">
          {view !== "furniture" && (
            <input
              placeholder={view === "shipment" ? "Поиск отгрузки: название или ID" : view === "warehouse" ? (warehouseSubView === "leftovers" ? "Поиск по цвету или размеру" : warehouseSubView === "history" ? "Поиск: заказ, материал, комментарий" : "Поиск материала") : view === "metal" ? (metalSubView === "queue" ? "Поиск: изделие, неделя, статус" : "Поиск по артикулу или названию металла") : "Поиск по названию или ID"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          {view !== "warehouse" && view !== "furniture" && view !== "metal" && !(view === "labor" && laborSubView === "stages") && (
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
            selectedShipmentMetal={selectedShipmentMetal}
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
            onOpenOrderDrawer={setOrderDrawerId}
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
            warehouseOrderPlanRows={warehouseOrderPlanRows}
            loading={loading}
          />
        )}
        {view === "metal" && (
          <MetalView
            metalSubView={metalSubView}
            rows={metalStockRows.filter((row) => {
              const q = String(query || "").trim().toLowerCase();
              if (!q || metalSubView !== "stock") return true;
              return (
                String(row.metal_article || "").toLowerCase().includes(q) ||
                String(row.metal_name || "").toLowerCase().includes(q)
              );
            })}
            loading={loading}
            canOperateProduction={canOperateProduction}
            savingKey={metalSavingArticle}
            onAdjustStock={adjustMetalStock}
            queueRows={metalQueueRows.filter((row) => {
              const q = String(query || "").trim().toLowerCase();
              if (!q || metalSubView !== "queue") return true;
              return (
                String(row.item || "").toLowerCase().includes(q) ||
                String(row.week || "").toLowerCase().includes(q) ||
                String(row.status || "").toLowerCase().includes(q)
              );
            })}
            queueLoading={metalQueueLoading}
            queueUpdatingId={metalQueueUpdatingId}
            onQueueStatusChange={updateMetalQueueStatus}
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
            workSchedule={workSchedule}
            setWorkSchedule={setWorkSchedule}
            workScheduleLoading={workScheduleLoading}
            workScheduleSaving={workScheduleSaving}
            loadWorkSchedule={loadWorkSchedule}
            saveWorkSchedule={saveWorkSchedule}
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
      <OrderDrawer
        orderId={orderDrawerId}
        lines={orderDrawerLines}
        open={Boolean(orderDrawerId)}
        onClose={() => setOrderDrawerId("")}
        getStageLabel={getStageLabel}
        formatDateTimeRu={formatDateTimeRu}
        isDone={isDone}
        isInWork={isInWork}
        getMaterialLabel={getMaterialLabel}
        canEditAdminComment={canAdminSettings}
        onSaveAdminComment={saveOrderAdminComment}
        savingAdminComment={adminCommentSaving}
      />
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


