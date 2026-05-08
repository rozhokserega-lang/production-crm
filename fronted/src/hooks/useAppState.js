import { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  callBackend,
  getSupabaseRealtimeClient,
} from "../api";
import {
  KROMKA_EXECUTORS,
  PRAS_EXECUTORS,
  SHEET_MIRROR_GID,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from "../config";
import furnitureWorkbookUrl from "../assets/furniture.xlsx?url";
import {
  getOverviewLaneId,
  getOrderStageDisplayLabel as getStageLabel,
  isOrderCustomerShipped,
  resolvePipelineStage as getCurrentStage,
} from "../orderPipeline";
import {
  getShipmentStageKey,
  isGarbageShipmentItemName,
  isObvyazkaSectionName,
  isStorageLikeName,
} from "../utils/shipmentUtils";
import {
  buildFurnitureTemplates,
  normalizeFurnitureKey,
  normalizeStrapProductKey,
  resolveStrapMaterialByProduct,
  strapNameToOrderItem,
} from "../utils/furnitureUtils";
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
} from "./useOrders";
import { useDataLoader } from "./useDataLoader";
import { useAuth } from "./useAuth";
import { useCrmRole } from "./useCrmRole";
import { useShipmentDialogsState } from "./useShipmentDialogsState";
import { useShipmentUiState } from "./useShipmentUiState";
import { useShipmentSelectionStats } from "./useShipmentSelectionStats";
import { useShipmentTableData } from "./useShipmentTableData";
import { useStrapDerivedData } from "./useStrapDerivedData";
import { useFurnitureDerivedData } from "./useFurnitureDerivedData";
import { useDashboardDerivedData } from "./useDashboardDerivedData";
import { useWarehouseTableData } from "./useWarehouseTableData";
import { useWarehouseOrderPlanRows } from "./useWarehouseOrderPlanRows";
import { useLaborDerivedData } from "./useLaborDerivedData";
import { useLaborStageAnalytics } from "./useLaborStageAnalytics";
import { useShipmentPlanningDerivedData } from "./useShipmentPlanningDerivedData";
import { useShipmentOrderIndexes } from "./useShipmentOrderIndexes";
import { useCommonDerivedData } from "./useCommonDerivedData";
import { useShipmentBoardRenderDerived } from "./useShipmentBoardRenderDerived";
import { useFurniturePreviewSync } from "./useFurniturePreviewSync";
import { useLaborState } from "./useLaborState";
import { useLaborActions } from "./useLaborActions";
import { useStageActions } from "./useStageActions";
import { useConsumeDialog } from "./useConsumeDialog";
import { usePlanDialog } from "./usePlanDialog";
import { useStrapDialog } from "./useStrapDialog";
import { useMetalState } from "./useMetalState";
import { useMetalProcessState } from "./useMetalProcessState";
import { useEdgeSync } from "./useEdgeSync";
import { useWorkSchedule } from "./useWorkSchedule";
import { useError } from "../contexts/ErrorContext";
import { useShipmentData } from "../contexts/ShipmentDataContext";
import { useWarehouseData } from "../contexts/WarehouseDataContext";
import { useFurnitureData } from "../contexts/FurnitureDataContext";
import { OrderService } from "../services/orderService";
import {
  CONSUME_LOG_SHEET_NAME,
  CRM_ROLE_LABELS,
  DEFAULT_SHIPMENT_PREFS,
  STRAP_OPTIONS,
  STRAP_SHEET_HEIGHT,
  STRAP_SHEET_WIDTH,
} from "../app/appConstants";
import {
  stageBg,
  stageLabel,
  statusClass,
} from "../app/statusHelpers";
import {
  getMaterialLabel,
} from "../app/orderHelpers";
import {
  extractErrorMessage,
  toUserError,
} from "../app/errorCatalogHelpers";
import {
  normalizeOrder,
} from "../app/rowHelpers";
import {
  remapStrapDraftByOptions,
} from "../app/shipmentDialogHelpers";
import { matchesWeekFilter, weekFilterStorageKey } from "../app/weekFilterUtils";
import { useShipmentActions } from "./useShipmentActions";
import { useFurnitureActions } from "./useFurnitureActions";
import { useOrderMgmtActions } from "./useOrderMgmtActions";
import { useWarehouseActions } from "./useWarehouseActions";
import {
  buildPreviewRowsFromFurnitureTemplate,
  getColorGroup,
  getWeekday,
  isDone,
  isInWork,
  mergeShipmentBoardWithTable,
  normalizeExecutorList,
  normalizeShipmentBoard,
  parseStrapSize,
  passesShipmentStageFilter,
} from "../app/appUtils";

export function useAppState() {
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
  const [overviewSubView, setOverviewSubView] = useState("kanban");
  const {
    shipmentBoard,
    setShipmentBoard,
    planCatalogRows,
    setPlanCatalogRows,
    sectionCatalogRows,
    setSectionCatalogRows,
    sectionArticleRows,
    setSectionArticleRows,
    shipmentOrders,
    setShipmentOrders,
    materialsStockRows,
    setMaterialsStockRows,
  } = useShipmentData();
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
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const [pendingStageActionKeys, setPendingStageActionKeys] = useState(() => new Set());
  const { error, setError } = useError();
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

  // Strap "Присадка: Готово" dialog state
  const [strapDoneDialogOpen, setStrapDoneDialogOpen] = useState(false);
  const [strapDoneDialogMeta, setStrapDoneDialogMeta] = useState(null);
  const [strapDoneQtyInput, setStrapDoneQtyInput] = useState("");
  const [strapDoneError, setStrapDoneError] = useState("");
  const [strapDoneSaving, setStrapDoneSaving] = useState(false);

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
  const laborStageFetchKeyRef = useRef("");
  const {
    warehouseRows,
    setWarehouseRows,
    leftoversRows,
    setLeftoversRows,
    leftoversHistoryRows,
    setLeftoversHistoryRows,
    consumeHistoryRows,
    setConsumeHistoryRows,
    pilkaDoneHistoryRows,
    setPilkaDoneHistoryRows,
  } = useWarehouseData();
  const [warehouseSubView, setWarehouseSubView] = useState("sheets");
  const [warehouseSyncLoading, setWarehouseSyncLoading] = useState(false);
  const [leftoversSyncLoading, setLeftoversSyncLoading] = useState(false);
  const {
    furnitureLoading,
    setFurnitureLoading,
    furnitureError,
    setFurnitureError,
    furnitureWorkbook,
    setFurnitureWorkbook,
    furnitureActiveSheet,
    setFurnitureActiveSheet,
    furnitureShowFormulas,
    setFurnitureShowFormulas,
    furnitureArticleRows,
    setFurnitureArticleRows,
    furnitureDetailArticleRows,
    setFurnitureDetailArticleRows,
    furnitureCustomTemplates,
    setFurnitureCustomTemplates,
    furnitureSelectedProduct,
    setFurnitureSelectedProduct,
    furnitureSelectedQty,
    setFurnitureSelectedQty,
  } = useFurnitureData();
  const authEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
  const isActionPending = useCallback((key) => pendingStageActionKeys.has(key), [pendingStageActionKeys]);

  const denyActionByRole = useCallback((message) => {
    setError(message);
    return false;
  }, [setError]);

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
    setFurnitureCustomTemplates,
    setMaterialsStockRows,
    setLeftoversRows,
    setLeftoversHistoryRows,
    setConsumeHistoryRows,
    setPilkaDoneHistoryRows,
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
    authEmail,
    authPassword,
    authSaving,
    authUser,
    setAuthEmail,
    setAuthPassword,
    signInWithSupabase,
    signOutSupabaseUser,
  } = useAuth({
    authEnabled,
    onAuthChange: load,
    setError,
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
    setNewCrmUserId,
    setNewCrmUserRole,
    setNewCrmUserNote,
    setAuditAction,
    setAuditEntity,
    toggleCrmAuthStrict,
    loadCrmUsers,
    loadAuditLog,
    updateCrmUserRole,
    removeCrmUserRole,
    createCrmUserRole,
  } = useCrmRole({
    view,
    toUserError,
    authEnabled,
    load,
    setError,
    authUser,
  });
  const canOperateProduction = crmRole === "operator" || crmRole === "manager" || crmRole === "admin";
  const canOperateWarehouse = Boolean(authUser?.id) && (crmRole === "warehouse" || crmRole === "admin");
  const canManageOrders = crmRole === "manager" || crmRole === "admin";
  const canAdminSettings = crmRole === "admin";

  const [consumeLogSheetName, setConsumeLogSheetName] = useState(CONSUME_LOG_SHEET_NAME);
  const [consumeLogSheetUpdatedAt, setConsumeLogSheetUpdatedAt] = useState("");
  const [consumeLogSheetLoading, setConsumeLogSheetLoading] = useState(false);
  const [consumeLogSheetSaving, setConsumeLogSheetSaving] = useState(false);

  const loadConsumeLogSheetSetting = useCallback(async () => {
    setConsumeLogSheetLoading(true);
    try {
      const raw = await OrderService.getConsumeLogSheetName();
      const row = Array.isArray(raw) ? raw[0] : raw;
      const name = String(row?.sheet_name ?? row?.sheetName ?? "").trim();
      const at = String(row?.updated_at ?? row?.updatedAt ?? "").trim();
      if (name) setConsumeLogSheetName(name);
      setConsumeLogSheetUpdatedAt(at);
    } catch (_) {
      /* оставляем константу по умолчанию, если RPC ещё не задеплоен */
    } finally {
      setConsumeLogSheetLoading(false);
    }
  }, []);

  const saveConsumeLogSheetSetting = useCallback(
    async (sheetName) => {
      if (!canAdminSettings) return;
      setConsumeLogSheetSaving(true);
      setError("");
      try {
        const raw = await OrderService.setConsumeLogSheetName(sheetName);
        const row = Array.isArray(raw) ? raw[0] : raw;
        const name = String(row?.sheet_name ?? row?.sheetName ?? "").trim();
        const at = String(row?.updated_at ?? row?.updatedAt ?? "").trim();
        if (name) setConsumeLogSheetName(name);
        setConsumeLogSheetUpdatedAt(at);
      } catch (e) {
        setError(toUserError(e));
      } finally {
        setConsumeLogSheetSaving(false);
      }
    },
    [canAdminSettings, setError],
  );

  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return undefined;
    loadConsumeLogSheetSetting();
    return undefined;
  }, [loadConsumeLogSheetSetting]);

  const {
    notifyAssemblyReadyTelegram,
    notifyFinalStageTelegram,
    syncWarehouseFromGoogleSheet,
    syncLeftoversToGoogleSheet,
    logConsumeToGoogleSheet,
    syncPlanCellToGoogleSheet,
  } = useEdgeSync({
    setError,
    setWarehouseSyncLoading,
    setLeftoversSyncLoading,
    load,
    consumeLogSheetName,
  });

  const {
    closeConsumeDialog,
    submitConsume,
    openPilkaDoneConsumeDialog,
    openPilkaDoneConsumeDialogOnError,
  } = useConsumeDialog({
    canOperateProduction,
    canOperateWarehouse,
    setError,
    consumeDialogData,
    setConsumeDialogOpen,
    setConsumeEditMode,
    setConsumeDialogData,
    setConsumeMaterial,
    setConsumeQty,
    setConsumeError,
    setConsumeSaving,
    setConsumeLoading,
    logConsumeToGoogleSheet,
    syncLeftoversToGoogleSheet,
    load,
  });

  const openPrasDoneStrapDialog = useCallback((orderId, meta = {}) => {
    setStrapDoneDialogMeta({ orderId, ...meta });
    setStrapDoneQtyInput(String(meta.qty || ""));
    setStrapDoneError("");
    setStrapDoneSaving(false);
    setStrapDoneDialogOpen(true);
  }, []);

  const closeStrapDoneDialog = useCallback(() => {
    setStrapDoneDialogOpen(false);
    setStrapDoneDialogMeta(null);
    setStrapDoneQtyInput("");
    setStrapDoneError("");
    setStrapDoneSaving(false);
    void load();
  }, [load]);

  const submitStrapDone = useCallback(async (strapType, color, qtyRaw) => {
    const qty = parseInt(String(qtyRaw || "").replace(",", "."), 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      setStrapDoneError("Введите количество планок (целое число > 0)");
      return;
    }
    setStrapDoneSaving(true);
    setStrapDoneError("");
    try {
      const orderId = strapDoneDialogMeta?.orderId;
      const mode = strapDoneDialogMeta?.mode || "done";
      await callBackend("webAddStrapStock", { strapType, color, qty });
      if (orderId) {
        if (mode === "done") {
          // Strap orders stop at присадка — skip remaining stages so the order leaves the workshop view.
          await Promise.allSettled([
            callBackend("webSetAssemblyDone", { orderId }),
            callBackend("webSetShippingDone", { orderId }),
          ]);
        } else if (mode === "pause") {
          // Subtract completed qty from the paused order.
          await callBackend("webReduceOrderQty", { orderId, qtyDone: qty });
        }
      }
      setStrapDoneDialogOpen(false);
      setStrapDoneDialogMeta(null);
      setStrapDoneQtyInput("");
      void load();
    } catch (e) {
      setStrapDoneError(String(e?.message || e || "Ошибка сохранения"));
    } finally {
      setStrapDoneSaving(false);
    }
  }, [strapDoneDialogMeta, load]);

  const {
    weeks,
    sectionOptions,
    sectionArticles,
    selectedItemVariants: _selectedPlanItemVariants,
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

  const {
    furnitureSheetData,
    furnitureTemplates,
    furnitureSelectedTemplate,
    furnitureQtyNumber,
    furnitureGeneratedDetails,
    furnitureArticleSearchRows,
    furnitureArticleGroups,
  } = useFurnitureDerivedData({
    view,
    query,
    furnitureWorkbook,
    furnitureActiveSheet,
    furnitureCustomTemplates,
    furnitureSelectedProduct,
    setFurnitureSelectedProduct,
    furnitureSelectedQty,
    furnitureDetailArticleRows,
    furnitureArticleRows,
  });

  const { resolveFurnitureTemplateForPreviewByArticle } = useFurniturePreviewSync({
    sectionArticleRows,
    furnitureTemplates,
    furnitureLoading,
    furnitureError,
    setPlanPreviews,
    buildPreviewRowsFromFurnitureTemplate,
    normalizeFurnitureKey,
  });

  const refreshPlanCatalogs = useCallback(async () => {
    try {
      const [catalog, sections, articles] = await Promise.all([
        OrderService.getPlanCatalog().catch(() => []),
        OrderService.getSectionCatalog().catch(() => []),
        OrderService.getSectionArticles().catch(() => []),
      ]);
      setPlanCatalogRows(Array.isArray(catalog) ? catalog : []);
      setSectionCatalogRows(Array.isArray(sections) ? sections : []);
      setSectionArticleRows(Array.isArray(articles) ? articles : []);
    } catch (_) {
      // Best-effort refresh; do not block the UI.
    }
  }, [setPlanCatalogRows, setSectionCatalogRows, setSectionArticleRows]);

  const {
    handlePlanSectionChange,
    handlePlanArticleChange,
    openCreatePlanDialog: _openCreatePlanDialog,
    closeCreatePlanDialog,
    saveCreatePlanDialog,
    previewCreatePlanDialog,
  } = usePlanDialog({
    canOperateProduction,
    denyActionByRole,
    setError,
    setPlanSection,
    setPlanArticle,
    setPlanMaterial,
    setPlanWeek,
    setPlanQty,
    setPlanSaving,
    setPlanDialogOpen,
    setPlanPreviews,
    sectionOptions,
    weeks,
    sectionArticleRows,
    sectionArticles,
    planSection,
    planArticle,
    planMaterial,
    planWeek,
    planQty,
    planSaving,
    resolvedPlanItem,
    furnitureTemplates,
    syncPlanCellToGoogleSheet,
    load,
  });

  const openCreatePlanDialog = useCallback(async () => {
    // Ensure catalog dropdowns see latest manual items/sections.
    await refreshPlanCatalogs();
    _openCreatePlanDialog();
  }, [_openCreatePlanDialog, refreshPlanCatalogs]);

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

  const {
    openStrapDialog,
    saveStrapDialog,
  } = useStrapDialog({
    canOperateProduction,
    denyActionByRole,
    setError,
    setActionLoading,
    setStrapDialogOpen,
    setStrapTargetProduct,
    setStrapPlanWeek,
    setStrapDraft,
    setStrapItems,
    strapItems,
    strapProductNames,
    weekFilter,
    weeks,
    strapOptionsByProduct,
    strapTargetProduct,
    strapPlanWeek,
    strapDraft,
    strapOptionsForSelectedProduct,
    resolveStrapMaterialByProduct,
    strapNameToOrderItem,
    normalizeStrapProductKey,
    syncPlanCellToGoogleSheet,
    load,
  });

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
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      const fallbackId = setInterval(() => load().catch(() => {}), 60000);
      return () => clearInterval(fallbackId);
    }
    const client = getSupabaseRealtimeClient();
    if (!client) {
      const fallbackId = setInterval(() => load().catch(() => {}), 60000);
      return () => clearInterval(fallbackId);
    }
    let disposed = false;
    let reloadTimer = null;
    let fallbackId = null;

    const scheduleReload = () => {
      if (disposed) return;
      if (reloadTimer) window.clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(() => {
        reloadTimer = null;
        load().catch(() => {});
      }, 300);
    };
    const ensureFallbackPolling = () => {
      if (disposed || fallbackId) return;
      fallbackId = window.setInterval(() => load().catch(() => {}), 60000);
    };
    const clearFallbackPolling = () => {
      if (!fallbackId) return;
      window.clearInterval(fallbackId);
      fallbackId = null;
    };

    const REALTIME_TABLES = [
      "orders",
      "shipment_plan_cells",
      "labor_facts",
      "materials_stock",
      "materials_leftovers",
      "materials_moves",
      "crm_audit_log",
      "furniture_product_map",
      "furniture_detail_item_map",
      "metal_components_stock",
      "metal_work_queue",
    ];

    const channel = client
      .channel("crm-db-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        scheduleReload,
      );

    REALTIME_TABLES.filter((t) => t !== "orders").forEach((table) => {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        scheduleReload,
      );
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearFallbackPolling();
        return;
      }
      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        ensureFallbackPolling();
      }
    });

    return () => {
      disposed = true;
      if (reloadTimer) window.clearTimeout(reloadTimer);
      clearFallbackPolling();
      client.removeChannel(channel).catch(() => {});
    };
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    async function loadCrmExecutors() {
      try {
        const payload = await OrderService.getCrmExecutors();
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
    setError,
    toUserError,
  });
  useEffect(() => {
    let alive = true;
    setFurnitureLoading(true);
    setFurnitureError("");
    fetch(furnitureWorkbookUrl)
      .then((r) => {
        if (!r.ok) {
          throw new Error(`HTTP ${r.status} при загрузке ${r.url || furnitureWorkbookUrl}`);
        }
        return r.arrayBuffer();
      })
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (view !== "warehouse") setWarehouseSubView("sheets");
  }, [view]);

  const {
    metalStockRows,
    metalSavingArticle,
    setMetalSavingArticle,
    selectedShipmentMetal,
    loadMetalStock,
    loadMetalQueue,
    adjustMetalStock,
  } = useMetalState({
    view,
    setLoading,
    setError,
    toUserError,
    selectedShipments,
    articleLookupByItemKey,
    normalizeFurnitureKey,
  });
  const {
    metalProcessRows,
    metalProcessCatalogRows,
    metalProcessLoading,
    metalProcessCatalogLoading,
    metalProcessActionKey,
    metalProcessDraft,
    setMetalProcessDraft,
    loadMetalProcessData,
    createMetalProcessPlanItem,
    transitionMetalProcessStage,
    saveMetalProcessComment,
    deleteMetalProcessItem,
    upsertMetalCatalogItem,
    deleteMetalCatalogItem,
  } = useMetalProcessState({
    view,
    canOperateProduction,
    canOperateWarehouse,
    canManageOrders,
    setError,
    toUserError,
  });

  const { shipmentOrderMaps, orderIndexById } = useShipmentOrderIndexes({
    shipmentOrders,
    rows,
  });

  const { runAction } = useStageActions({
    canOperateProduction,
    denyActionByRole,
    setError,
    setRows,
    setShipmentOrders,
    setPendingStageActionKeys,
    orderIndexById,
    shipmentBoard,
    load,
    syncPlanCellToGoogleSheet,
    notifyAssemblyReadyTelegram,
    notifyFinalStageTelegram,
    openPilkaDoneConsumeDialog,
    openPilkaDoneConsumeDialogOnError,
    openPrasDoneStrapDialog,
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

  const shipmentStageFilter = useCallback(
    (stageKey) => passesShipmentStageFilter(stageKey, {
      showAwaiting,
      showOnPilka,
      showOnKromka,
      showOnPras,
      showReadyAssembly,
      showAwaitShipment,
      showShipped,
    }),
    [showAwaiting, showOnPilka, showOnKromka, showOnPras, showReadyAssembly, showAwaitShipment, showShipped],
  );

  const shipmentFiltered = useShipmentFilter({
    shipmentBoard,
    shipmentOrderMaps,
    query,
    weekFilter,
    isStorageLikeName,
    isObvyazkaSectionName,
    isGarbageShipmentItemName,
    getShipmentStageKey,
    passesShipmentStageFilter: shipmentStageFilter,
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

  const {
    adminCommentSaving,
    saveOrderAdminComment,
    deleteStatsOrder,
    overrideOrderStageFromDrawer,
  } = useOrderMgmtActions({
    canAdminSettings,
    canManageOrders,
    denyActionByRole,
    setActionLoading,
    setError,
    load,
    orderDrawerId,
    rowsRef,
  });

  useEffect(() => {
    if (view !== "overview") setOrderDrawerId("");
  }, [view]);

  useEffect(() => {
    if (view !== "labor" || laborSubView !== "stages") {
      setStageAuditRows([]);
      setActiveOrderIds([]);
      laborStageFetchKeyRef.current = "";
      return;
    }
    if (!canManageOrders) {
      setStageAuditRows([]);
      setActiveOrderIds([]);
      laborStageFetchKeyRef.current = "";
      return;
    }

    let cancelled = false;
    const stageSourceRows =
      laborSubView === "stages"
        ? (rows || []).filter((x) => {
            const byWeek = matchesWeekFilter(x?.week, weekFilter);
            if (!byWeek) return false;
            const q = String(query || "").trim().toLowerCase();
            const byQuery =
              !q ||
              String(x?.item || "").toLowerCase().includes(q) ||
              String(x?.orderId || x?.order_id || "").toLowerCase().includes(q);
            if (!byQuery) return false;
            const lane = String(getOverviewLaneId(x) || "");
            return lane && lane !== "ready_to_ship" && lane !== "shipped";
          })
        : filtered;
    const ids = (stageSourceRows || [])
      .map((x) => String(x?.orderId || x?.order_id || "").trim())
      .filter(Boolean);
    const uniqueIds = Array.from(new Set(ids)).sort();
    const fetchKey = `${view}|${laborSubView}|${weekFilterStorageKey(weekFilter)}|${query}|${uniqueIds.join(",")}`;
    if (fetchKey === laborStageFetchKeyRef.current) {
      return () => {
        cancelled = true;
      };
    }
    laborStageFetchKeyRef.current = fetchKey;
    setActiveOrderIds((prev) => {
      if (prev.length === uniqueIds.length && prev.every((id, idx) => id === uniqueIds[idx])) return prev;
      return uniqueIds;
    });

    async function loadLaborStageTimeline() {
      try {
        const payload = await OrderService.getAuditLog({ limit: 1000, offset: 0, action: null });
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
  }, [view, laborSubView, canManageOrders, filtered, rows, weekFilter, query, setError]);

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
    passesShipmentStageFilter: shipmentStageFilter,
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
    furnitureCustomTemplates,
  });
  const warehouseOrderPlanRows = useWarehouseOrderPlanRows({
    shipmentBoard,
    materialsStockRows,
    getMaterialLabel,
    normalizeFurnitureKey,
  });

  const { printWarehouseOrderPlanPdf } = useWarehouseActions({
    warehouseOrderPlanRows,
    setError,
  });
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
    filteredOrders: baseOrderFiltered,
    workSchedule,
    laborOrdersRows,
    laborPlannerQtyByGroup,
    laborTableRows,
  });
  const { warehouseTableRows, leftoversTableRows, consumeHistoryTableRows } = useWarehouseTableData({
    view,
    query,
    warehouseRows,
    leftoversRows,
    leftoversHistoryRows,
    consumeHistoryRows,
    pilkaDoneHistoryRows,
    shipmentOrders,
    shipmentBoard,
    furnitureCustomTemplates,
  });

  const {
    selectedShipmentSummary,
    sendableSelectedCount,
    selectedShipmentStockCheck,
    strapCalculation,
    selectedItemVariants: _selectedItemVariants,
  } = useShipmentSelectionStats({
    selectedShipments,
    strapItems,
    normalizeFurnitureKey,
    parseStrapSize,
    strapSheetWidth: STRAP_SHEET_WIDTH,
    strapSheetHeight: STRAP_SHEET_HEIGHT,
  });
  const {
    importPlanFileRef,
    sendSelectedShipmentToWork,
    deleteSelectedShipmentPlan,
    toggleShipmentSelection,
    previewSelectedShipmentPlan,
    exportSelectedShipmentToExcel,
    importShipmentPlanFromExcelFile,
  } = useShipmentActions({
    canOperateProduction,
    canManageOrders,
    denyActionByRole,
    selectedShipments,
    setSelectedShipments,
    setPlanPreviews,
    setActionLoading,
    setError,
    load,
    view,
    loadMetalQueue,
    selectedShipmentMetal,
    sectionArticleRows,
    articleLookupByItemKey,
    furnitureTemplates,
    furnitureLoading,
    furnitureError,
    resolveFurnitureTemplateForPreviewByArticle,
    strapProductBySizeToken,
    strapProductsByArticleCode,
    strapTargetProduct,
  });


  useEffect(() => {
    if (!strapDialogOpen) return;
    const options = strapOptionsForSelectedProduct;
    const nextDraft = remapStrapDraftByOptions(options, strapDraft);
    setStrapDraft(nextDraft);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strapDialogOpen, strapTargetProduct, strapOptionsForSelectedProduct.join("|")]);

  const {
    importMetalFileRef,
    createShelfPlanOrder,
    createFurniturePlanOrder,
    importMetalFromExcelFile,
  } = useFurnitureActions({
    canOperateProduction,
    denyActionByRole,
    setActionLoading,
    setError,
    load,
    sectionArticleRows,
    syncPlanCellToGoogleSheet,
    loadMetalStock,
  });

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
    load,
    setLaborImportedRows,
    setLaborSaveSelected,
    setLaborSavingByKey,
    setLaborSavedByKey,
  });

  return {
    // View state
    view, setView,
    tab, setTab,
    overviewSubView, setOverviewSubView,
    warehouseSubView, setWarehouseSubView,
    laborSubView, setLaborSubView,
    statsSort, setStatsSort,
    orderDrawerId, setOrderDrawerId,
    actionLoading, setActionLoading,
    isOnline,
    error, setError,

    // Auth & roles
    authEnabled,
    authEmail, setAuthEmail,
    authPassword, setAuthPassword,
    authSaving,
    authUser,
    authUserLabel,
    signInWithSupabase,
    signOutSupabaseUser,
    crmRole,
    crmRoleLabel,
    crmAuthStrict,
    crmAuthStrictSaving,
    canOperateProduction,
    canManageOrders,
    canAdminSettings,
    crmUsers,
    crmUsersLoading,
    crmUsersSaving,
    newCrmUserId, setNewCrmUserId,
    newCrmUserRole, setNewCrmUserRole,
    newCrmUserNote, setNewCrmUserNote,
    setAuditAction, setAuditEntity,
    auditLog, auditLoading, auditError,
    auditAction, auditEntity, auditLimit, auditOffset,
    toggleCrmAuthStrict,
    loadCrmUsers,
    loadAuditLog,
    updateCrmUserRole,
    removeCrmUserRole,
    createCrmUserRole,

    // Data loading
    load,
    rows, setRows,
    query, setQuery,
    loading, setLoading,

    // Shipment data
    shipmentBoard, setShipmentBoard,
    planCatalogRows, setPlanCatalogRows,
    sectionCatalogRows, setSectionCatalogRows,
    sectionArticleRows, setSectionArticleRows,
    shipmentOrders, setShipmentOrders,
    materialsStockRows, setMaterialsStockRows,
    selectedShipments, setSelectedShipments,
    planPreviews, setPlanPreviews,
    hoverTip, setHoverTip,
    weekFilter, setWeekFilter,
    showAwaiting, setShowAwaiting,
    showOnPilka, setShowOnPilka,
    showOnKromka, setShowOnKromka,
    showOnPras, setShowOnPras,
    showReadyAssembly, setShowReadyAssembly,
    showAwaitShipment, setShowAwaitShipment,
    showShipped, setShowShipped,
    hiddenShipmentGroups, setHiddenShipmentGroups,
    shipmentSort, setShipmentSort,
    shipmentViewMode, setShipmentViewMode,
    resetShipmentFilters,
    isSectionCollapsed,
    toggleSectionCollapsed,

    // Dialogs state
    consumeDialogOpen, setConsumeDialogOpen,
    consumeEditMode, setConsumeEditMode,
    consumeDialogData, setConsumeDialogData,
    consumeMaterial, setConsumeMaterial,
    consumeQty, setConsumeQty,
    consumeSaving, setConsumeSaving,
    consumeError, setConsumeError,
    consumeLoading, setConsumeLoading,
    strapDialogOpen, setStrapDialogOpen,
    strapTargetProduct, setStrapTargetProduct,
    strapPlanWeek, setStrapPlanWeek,
    strapDraft, setStrapDraft,
    strapItems, setStrapItems,
    planDialogOpen, setPlanDialogOpen,
    planSection, setPlanSection,
    planArticle, setPlanArticle,
    planMaterial, setPlanMaterial,
    planWeek, setPlanWeek,
    planQty, setPlanQty,
    planSaving, setPlanSaving,

    // Labor state
    laborSort, setLaborSort,
    laborPlannerQtyByGroup, setLaborPlannerQtyByGroup,
    laborRows, setLaborRows,
    laborImportedRows, setLaborImportedRows,
    laborSaveSelected, setLaborSaveSelected,
    laborSavingByKey, setLaborSavingByKey,
    laborSavedByKey, setLaborSavedByKey,

    // Warehouse data
    warehouseRows, setWarehouseRows,
    leftoversRows, setLeftoversRows,
    leftoversHistoryRows, setLeftoversHistoryRows,
    consumeHistoryRows, setConsumeHistoryRows,
    pilkaDoneHistoryRows, setPilkaDoneHistoryRows,
    warehouseSyncLoading,
    leftoversSyncLoading,

    // Furniture data
    furnitureLoading, setFurnitureLoading,
    furnitureError, setFurnitureError,
    furnitureWorkbook, setFurnitureWorkbook,
    furnitureActiveSheet, setFurnitureActiveSheet,
    furnitureShowFormulas, setFurnitureShowFormulas,
    furnitureArticleRows, setFurnitureArticleRows,
    furnitureDetailArticleRows, setFurnitureDetailArticleRows,
    furnitureCustomTemplates, setFurnitureCustomTemplates,
    furnitureSelectedProduct, setFurnitureSelectedProduct,
    furnitureSelectedQty, setFurnitureSelectedQty,

    // Refs
    importPlanFileRef,
    importMetalFileRef,

    // Derived data
    weeks,
    sectionOptions,
    sectionArticles,
    articleLookupByItemKey,
    resolvedPlanItem,
    furnitureSheetData,
    furnitureTemplates,
    furnitureSelectedTemplate,
    furnitureQtyNumber,
    furnitureGeneratedDetails,
    furnitureArticleSearchRows,
    furnitureArticleGroups,
    strapOptionsByProduct,
    strapProductBySizeToken,
    strapProductsByArticleCode,
    strapProductNames,
    strapOptionsForSelectedProduct,
    workScheduleLoading,
    workScheduleSaving,
    workSchedule,
    setWorkSchedule,
    loadWorkSchedule,
    saveWorkSchedule,
    consumeLogSheetName,
    consumeLogSheetUpdatedAt,
    consumeLogSheetLoading,
    consumeLogSheetSaving,
    loadConsumeLogSheetSetting,
    saveConsumeLogSheetSetting,
    metalStockRows,
    metalSavingArticle, setMetalSavingArticle,
    selectedShipmentMetal,
    metalProcessRows,
    metalProcessCatalogRows,
    metalProcessLoading,
    metalProcessActionKey,
    metalProcessDraft,
    setMetalProcessDraft,
    loadMetalStock,
    loadMetalQueue,
    loadMetalProcessData,
    adjustMetalStock,
    shipmentOrderMaps,
    orderIndexById,
    runAction,
    isActionPending,
    denyActionByRole,
    callBackend,
    filtered,
    orderDrawerLines,
    overviewShippedOnly,
    visibleCellsForItem,
    sortItemsForShipment,
    shipmentRenderSections,
    kpi, statsGroups, statsList, overviewColumns, shipmentKpi,
    workshopRows,
    shipmentMaterialBalance,
    shipmentTableRowsWithStockStatus,
    shipmentTableGroupNames,
    shipmentPlanDeficits,
    warehouseOrderPlanRows,
    laborTableRows,
    laborOrdersRows,
    laborStageTimelineRows,
    laborPlannerRows,
    laborKpi,
    warehouseTableRows,
    leftoversTableRows,
    consumeHistoryTableRows,
    selectedShipmentSummary,
    sendableSelectedCount,
    selectedShipmentStockCheck,
    strapCalculation,

    // Actions
    overrideOrderStageFromDrawer,
    sendSelectedShipmentToWork,
    deleteSelectedShipmentPlan,
    deleteStatsOrder,
    toggleShipmentSelection,
    createShelfPlanOrder,
    createFurniturePlanOrder,
    createMetalProcessPlanItem,
    saveMetalProcessComment,
    deleteMetalProcessItem,
    upsertMetalCatalogItem,
    deleteMetalCatalogItem,
    metalProcessCatalogLoading,
    refreshPlanCatalogs,
    previewSelectedShipmentPlan,
    exportSelectedShipmentToExcel,
    importShipmentPlanFromExcelFile,
    importMetalFromExcelFile,
    printWarehouseOrderPlanPdf,
    saveOrderAdminComment,
    adminCommentSaving,

    // Dialog actions
    closeConsumeDialog,
    submitConsume,
    openPilkaDoneConsumeDialog,
    openPilkaDoneConsumeDialogOnError,
    strapDoneDialogOpen,
    strapDoneDialogMeta,
    strapDoneQtyInput, setStrapDoneQtyInput,
    strapDoneError,
    strapDoneSaving,
    closeStrapDoneDialog,
    submitStrapDone,
    handlePlanSectionChange,
    handlePlanArticleChange,
    openCreatePlanDialog,
    closeCreatePlanDialog,
    saveCreatePlanDialog,
    previewCreatePlanDialog,
    openStrapDialog,
    saveStrapDialog,
    transitionMetalProcessStage,

    // Labor actions
    importLaborFileRef,
    exportLaborTotalToExcel,
    importLaborTotalFromExcelFile,
    saveImportedLaborRowToDb,

    // Edge sync
    syncWarehouseFromGoogleSheet,
    syncLeftoversToGoogleSheet,
    logConsumeToGoogleSheet,
    syncPlanCellToGoogleSheet,

    // Executors
    executorByOrder, setExecutorByOrder,
    executorOptions,
  };
}
