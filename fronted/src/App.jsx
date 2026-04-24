import { useAppState } from "./hooks/useAppState";
import { AppHeader } from "./components/AppHeader";
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
import { StatsView } from "./views/StatsView";
import { SheetMirrorView } from "./views/SheetMirrorView";
import { FurnitureView } from "./views/FurnitureView";
import { MetalView } from "./views/MetalView";
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
  getPlanPreviewArticleCode,
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
  getStageClassByLabel,
  isDone,
  isInWork,
  resolveDefaultConsumeSheets,
  resolveDefaultConsumeSheetsFromBoard,
} from "./app/appUtils";

export default function App() {
  const {
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
    furnitureSheetData,
    furnitureSelectedProduct, setFurnitureSelectedProduct,
    furnitureTemplates,
    furnitureSelectedQty, setFurnitureSelectedQty,
    furnitureGeneratedDetails,
    furnitureSelectedTemplate,
    furnitureQtyNumber,

    // Refs
    importPlanFileRef,
    importMetalFileRef,

    // Derived data
    weeks,
    sectionOptions,
    sectionArticles,
    articleLookupByItemKey,
    resolvedPlanItem,
    strapProductNames,
    strapOptionsForSelectedProduct,
    workScheduleLoading,
    workScheduleSaving,
    workSchedule,
    setWorkSchedule,
    loadWorkSchedule,
    saveWorkSchedule,
    metalStockRows,
    metalSavingArticle,
    selectedShipmentMetal,
    adjustMetalStock,
    shipmentOrderMaps,
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
  } = useAppState();

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

      <ViewSwitcher
        view={view}
        setView={setView}
        setTab={setTab}
        canAdminSettings={canAdminSettings}
      />

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
        resetShipmentFilters={resetShipmentFilters}
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
      />

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
            callBackend={callBackend}
            setError={setError}
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
            canOperateProduction={canOperateProduction}
            onManualConsume={openPilkaDoneConsumeDialog}
          />
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
        planMaterial={planMaterial}
        planWeek={planWeek}
        planQty={planQty}
        planSaving={planSaving}
        planPreviewing={false}
        onSectionChange={handlePlanSectionChange}
        onArticleChange={handlePlanArticleChange}
        onPlanWeekChange={(value) => setPlanWeek(value.replace(/[^\d-]/g, ""))}
        onPlanQtyChange={(value) => setPlanQty(value.replace(/[^0-9.,]/g, ""))}
        onSave={saveCreatePlanDialog}
        onPreview={previewCreatePlanDialog}
        onClose={closeCreatePlanDialog}
      />
    </div>
  );
}
