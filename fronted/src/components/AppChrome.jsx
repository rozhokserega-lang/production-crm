import { useEffect, useState } from "react";
import { AppHeader } from "./AppHeader";
import { DomainDrawer } from "./DomainDrawer";
import { ViewSwitcher } from "./ViewSwitcher";
import { ViewControls } from "./ViewControls";
import { MobileBottomBar } from "./MobileBottomBar";
import { MobileSearchFab } from "./MobileSearchFab";
import { BackToTopFab } from "./BackToTopFab";
import { PullToRefresh } from "./PullToRefresh";
import { AdminRolePreviewBar } from "./AdminRolePreviewBar";

// Свайп влево/вправо на телефоне переключает домен (Мебель→Металл→Склад→Мебель).
// Не срабатывает внутри горизонтально-скроллящихся контейнеров (таблиц, канбанов, табов).
const DOMAIN_ORDER = ["furniture", "metalProcess", "warehouseMissing"];
const DOMAIN_TARGET_VIEW = { furniture: "shipment", metalProcess: "metalProcess", warehouseMissing: "warehouseMissing" };

function useDomainSwipe(setView) {
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 600px)").matches) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onStart = (e) => {
      const t = e.touches ? e.touches[0] : e;
      const target = t.target;
      if (target && target.closest) {
        if (
          target.closest(".sheet-table-wrap, .overview-board, .metal-process-kanban, .tabs, .view-switch, .mobile-bottom-bar, .domain-switch, .mobile-search-bar, dialog, [data-no-swipe]")
        ) {
          tracking = false;
          return;
        }
      }
      tracking = true;
      startX = t.clientX;
      startY = t.clientY;
    };

    const onEnd = (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches ? e.changedTouches[0] : e;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      setView((prevView) => {
        const cur = DOMAIN_ORDER.find((d) =>
          d === "furniture" ? prevView !== "metalProcess" && prevView !== "warehouseMissing" : prevView === d,
        ) || "furniture";
        const idx = DOMAIN_ORDER.indexOf(cur);
        const nextIdx = dx < 0 ? (idx + 1) % DOMAIN_ORDER.length : (idx - 1 + DOMAIN_ORDER.length) % DOMAIN_ORDER.length;
        return DOMAIN_TARGET_VIEW[DOMAIN_ORDER[nextIdx]];
      });
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, [setView]);
}

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

  // Свайп между доменами на телефоне (только на <= 600px внутри хука).
  useDomainSwipe(shell.setView);

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
        supabaseProxyEnabled={auth.supabaseProxyEnabled}
        toggleSupabaseProxy={auth.toggleSupabaseProxy}
      />
      <button
        type="button"
        className="domain-drawer-mobile-trigger"
        onClick={() => setDomainDrawerOpen(true)}
        aria-label="Открыть панель режима работы: мебель, металл, склад"
        title="Режим работы"
        hidden={auth.isRestrictedWorkshopOperator}
      >
        <span className="domain-drawer-mobile-trigger__icon" aria-hidden>
          ☰
        </span>
        <span className="domain-drawer-mobile-trigger__text">Режим</span>
      </button>
      {!auth.isRestrictedWorkshopOperator && (
        <DomainDrawer
          open={domainDrawerOpen}
          setOpen={setDomainDrawerOpen}
          view={shell.view}
          setView={shell.setView}
        />
      )}

      {auth.canAdminSettings && auth.rolePreviewBarEnabled && (
        <AdminRolePreviewBar
          canAdminSettings={auth.canAdminSettings}
          crmRolePreview={auth.crmRolePreview}
          crmRolePreviewActive={auth.crmRolePreviewActive}
          setCrmRolePreview={auth.setCrmRolePreview}
          clearCrmRolePreview={auth.clearCrmRolePreview}
          actualCrmRoleLabel={auth.actualCrmRoleLabel}
        />
      )}

      {showMainTopPanels && (
        <ViewSwitcher
          view={shell.view}
          setView={shell.setView}
          setTab={shell.setTab}
          canAdminSettings={auth.canAdminSettings}
          canAccessView={auth.canAccessView}
          defaultWorkshopTab={auth.defaultWorkshopTabForRole}
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
          canAccessLaborSubView={auth.canAccessLaborSubView}
          query={shell.query}
          setQuery={shell.setQuery}
          setWorkshopQrScan={shell.setWorkshopQrScan}
          weekFilter={shipment.weekFilter}
          setWeekFilter={shipment.setWeekFilter}
          weeks={shipment.weeks}
          planMonths={shipment.planMonths}
          planMonthsLoading={shipment.planMonthsLoading}
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
          canAccessWorkshopTab={auth.canAccessWorkshopTab}
        />
      )}

      {!shell.isOnline && (
        <div className="network-banner" role="status">
          Нет подключения к интернету. Данные могут быть устаревшими.
        </div>
      )}
      {!auth.supabaseProxyEnabled && (
        <div className="network-banner" role="status">
          Прокси CRM выключен — сначала пробуем прямой Supabase. Если данные не грузятся, нажмите «Прокси: Выкл» в шапке, чтобы включить прокси.
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

      <MobileBottomBar
        view={shell.view}
        setView={shell.setView}
        setTab={shell.setTab}
        canAccessView={auth.canAccessView}
        defaultWorkshopTab={auth.defaultWorkshopTabForRole}
      />
      <MobileSearchFab view={shell.view} query={shell.query} setQuery={shell.setQuery} />
      <BackToTopFab />
      <PullToRefresh />
    </div>
  );
}
