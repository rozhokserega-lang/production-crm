import { useAppState } from "./hooks/useAppState";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "./components/AppHeader";
import { DomainDrawer } from "./components/DomainDrawer";
import { ViewSwitcher } from "./components/ViewSwitcher";
import { KpiGrid } from "./components/KpiGrid";
import { ViewControls } from "./components/ViewControls";
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
import { WarehouseMissingView } from "./views/WarehouseMissingView";
import { StrapStockView } from "./views/StrapStockView";
import { StatsView } from "./views/StatsView";
import { SheetMirrorView } from "./views/SheetMirrorView";
import { FurnitureView } from "./views/FurnitureView";
import { MetalView } from "./views/MetalView";
import { MetalProcessView } from "./views/MetalProcessView";
import {
  CRM_ROLES,
  CRM_ROLE_LABELS,
} from "./app/appConstants";
import {
  getOverallStatusDisplay,
  stageBg,
  stageLabel,
  statusClass,
} from "./app/statusHelpers";
import {
  getMaterialLabel,
} from "./app/orderHelpers";
import {
  buildPlanPreviewQrPayload,
  buildQrCodeUrl,
  resolvePlanPreviewArticleByName,
} from "./app/planPreviewHelpers";
import {
  formatDateTimeRu,
} from "./app/rowHelpers";
import {
  getStatsDeleteActionKey,
} from "./app/statsDeleteHelpers";
import {
  getReadableTextColor,
} from "./utils/colorUtils";
import {
  getShipmentStageKey,
} from "./utils/shipmentUtils";
import {
  normalizeFurnitureKey,
  furnitureProductLabel,
} from "./utils/furnitureUtils";
import {
  getOrderStageDisplayLabel as getStageLabel,
  isOrderCustomerShipped,
} from "./orderPipeline";
import {
  isDone,
  isInWork,
  resolveDefaultConsumeSheets,
  resolveDefaultConsumeSheetsFromBoard,
} from "./app/appUtils";


export default function App() {
  const [manualLaborOpenNonce, setManualLaborOpenNonce] = useState(0);
  const [domainDrawerOpen, setDomainDrawerOpen] = useState(false);
  const [productColorMapRows, setProductColorMapRows] = useState([]);
  const [packagingDialogOpen, setPackagingDialogOpen] = useState(false);
  const [packagingOrders, setPackagingOrders] = useState([]);
  const [packagingAcceptingId, setPackagingAcceptingId] = useState("");
  const [showPackagingOnly, setShowPackagingOnly] = useState(false);
  const [packagingLoading, setPackagingLoading] = useState(false);
  const openManualLaborDialog = () => setManualLaborOpenNonce((x) => x + 1);

  const {
    // View state
    view, setView,
    tab, setTab,
    overviewSubView, setOverviewSubView,
    warehouseSubView, setWarehouseSubView,
    laborSubView, setLaborSubView,
    statsSort, setStatsSort,
    orderDrawerId, setOrderDrawerId,
    actionLoading, setActionLoading: _setActionLoading,
    isOnline,
    error, setError,

    // Auth & roles
    authEnabled,
    authEmail, setAuthEmail,
    authPassword, setAuthPassword,
    authSaving,
    authUserLabel,
    signInWithSupabase,
    signOutSupabaseUser,
    crmRole,
    crmRoleLabel,
    crmAuthStrict,
    crmAuthStrictSaving,
    canOperateProduction,
    canOperateWarehouse,
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
    rows: _rows, setRows: _setRows,
    query, setQuery,
    loading, setLoading: _setLoading,

    // Shipment data
    shipmentBoard, setShipmentBoard: _setShipmentBoard,
    planCatalogRows: _planCatalogRows, setPlanCatalogRows: _setPlanCatalogRows,
    sectionCatalogRows: _sectionCatalogRows, setSectionCatalogRows: _setSectionCatalogRows,
    sectionArticleRows: _sectionArticleRows, setSectionArticleRows: _setSectionArticleRows,
    shipmentOrders, setShipmentOrders: _setShipmentOrders,
    materialsStockRows: _materialsStockRows, setMaterialsStockRows: _setMaterialsStockRows,
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
    consumeDialogOpen, setConsumeDialogOpen: _setConsumeDialogOpen,
    consumeEditMode, setConsumeEditMode,
    consumeDialogData, setConsumeDialogData: _setConsumeDialogData,
    consumeMaterial, setConsumeMaterial,
    consumeQty, setConsumeQty,
    consumeSaving, setConsumeSaving: _setConsumeSaving,
    consumeError, setConsumeError: _setConsumeError,
    consumeLoading, setConsumeLoading: _setConsumeLoading,
    strapDialogOpen, setStrapDialogOpen,
    strapTargetProduct, setStrapTargetProduct,
    strapPlanWeek, setStrapPlanWeek,
    strapDraft, setStrapDraft,
    strapItems, setStrapItems,
    planDialogOpen, setPlanDialogOpen: _setPlanDialogOpen,
    planSection, setPlanSection: _setPlanSection,
    planArticle, setPlanArticle: _setPlanArticle,
    planMaterial, setPlanMaterial: _setPlanMaterial,
    planWeek, setPlanWeek,
    planQty, setPlanQty,
    planSaving, setPlanSaving: _setPlanSaving,

    // Labor state
    laborSort, setLaborSort,
    laborPlannerQtyByGroup, setLaborPlannerQtyByGroup,
    laborRows: _laborRows, setLaborRows: _setLaborRows,
    laborImportedRows, setLaborImportedRows,
    laborSaveSelected, setLaborSaveSelected,
    laborSavingByKey, setLaborSavingByKey,
    laborSavedByKey, setLaborSavedByKey,

    // Warehouse data
    warehouseRows: _warehouseRows, setWarehouseRows: _setWarehouseRows,
    leftoversRows: _leftoversRows, setLeftoversRows: _setLeftoversRows,
    leftoversHistoryRows: _leftoversHistoryRows, setLeftoversHistoryRows: _setLeftoversHistoryRows,
    consumeHistoryRows: _consumeHistoryRows, setConsumeHistoryRows: _setConsumeHistoryRows,
    pilkaDoneHistoryRows: _pilkaDoneHistoryRows, setPilkaDoneHistoryRows: _setPilkaDoneHistoryRows,
    warehouseSyncLoading,
    leftoversSyncLoading,

    // Furniture data
    furnitureLoading, setFurnitureLoading: _setFurnitureLoading,
    furnitureError, setFurnitureError: _setFurnitureError,
    furnitureSheetData,
    furnitureSelectedProduct, setFurnitureSelectedProduct,
    furnitureTemplates,
    furnitureSelectedQty, setFurnitureSelectedQty,
    furnitureGeneratedDetails,
    furnitureSelectedTemplate,
    furnitureQtyNumber,
    furnitureArticleSearchRows,
    furnitureArticleGroups,
    furnitureCustomTemplates,

    // Refs
    importPlanFileRef,
    importMetalFileRef,

    // Derived data
    weeks,
    sectionOptions,
    sectionArticles,
    selectedItemVariants,
    articleLookupByItemKey,
    resolvedPlanItem: _resolvedPlanItem,
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
    metalSavingArticle,
    selectedShipmentMetal,
    adjustMetalStock,
    metalProcessRows,
    metalProcessCatalogRows,
    metalProcessLoading,
    metalProcessActionKey,
    metalProcessDraft,
    setMetalProcessDraft,
    createMetalProcessPlanItem,
    transitionMetalProcessStage,
    saveMetalProcessComment,
    deleteMetalProcessItem,
    upsertMetalCatalogItem,
    deleteMetalCatalogItem,
    metalProcessCatalogLoading,
    shipmentOrderMaps,
    runAction,
    isActionPending,
    denyActionByRole: _denyActionByRole,
    callBackend,
    filtered,
    orderDrawerLines,
    overviewShippedOnly,
    visibleCellsForItem,
    sortItemsForShipment,
    shipmentRenderSections,
    kpi, statsGroups: _statsGroups, statsList, overviewColumns, shipmentKpi,
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
    openPilkaDoneConsumeDialogOnError: _openPilkaDoneConsumeDialogOnError,
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

    // Labor actions
    importLaborFileRef,
    exportLaborTotalToExcel,
    importLaborTotalFromExcelFile,
    saveImportedLaborRowToDb,

    // Edge sync
    syncWarehouseFromGoogleSheet,
    syncLeftoversToGoogleSheet,
    logConsumeToGoogleSheet: _logConsumeToGoogleSheet,
    syncPlanCellToGoogleSheet: _syncPlanCellToGoogleSheet,

    // Executors
    executorByOrder, setExecutorByOrder,
    executorOptions,
  } = useAppState();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const body = document.body;
    const clsMetal = "domain-metal-process";
    const clsFurniture = "domain-furniture";
    html.classList.remove(clsMetal, clsFurniture);
    body.classList.remove(clsMetal, clsFurniture);
    const cls = view === "metalProcess" ? clsMetal : clsFurniture;
    html.classList.add(cls);
    body.classList.add(cls);
    return () => {
      html.classList.remove(clsMetal, clsFurniture);
      body.classList.remove(clsMetal, clsFurniture);
    };
  }, [view]);

  useEffect(() => {
    if (view !== "warehouse") return;
    if (!["sheets", "leftovers", "history"].includes(warehouseSubView)) {
      setWarehouseSubView("sheets");
    }
  }, [view, warehouseSubView, setWarehouseSubView]);

  useEffect(() => {
    if (view !== "warehouseMissing") return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await callBackend("webGetProductColorMap");
        if (cancelled) return;
        setProductColorMapRows(Array.isArray(rows) ? rows : []);
      } catch (_) {
        if (cancelled) return;
        setProductColorMapRows([]);
      }
    })();
    return () => { cancelled = true; };
  }, [view, callBackend]);

  const refreshPackagingOrders = useCallback(async () => {
    try {
      const rows = await callBackend("webGetReplacementOrders");
      const inbox = (Array.isArray(rows) ? rows : []).filter(
        (x) => x?.sent_to_work === true && x?.packaging_accepted !== true,
      );
      setPackagingOrders(inbox);
    } catch (_) {}
  }, [callBackend]);

  useEffect(() => {
    refreshPackagingOrders();
    const timer = window.setInterval(refreshPackagingOrders, 30000);
    return () => window.clearInterval(timer);
  }, [refreshPackagingOrders]);

  async function acceptPackagingOrder(orderId) {
    const order = packagingOrders.find((x) => x?.id === orderId);
    if (!order) return;
    setPackagingAcceptingId(orderId);
    try {
      const itemLabel = String(order.product || "").trim() === "Прочее"
        ? String(order.part || "").trim()
        : `${String(order.product || "").trim()} — ${String(order.part || "").trim()}`;
      await callBackend("webCreateShipmentPlanCell", {
        sectionName: "Упаковка",
        item: itemLabel,
        material: String(order.color || "").trim() === "—" ? "" : String(order.color || "").trim(),
        week: "X",
        qty: Number(order.qty || 1) || 1,
      });
      await callBackend("webAcceptReplacementOrderPackaging", { p_id: orderId });
      await Promise.all([refreshPackagingOrders(), load()]);
    } catch (e) {
      setError(String(e?.message || e || "Не удалось принять заказ в упаковку"));
    } finally {
      setPackagingAcceptingId("");
    }
  }

  const showMainTopPanels = view !== "metalProcess" && view !== "warehouseMissing";
  const shipmentTableRowsForView = useMemo(
    () =>
      showPackagingOnly
        ? shipmentTableRowsWithStockStatus.filter((row) => String(row.section || "").trim().toLowerCase() === "упаковка")
        : shipmentTableRowsWithStockStatus,
    [shipmentTableRowsWithStockStatus, showPackagingOnly],
  );
  const shipmentRenderSectionsForView = useMemo(
    () =>
      showPackagingOnly
        ? shipmentRenderSections.filter((s) => String(s?.name || "").trim().toLowerCase() === "упаковка")
        : shipmentRenderSections,
    [shipmentRenderSections, showPackagingOnly],
  );
  const shipmentTableGroupNamesForView = useMemo(
    () =>
      showPackagingOnly
        ? shipmentTableGroupNames.filter((name) => String(name || "").trim().toLowerCase() === "упаковка")
        : shipmentTableGroupNames,
    [shipmentTableGroupNames, showPackagingOnly],
  );

  return (
    <div className="page">
      <AppHeader
        authEnabled={authEnabled}
        authUserLabel={authUserLabel}
        authEmail={authEmail}
        setAuthEmail={setAuthEmail}
        authPassword={authPassword}
        setAuthPassword={setAuthPassword}
        authSaving={authSaving}
        signInWithSupabase={signInWithSupabase}
        signOutSupabaseUser={signOutSupabaseUser}
        crmRole={crmRole}
        crmRoleLabel={crmRoleLabel}
        canAdminSettings={canAdminSettings}
        crmAuthStrict={crmAuthStrict}
        toggleCrmAuthStrict={toggleCrmAuthStrict}
        crmAuthStrictSaving={crmAuthStrictSaving}
      />
      <DomainDrawer open={domainDrawerOpen} setOpen={setDomainDrawerOpen} view={view} setView={setView} />

      {showMainTopPanels && (
        <ViewSwitcher
          view={view}
          setView={setView}
          setTab={setTab}
          canAdminSettings={canAdminSettings}
        />
      )}

      {showMainTopPanels && (
        <KpiGrid
          view={view}
          shipmentKpi={shipmentKpi}
          overviewSubView={overviewSubView}
          overviewShippedOnly={overviewShippedOnly}
          filtered={filtered}
          statusClass={statusClass}
          laborKpi={laborKpi}
          kpi={kpi}
        />
      )}

      {showMainTopPanels && (
        <ViewControls
          view={view}
          overviewSubView={overviewSubView}
          setOverviewSubView={setOverviewSubView}
          tab={tab}
          setTab={setTab}
          warehouseSubView={warehouseSubView}
          setWarehouseSubView={setWarehouseSubView}
          laborSubView={laborSubView}
          setLaborSubView={setLaborSubView}
          query={query}
          setQuery={setQuery}
          weekFilter={weekFilter}
          setWeekFilter={setWeekFilter}
          weeks={weeks}
          statsSort={statsSort}
          setStatsSort={setStatsSort}
          shipmentSort={shipmentSort}
          setShipmentSort={setShipmentSort}
          shipmentViewMode={shipmentViewMode}
          setShipmentViewMode={setShipmentViewMode}
          laborSort={laborSort}
          setLaborSort={setLaborSort}
          showAwaiting={showAwaiting}
          setShowAwaiting={setShowAwaiting}
          showOnPilka={showOnPilka}
          setShowOnPilka={setShowOnPilka}
          showOnKromka={showOnKromka}
          setShowOnKromka={setShowOnKromka}
          showOnPras={showOnPras}
          setShowOnPras={setShowOnPras}
          showReadyAssembly={showReadyAssembly}
          setShowReadyAssembly={setShowReadyAssembly}
          showAwaitShipment={showAwaitShipment}
          setShowAwaitShipment={setShowAwaitShipment}
          showShipped={showShipped}
          setShowShipped={setShowShipped}
          canOperateProduction={canOperateProduction}
          openStrapDialog={openStrapDialog}
          openCreatePlanDialog={openCreatePlanDialog}
          selectedShipments={selectedShipments}
          exportSelectedShipmentToExcel={exportSelectedShipmentToExcel}
          importPlanFileRef={importPlanFileRef}
          actionLoading={actionLoading}
          importShipmentPlanFromExcelFile={importShipmentPlanFromExcelFile}
          warehouseSyncLoading={warehouseSyncLoading}
          loading={loading}
          syncWarehouseFromGoogleSheet={syncWarehouseFromGoogleSheet}
          leftoversSyncLoading={leftoversSyncLoading}
          syncLeftoversToGoogleSheet={syncLeftoversToGoogleSheet}
          warehouseOrderPlanRows={warehouseOrderPlanRows}
          printWarehouseOrderPlanPdf={printWarehouseOrderPlanPdf}
          exportLaborTotalToExcel={exportLaborTotalToExcel}
          laborTableRows={laborTableRows}
          importLaborFileRef={importLaborFileRef}
          importLaborTotalFromExcelFile={importLaborTotalFromExcelFile}
          laborImportedRows={laborImportedRows}
          setLaborImportedRows={setLaborImportedRows}
          setLaborSaveSelected={setLaborSaveSelected}
          setLaborSavingByKey={setLaborSavingByKey}
          setLaborSavedByKey={setLaborSavedByKey}
          importMetalFileRef={importMetalFileRef}
          importMetalFromExcelFile={importMetalFromExcelFile}
          canAdminSettings={canAdminSettings}
          openManualLaborDialog={openManualLaborDialog}
          packagingInboxCount={packagingOrders.length}
          openPackagingDialog={() => setPackagingDialogOpen(true)}
          showPackagingOnly={showPackagingOnly}
          setShowPackagingOnly={setShowPackagingOnly}
          canOperateWarehouse={canOperateWarehouse}
        />
      )}

      {!isOnline && (
        <div className="network-banner" role="status">
          Нет подключения к интернету. Данные могут быть устаревшими.
        </div>
      )}
      {String(error || "").trim() && String(error || "").trim().toLowerCase() !== "null" && (
        <div className="error">{error}</div>
      )}

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
            shipmentTableGroupNames={shipmentTableGroupNamesForView}
            hiddenShipmentGroups={hiddenShipmentGroups}
            setHiddenShipmentGroups={setHiddenShipmentGroups}
            shipmentTableRowsWithStockStatus={shipmentTableRowsForView}
            getReadableTextColor={getReadableTextColor}
            getMaterialLabel={getMaterialLabel}
            toggleShipmentSelection={toggleShipmentSelection}
            shipmentRenderSections={shipmentRenderSectionsForView}
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
            setError={setError}
            loading={loading}
            canAdminSettings={canAdminSettings}
            load={load}
            manualLaborOpenNonce={manualLaborOpenNonce}
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
            canOperateWarehouse={canOperateWarehouse}
            onManualConsume={openPilkaDoneConsumeDialog}
            onSendMissingToWork={async ({ name, qty }) => {
              await callBackend("webSendPlanksToWork", { items: [{ name, qty }] });
            }}
          />
        )}
        {view === "warehouseMissing" && (
          <WarehouseMissingView
            callBackend={callBackend}
            furnitureTemplates={furnitureTemplates}
            furnitureArticleGroups={furnitureArticleGroups}
            productColorMapRows={productColorMapRows}
            sectionArticleRows={_sectionArticleRows}
            materialsStockRows={_materialsStockRows}
            formatProductName={furnitureProductLabel}
          />
        )}
        {view === "strapStock" && (
          <StrapStockView callBackend={callBackend} />
        )}
        {view === "metal" && (
          <MetalView
            rows={metalStockRows.filter((row) => {
              const q = String(query || "").trim().toLowerCase();
              if (!q) return true;
              return (
                String(row.metal_article || "").toLowerCase().includes(q) ||
                String(row.metal_name || "").toLowerCase().includes(q)
              );
            })}
            loading={loading}
            canOperateProduction={canOperateProduction}
            savingKey={metalSavingArticle}
            onAdjustStock={adjustMetalStock}
          />
        )}
        {view === "metalProcess" && (
          <MetalProcessView
            loading={metalProcessLoading}
            catalogLoading={metalProcessCatalogLoading}
            canOperateProduction={canOperateProduction}
            canManageOrders={canManageOrders}
            metalProcessRows={metalProcessRows}
            metalProcessCatalogRows={metalProcessCatalogRows}
            metalProcessDraft={metalProcessDraft}
            setMetalProcessDraft={setMetalProcessDraft}
            createMetalProcessPlanItem={createMetalProcessPlanItem}
            transitionMetalProcessStage={transitionMetalProcessStage}
            saveMetalProcessComment={saveMetalProcessComment}
            deleteMetalProcessItem={deleteMetalProcessItem}
            upsertMetalCatalogItem={upsertMetalCatalogItem}
            deleteMetalCatalogItem={deleteMetalCatalogItem}
            metalProcessActionKey={metalProcessActionKey}
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
            canOperateProduction={canOperateProduction}
            createShelfPlanOrder={createShelfPlanOrder}
            createFurniturePlanOrder={createFurniturePlanOrder}
            furnitureArticleSearchRows={furnitureArticleSearchRows}
            furnitureCustomTemplates={furnitureCustomTemplates}
            sectionCatalogRows={_sectionCatalogRows}
            callBackend={callBackend}
            load={load}
            refreshPlanCatalogs={refreshPlanCatalogs}
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
            consumeLogSheetName={consumeLogSheetName}
            consumeLogSheetUpdatedAt={consumeLogSheetUpdatedAt}
            consumeLogSheetLoading={consumeLogSheetLoading}
            consumeLogSheetSaving={consumeLogSheetSaving}
            loadConsumeLogSheetSetting={loadConsumeLogSheetSetting}
            saveConsumeLogSheetSetting={saveConsumeLogSheetSetting}
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
            furnitureCustomTemplates={furnitureCustomTemplates}
            normalizeFurnitureKey={normalizeFurnitureKey}
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
      {packagingDialogOpen && (
        <div className="dialog-backdrop">
          <div className="dialog-card" style={{ maxWidth: 760, width: "95vw", maxHeight: "85vh", overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Упаковка — входящие заказы ({packagingOrders.length})</h3>
              <button type="button" className="mini" onClick={() => setPackagingDialogOpen(false)}>Закрыть</button>
            </div>
            {packagingOrders.length === 0 ? (
              <div className="empty">Новых заказов в упаковку нет.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {packagingOrders.map((o) => (
                  <article key={o.id} className="card" style={{ padding: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <strong>{o.product} — {o.part}</strong>
                      <span>{o.qty} шт.</span>
                    </div>
                    <div style={{ marginTop: 6, color: "#64748b", fontSize: 13 }}>
                      Материал: {o.color || "—"}
                      {o.note ? ` | Примечание: ${o.note}` : ""}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className="mini ok"
                        disabled={packagingAcceptingId === o.id}
                        onClick={() => acceptPackagingOrder(o.id)}
                      >
                        {packagingAcceptingId === o.id ? "Принимаю..." : "Принять в работу"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {strapDoneDialogOpen && strapDoneDialogMeta && (
        <div className="dialog-backdrop">
          <div className="dialog-card" style={{ maxWidth: 420, width: "95vw" }}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>
              Присадка завершена — обвязка
            </h3>
            <p style={{ margin: "0 0 4px", color: "#475569" }}>
              Тип: <strong>{strapDoneDialogMeta.item || "—"}</strong>
              {strapDoneDialogMeta.material ? ` / ${strapDoneDialogMeta.material}` : ""}
            </p>
            <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: 13 }}>
              Укажите количество планок обвязки, которые были присажены. Они будут зачислены на склад.
            </p>
            <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
              Количество планок:
              <input
                type="number"
                min={1}
                className="strap-qty-dialog-input"
                style={{ display: "block", width: "100%", marginTop: 6, padding: "6px 10px", fontSize: 16, borderRadius: 6, border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                value={strapDoneQtyInput}
                onChange={(e) => setStrapDoneQtyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    submitStrapDone(
                      String(strapDoneDialogMeta.item || ""),
                      String(strapDoneDialogMeta.material || ""),
                      strapDoneQtyInput
                    );
                  }
                  if (e.key === "Escape") closeStrapDoneDialog();
                }}
                autoFocus
              />
            </label>
            {strapDoneError && (
              <div style={{ color: "#ef4444", marginBottom: 10, fontSize: 13 }}>{strapDoneError}</div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button
                type="button"
                className="mini ghost"
                onClick={closeStrapDoneDialog}
                disabled={strapDoneSaving}
              >
                Пропустить
              </button>
              <button
                type="button"
                className="mini ok"
                disabled={strapDoneSaving || !strapDoneQtyInput}
                onClick={() =>
                  submitStrapDone(
                    String(strapDoneDialogMeta.item || ""),
                    String(strapDoneDialogMeta.material || ""),
                    strapDoneQtyInput
                  )
                }
              >
                {strapDoneSaving ? "Сохраняю..." : "Зачислить на склад"}
              </button>
            </div>
          </div>
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
        canAdminStageOverride={canAdminSettings}
        onAdminStageOverride={overrideOrderStageFromDrawer}
        workSchedule={workSchedule}
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
        selectedItemVariants={selectedItemVariants}
        planMaterial={planMaterial}
        planWeek={planWeek}
        planQty={planQty}
        planSaving={planSaving}
        planPreviewing={false}
        onSectionChange={handlePlanSectionChange}
        onArticleChange={handlePlanArticleChange}
        onMaterialChange={_setPlanMaterial}
        onPlanWeekChange={(value) => setPlanWeek(value.replace(/[^\d-]/g, ""))}
        onPlanQtyChange={(value) => setPlanQty(value.replace(/[^0-9.,]/g, ""))}
        onSave={saveCreatePlanDialog}
        onPreview={previewCreatePlanDialog}
        onClose={closeCreatePlanDialog}
        refreshPlanCatalogs={refreshPlanCatalogs}
      />
    </div>
  );
}
