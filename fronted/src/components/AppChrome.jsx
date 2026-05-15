import { useState } from "react";
import { AppHeader } from "./AppHeader";
import { DomainDrawer } from "./DomainDrawer";
import { ViewSwitcher } from "./ViewSwitcher";
import { ViewControls } from "./ViewControls";
import { MobileBottomBar } from "./MobileBottomBar";

export function AppChrome({
  shell,
  auth,
  shipment,
  warehouse,
  labor,
  metal,
  packaging,
  actions,
  children,
}) {
  const [domainDrawerOpen, setDomainDrawerOpen] = useState(false);
  const showMainTopPanels =
    shell.view !== "metalProcess" && shell.view !== "warehouseMissing";

  return (
    <div className="page">
      <AppHeader
        authEnabled={auth.authEnabled}
        authUserLabel={auth.authUserLabel}
        authEmail={auth.authEmail}
        setAuthEmail={auth.setAuthEmail}
        authPassword={auth.authPassword}
        setAuthPassword={auth.setAuthPassword}
        authSaving={auth.authSaving}
        signInWithSupabase={auth.signInWithSupabase}
        signOutSupabaseUser={auth.signOutSupabaseUser}
        crmRole={auth.crmRole}
        crmRoleLabel={auth.crmRoleLabel}
        canAdminSettings={auth.canAdminSettings}
        crmAuthStrict={auth.crmAuthStrict}
        toggleCrmAuthStrict={auth.toggleCrmAuthStrict}
        crmAuthStrictSaving={auth.crmAuthStrictSaving}
      />
      <button
        type="button"
        className="domain-drawer-mobile-trigger"
        onClick={() => setDomainDrawerOpen(true)}
        aria-label="Открыть панель режима работы: мебель, металл, склад"
        title="Режим работы"
      >
        <span className="domain-drawer-mobile-trigger__icon" aria-hidden>
          ☰
        </span>
        <span className="domain-drawer-mobile-trigger__text">Режим</span>
      </button>
      <DomainDrawer
        open={domainDrawerOpen}
        setOpen={setDomainDrawerOpen}
        view={shell.view}
        setView={shell.setView}
      />

      {showMainTopPanels && (
        <ViewSwitcher
          view={shell.view}
          setView={shell.setView}
          setTab={shell.setTab}
          canAdminSettings={auth.canAdminSettings}
        />
      )}

      {showMainTopPanels && (
        <ViewControls
          view={shell.view}
          overviewSubView={shell.overviewSubView}
          setOverviewSubView={shell.setOverviewSubView}
          tab={shell.tab}
          setTab={shell.setTab}
          warehouseSubView={shell.warehouseSubView}
          setWarehouseSubView={shell.setWarehouseSubView}
          laborSubView={shell.laborSubView}
          setLaborSubView={shell.setLaborSubView}
          query={shell.query}
          setQuery={shell.setQuery}
          weekFilter={shipment.weekFilter}
          setWeekFilter={shipment.setWeekFilter}
          weeks={shipment.weeks}
          statsSort={shell.statsSort}
          setStatsSort={shell.setStatsSort}
          shipmentSort={shipment.shipmentSort}
          setShipmentSort={shipment.setShipmentSort}
          shipmentViewMode={shipment.shipmentViewMode}
          setShipmentViewMode={shipment.setShipmentViewMode}
          laborSort={labor.laborSort}
          setLaborSort={labor.setLaborSort}
          showAwaiting={shipment.showAwaiting}
          setShowAwaiting={shipment.setShowAwaiting}
          showOnPilka={shipment.showOnPilka}
          setShowOnPilka={shipment.setShowOnPilka}
          showOnKromka={shipment.showOnKromka}
          setShowOnKromka={shipment.setShowOnKromka}
          showOnPras={shipment.showOnPras}
          setShowOnPras={shipment.setShowOnPras}
          showReadyAssembly={shipment.showReadyAssembly}
          setShowReadyAssembly={shipment.setShowReadyAssembly}
          showAwaitShipment={shipment.showAwaitShipment}
          setShowAwaitShipment={shipment.setShowAwaitShipment}
          showShipped={shipment.showShipped}
          setShowShipped={shipment.setShowShipped}
          canOperateProduction={auth.canOperateProduction}
          openStrapDialog={actions.openStrapDialog}
          openCreatePlanDialog={actions.openCreatePlanDialog}
          selectedShipments={shipment.selectedShipments}
          exportSelectedShipmentToExcel={actions.exportSelectedShipmentToExcel}
          importPlanFileRef={shipment.importPlanFileRef}
          actionLoading={shell.actionLoading}
          importShipmentPlanFromExcelFile={actions.importShipmentPlanFromExcelFile}
          warehouseSyncLoading={warehouse.warehouseSyncLoading}
          syncWarehouseFromGoogleSheet={warehouse.syncWarehouseFromGoogleSheet}
          leftoversSyncLoading={warehouse.leftoversSyncLoading}
          syncLeftoversToGoogleSheet={warehouse.syncLeftoversToGoogleSheet}
          warehouseOrderPlanRows={shipment.warehouseOrderPlanRows}
          printWarehouseOrderPlanPdf={actions.printWarehouseOrderPlanPdf}
          exportLaborTotalToExcel={labor.exportLaborTotalToExcel}
          laborTableRows={labor.laborTableRows}
          importLaborFileRef={labor.importLaborFileRef}
          importLaborTotalFromExcelFile={actions.importLaborTotalFromExcelFile}
          laborImportedRows={labor.laborImportedRows}
          setLaborImportedRows={labor.setLaborImportedRows}
          setLaborSaveSelected={labor.setLaborSaveSelected}
          setLaborSavingByKey={labor.setLaborSavingByKey}
          setLaborSavedByKey={labor.setLaborSavedByKey}
          importMetalFileRef={metal.importMetalFileRef}
          importMetalFromExcelFile={actions.importMetalFromExcelFile}
          canAdminSettings={auth.canAdminSettings}
          openManualLaborDialog={actions.openManualLaborDialog}
          packagingInboxCount={packaging.packagingInboxCount}
          openPackagingDialog={packaging.openPackagingDialog}
          showPackagingOnly={packaging.showPackagingOnly}
          setShowPackagingOnly={packaging.setShowPackagingOnly}
          canOperateWarehouse={auth.canOperateWarehouse}
        />
      )}

      {!shell.isOnline && (
        <div className="network-banner" role="status">
          Нет подключения к интернету. Данные могут быть устаревшими.
        </div>
      )}
      {String(shell.error || "").trim() && String(shell.error || "").trim().toLowerCase() !== "null" && (
        <div className="error">{shell.error}</div>
      )}

      {children}

      {shipment.hoverTip.visible && (
        <div
          className="hover-tip"
          style={{ left: `${shipment.hoverTip.x}px`, top: `${shipment.hoverTip.y}px` }}
        >
          {shipment.hoverTip.text}
        </div>
      )}

      <MobileBottomBar view={shell.view} setView={shell.setView} setTab={shell.setTab} />
    </div>
  );
}
