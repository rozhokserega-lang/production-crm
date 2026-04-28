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
  canonicalStrapProductName,
  extractDetailSizeToken,
  isStrapVirtualRowId,
  normalizeFurnitureKey,
  normalizeStrapProductKey,
  resolveFurnitureTemplateForPreview,
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
import { useLaborState } from "./useLaborState";
import { useLaborActions } from "./useLaborActions";
import { useStageActions } from "./useStageActions";
import { useConsumeDialog } from "./useConsumeDialog";
import { usePlanDialog } from "./usePlanDialog";
import { useStrapDialog } from "./useStrapDialog";
import { useMetalState } from "./useMetalState";
import { useEdgeSync } from "./useEdgeSync";
import { useWorkSchedule } from "./useWorkSchedule";
import { useError } from "../contexts/ErrorContext";
import { useShipmentData } from "../contexts/ShipmentDataContext";
import { useWarehouseData } from "../contexts/WarehouseDataContext";
import { useFurnitureData } from "../contexts/FurnitureDataContext";
import { OrderService } from "../services/orderService";
import {
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
  embedPlanItemArticle,
  extractPlanItemArticle,
  getMaterialLabel,
  getPlanPreviewArticleCode,
} from "../app/orderHelpers";
import {
  resolvePlanPreviewArticleByName,
} from "../app/planPreviewHelpers";
import {
  extractErrorMessage,
  toUserError,
} from "../app/errorCatalogHelpers";
import {
  isShipmentCellMissingError,
  normalizeOrder,
} from "../app/rowHelpers";
import {
  buildShipmentCellAttempts,
  runShipmentCellActionWithFallback,
} from "../app/shipmentActionHelpers";
import {
  getStatsDeleteActionKey,
  resolveStatsOrderSourceCell,
} from "../app/statsDeleteHelpers";
import {
  buildStrapPreviewPlans,
  remapStrapDraftByOptions,
} from "../app/shipmentDialogHelpers";
import {
  buildShipmentPreviewPlans,
  enrichPreviewFromFurniture,
  enrichPreviewWithStrapProduct,
} from "../app/shipmentPreviewHelpers";
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
} from "../app/shipmentExportHelpers";
import {
  formatMetalImportError,
  getMetalImportNoValidRowsError,
  parseMetalImportRows,
} from "../app/metalImportHelpers";
import {
  buildPreviewRowsFromFurnitureTemplate,
  formatDateTimeForPrint,
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
  const selectedShipmentsRef = useRef(selectedShipments);
  const rowsRef = useRef(rows);
  useEffect(() => {
    selectedShipmentsRef.current = selectedShipments;
  }, [selectedShipments]);
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
  const importPlanFileRef = useRef(null);
  const importMetalFileRef = useRef(null);
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
    callBackend,
    toUserError,
    authEnabled,
    load,
    setError,
    authUser,
  });
  const canOperateProduction = crmRole === "operator" || crmRole === "manager" || crmRole === "admin";
  const canManageOrders = crmRole === "manager" || crmRole === "admin";
  const canAdminSettings = crmRole === "admin";

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
  });

  const {
    closeConsumeDialog,
    submitConsume,
    openPilkaDoneConsumeDialog,
    openPilkaDoneConsumeDialogOnError,
  } = useConsumeDialog({
    canOperateProduction,
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

  const {
    weeks,
    sectionOptions,
    sectionArticles,
    selectedItemVariants,
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

  const resolveFurnitureTemplateForPreviewByArticle = useCallback((preview, templates) => {
    const list = Array.isArray(templates) ? templates : [];
    if (!preview || list.length === 0) return null;
    const article = String(preview?.article || "").trim();
    if (article) {
      const row = (sectionArticleRows || []).find((x) => String(x?.article || "").trim() === article) || null;
      const itemName = String(row?.item_name || row?.itemName || "").trim();
      if (itemName) {
        const key = normalizeFurnitureKey(itemName);
        const byExact = list.find((t) => normalizeFurnitureKey(t?.productName || "") === key);
        if (byExact) return byExact;
        const byContains = list.find((t) => {
          const k = normalizeFurnitureKey(t?.productName || "");
          return k && (key.includes(k) || k.includes(key));
        });
        if (byContains) return byContains;
      }
    }
    return resolveFurnitureTemplateForPreview(preview, list);
  }, [sectionArticleRows, normalizeFurnitureKey]);

  // If the user opens preview very early, templates may still be loading and
  // previews will contain only the backend placeholder row. Once templates are ready,
  // expand existing previews in-place.
  useEffect(() => {
    if (!Array.isArray(furnitureTemplates) || furnitureTemplates.length === 0) return;
    setPlanPreviews((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;
      let changed = false;
      const next = prev.map((p) => {
        const enriched = enrichPreviewFromFurniture(p, {
          furnitureTemplates,
          resolveFurnitureTemplateForPreview: resolveFurnitureTemplateForPreviewByArticle,
          buildPreviewRowsFromFurnitureTemplate,
          normalizeFurnitureKey,
          furnitureLoading,
          furnitureError,
        });
        if (enriched !== p) changed = true;
        return enriched;
      });
      return changed ? next : prev;
    });
  }, [furnitureTemplates, furnitureLoading, furnitureError, setPlanPreviews, resolveFurnitureTemplateForPreviewByArticle]);

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
    callBackend,
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

  async function overrideOrderStageFromDrawer(orderId, stage, status) {
    if (!canAdminSettings) {
      denyActionByRole("Только администратор может вручную менять этап из канбана.");
      return;
    }
    const stageKey = String(stage || "").trim().toLowerCase();
    const statusKey = String(status || "").trim().toLowerCase();
    const stageMap = {
      pilka: {
        in_work: "webSetPilkaInWork",
        done: "webSetPilkaDone",
        pause: "webSetPilkaPause",
        wait: "webSetPilkaWait",
      },
      kromka: {
        in_work: "webSetKromkaInWork",
        done: "webSetKromkaDone",
        pause: "webSetKromkaPause",
        wait: "webSetKromkaWait",
      },
      pras: {
        in_work: "webSetPrasInWork",
        done: "webSetPrasDone",
        pause: "webSetPrasPause",
        wait: "webSetPrasWait",
      },
    };
    const action = stageMap[stageKey]?.[statusKey];
    if (!action) {
      setError("Некорректная комбинация этапа и статуса.");
      return;
    }
    setError("");
    try {
      await OrderService.updateOrderStage(orderId, action);
      await load();
    } catch (e) {
      setError(toUserError(e));
    }
  }

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

  const saveOrderAdminComment = useCallback(
    async (text) => {
      const id = String(orderDrawerId || "").trim();
      if (!id || !canAdminSettings) return;
      setAdminCommentSaving(true);
      setError("");
      try {
        await OrderService.setOrderAdminComment(id, text);
        await load();
      } catch (e) {
        setError(toUserError(e));
      } finally {
        setAdminCommentSaving(false);
      }
    },
    [orderDrawerId, canAdminSettings, load, setError],
  );

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
            const byWeek = weekFilter === "all" || String(x?.week || "") === weekFilter;
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
    const fetchKey = `${view}|${laborSubView}|${weekFilter}|${query}|${uniqueIds.join(",")}`;
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
  });
  const warehouseOrderPlanRows = useWarehouseOrderPlanRows({
    shipmentBoard,
    materialsStockRows,
    getMaterialLabel,
    normalizeFurnitureKey,
  });

  const printWarehouseOrderPlanPdf = useCallback(() => {
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
  }, [warehouseOrderPlanRows, setError]);
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
  const sendSelectedShipmentToWork = useCallback(async () => {
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для отправки заказов в работу.");
      return;
    }
    const current = selectedShipmentsRef.current;
    if (!current.length) return;
    const sendable = current.filter((s) => !!s.canSendToWork);
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
          await OrderService.enqueueMetalWorkOrder({
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
          actionFn: (params) => OrderService.sendShipmentToWork(params.row, params.col),
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
  }, [canOperateProduction, selectedShipmentMetal, setActionLoading, setError, setPlanPreviews, setSelectedShipments, load, view, loadMetalQueue, denyActionByRole]);

  const deleteSelectedShipmentPlan = useCallback(async () => {
    if (!canManageOrders) {
      denyActionByRole("Недостаточно прав для удаления позиций из плана.");
      return;
    }
    const current = selectedShipmentsRef.current;
    if (!current.length) return;
    const deletable = current.filter((s) => !!s.canSendToWork);
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
          actionFn: (params) => OrderService.deleteShipmentPlanCell({ p_row: params.p_row, p_col: params.p_col, row: params.p_row, col: params.p_col }),
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
  }, [canManageOrders, setActionLoading, setError, setPlanPreviews, setSelectedShipments, load, denyActionByRole]);

  const deleteStatsOrder = useCallback(async (order) => {
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
    const currentRows = rowsRef.current;
    const actionKey = getStatsDeleteActionKey(order, currentRows);
    setActionLoading(actionKey);
    setError("");
    try {
      try {
        await OrderService.deleteOrder(orderId);
      } catch (deleteByOrderErr) {
        const msg = String(deleteByOrderErr?.message || deleteByOrderErr || "");
        const missingAction =
          msg.includes("не настроен для action") ||
          msg.includes("Unknown action") ||
          msg.includes("not configured");
        if (!missingAction) throw deleteByOrderErr;
        const source = await resolveStatsOrderSourceCell(order, currentRows);
        const sourceRow = source.row;
        const sourceCol = source.col;
        if (!sourceRow || !sourceCol) {
          setError("Для этого заказа не найдена привязка к ячейке плана (row/col).");
          return;
        }
        await OrderService.deleteShipmentPlanCell({ p_row: sourceRow, p_col: sourceCol, row: sourceRow, col: sourceCol });
      }
      await load();
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setActionLoading("");
    }
  }, [canManageOrders, setActionLoading, setError, load, denyActionByRole]);

  const toggleShipmentSelection = useCallback((payload) => {
    setSelectedShipments((prev) => {
      const exists = prev.some((s) => s.row === payload.row && s.col === payload.col);
      if (exists) return prev.filter((s) => !(s.row === payload.row && s.col === payload.col));
      return [...prev, payload];
    });
  }, [setSelectedShipments]);

  useEffect(() => {
    if (!strapDialogOpen) return;
    const options = strapOptionsForSelectedProduct;
    const nextDraft = remapStrapDraftByOptions(options, strapDraft);
    setStrapDraft(nextDraft);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strapDialogOpen, strapTargetProduct, strapOptionsForSelectedProduct.join("|")]);

  const createShelfPlanOrder = useCallback(async (payload) => {
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для изменения плана.");
      return;
    }
    const week = String(payload?.week || "").trim();
    const item = String(payload?.item || "").trim();
    const article = String(payload?.article || "").trim();
    const material = String(payload?.material || "").trim();
    const qty = Number(payload?.qty || 0);
    const qrQty = Number(payload?.qrQty || 0);
    if (!week) {
      setError("Укажите номер плана.");
      return;
    }
    if (!item || !material || !(qty > 0)) {
      setError("Заполните поля заказа полок: изделие, материал и количество.");
      return;
    }
    setActionLoading("shelf:create-plan");
    setError("");
    try {
      const request = {
        sectionName: "Система хранения",
        item: embedPlanItemArticle(item, article, qrQty),
        material,
        week,
        qty,
        article,
      };
      await OrderService.createShipmentPlanCell(request);
      void syncPlanCellToGoogleSheet(request);
      await load();
    } catch (e) {
      setError(toUserError(e));
      throw e;
    } finally {
      setActionLoading("");
    }
  }, [canOperateProduction, setActionLoading, setError, load, denyActionByRole, syncPlanCellToGoogleSheet]);

  const createFurniturePlanOrder = useCallback(async (payload) => {
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для изменения плана.");
      return;
    }
    const week = String(payload?.week || "").trim();
    const item = String(payload?.item || "").trim();
    const article = String(payload?.article || "").trim();
    const material = String(payload?.material || "").trim();
    const qty = Number(payload?.qty || 0);
    const qrQty = Number(payload?.qrQty || 0);
    if (!week) {
      setError("Укажите номер плана.");
      return;
    }
    if (!item || !material || !(qty > 0)) {
      setError("Заполните поля заказа: изделие, материал и количество.");
      return;
    }
    setActionLoading("furniture:create-plan");
    setError("");
    try {
      const request = {
        sectionName: "Основная мебель",
        item: embedPlanItemArticle(item, article, qrQty),
        material,
        week,
        qty,
        article,
      };
      await OrderService.createShipmentPlanCell(request);
      void syncPlanCellToGoogleSheet(request);
      await load();
    } catch (e) {
      setError(toUserError(e));
      throw e;
    } finally {
      setActionLoading("");
    }
  }, [canOperateProduction, setActionLoading, setError, load, denyActionByRole, syncPlanCellToGoogleSheet]);

  const previewSelectedShipmentPlan = useCallback(async () => {
    const current = selectedShipmentsRef.current;
    if (!current.length) return;
    const strapSelections = current.filter((s) => isStrapVirtualRowId(s.row));
    const shipmentSelections = current.filter((s) => !isStrapVirtualRowId(s.row));
    setActionLoading("preview:batch");
    setError("");
    try {
      const generatedAt = formatDateTimeForPrint(new Date());
      const strapPreviews = buildStrapPreviewPlans(strapSelections, generatedAt);
      let shipmentTableBySource = new Map();
      try {
        const tableRows = await OrderService.getShipmentTable();
        const list = Array.isArray(tableRows) ? tableRows : [];
        shipmentTableBySource = new Map(
          list.map((row) => [
            `${String(row?.source_row_id || row?.sourceRowId || "").trim()}|${String(row?.source_col_id || row?.sourceColId || "").trim()}`,
            row,
          ]),
        );
      } catch (_) {
        shipmentTableBySource = new Map();
      }
      const enrichPreview = (preview, shipmentRow) => {
        const withFurniture = enrichPreviewFromFurniture(preview, {
          furnitureTemplates,
          resolveFurnitureTemplateForPreview: resolveFurnitureTemplateForPreviewByArticle,
          buildPreviewRowsFromFurnitureTemplate,
          normalizeFurnitureKey,
          furnitureLoading,
          furnitureError,
        });
        const withStrapProduct = enrichPreviewWithStrapProduct(withFurniture, shipmentRow, {
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
        const sourceKey = `${String(shipmentRow?.row || "").trim()}|${String(shipmentRow?.col || "").trim()}`;
        const sourceRowFromTable = shipmentTableBySource.get(sourceKey) || null;
        const articleFromTable = String(
          sourceRowFromTable?.product_article ||
            sourceRowFromTable?.productArticle ||
          sourceRowFromTable?.article_code ||
            sourceRowFromTable?.articleCode ||
            sourceRowFromTable?.article ||
            sourceRowFromTable?.mapped_article_code ||
            sourceRowFromTable?.mappedArticleCode ||
            "",
        ).trim();
        const explicitArticle = String(
          shipmentRow?.productArticle ||
            extractPlanItemArticle(shipmentRow?.sourceItem || shipmentRow?.item || "") ||
            articleFromTable ||
            extractPlanItemArticle(sourceRowFromTable?.item || "") ||
            "",
        ).trim();
        if (!explicitArticle) return withStrapProduct;
        if (getPlanPreviewArticleCode(withStrapProduct)) return withStrapProduct;
        return {
          ...withStrapProduct,
          article: explicitArticle,
        };
      };
      if (shipmentSelections.length === 0) {
        setPlanPreviews(strapPreviews);
        return;
      }
      if (shipmentSelections.length === 1) {
        const s = shipmentSelections[0];
        const preview = await OrderService.previewPlanFromShipment(s.row, s.col);
        const enriched = preview ? enrichPreview({ ...preview, _key: `${s.row}-${s.col}` }, s) : null;
        const plans = enriched ? [enriched] : [];
        plans.push(...strapPreviews);
        setPlanPreviews(plans);
      } else {
        const { plans = [], failedCount = 0, batchError } = await buildShipmentPreviewPlans(shipmentSelections, {
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
  }, [
    articleLookupByItemKey,
    furnitureError,
    furnitureLoading,
    furnitureTemplates,
    setActionLoading,
    setError,
    setPlanPreviews,
    strapProductBySizeToken,
    strapProductsByArticleCode,
    strapTargetProduct,
  ]);

  const exportSelectedShipmentToExcel = useCallback(() => {
    const current = selectedShipmentsRef.current;
    if (!current.length) return;
    const planNumberRaw = window.prompt("Введите номер плана для экспорта:", String(current[0]?.week || ""));
    if (planNumberRaw == null) return;
    const planNumber = String(planNumberRaw || "").trim();
    if (!planNumber) {
      setError("Укажите номер плана.");
      return;
    }

    const { rows, missingItems } = buildShipmentExportRows(current, {
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
  }, [articleLookupByItemKey, setError]);

  const importShipmentPlanFromExcelFile = useCallback(async (file) => {
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
        sectionArticleRows,
      });

      const articleMap = buildImportArticleMap(importCatalogRows);

      const { imported, missing, marked } = await applyImportPlanRows(importRows, articleMap, {
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
  }, [canOperateProduction, sectionArticleRows, setActionLoading, setError, load, importPlanFileRef, denyActionByRole]);

  const importMetalFromExcelFile = useCallback(async (file) => {
    if (!file) return;
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для импорта остатков металла.");
      return;
    }
    setActionLoading("metal:import");
    setError("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const firstSheet = String(wb?.SheetNames?.[0] || "");
      if (!firstSheet) throw new Error("В файле не найден лист.");
      const ws = wb.Sheets[firstSheet];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
      if (!rows.length) throw new Error("Файл пустой.");

      const importedRows = parseMetalImportRows(rows);
      if (!importedRows.length) {
        throw new Error(getMetalImportNoValidRowsError());
      }

      for (const row of importedRows) {
        await OrderService.setMetalStock(row.metalArticle, row.metalName, row.qtyAvailable);
      }

      await loadMetalStock();
      setError(`Импортировано позиций металла: ${importedRows.length}.`);
    } catch (e) {
      setError(formatMetalImportError(extractErrorMessage(e)));
    } finally {
      setActionLoading("");
      if (importMetalFileRef.current) importMetalFileRef.current.value = "";
    }
  }, [canOperateProduction, setActionLoading, setError, loadMetalStock, importMetalFileRef, denyActionByRole]);

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
    metalStockRows,
    metalSavingArticle, setMetalSavingArticle,
    selectedShipmentMetal,
    loadMetalStock,
    loadMetalQueue,
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
    handlePlanSectionChange,
    handlePlanArticleChange,
    openCreatePlanDialog,
    closeCreatePlanDialog,
    saveCreatePlanDialog,
    previewCreatePlanDialog,
    openStrapDialog,
    saveStrapDialog,

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