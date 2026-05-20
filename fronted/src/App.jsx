import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "./hooks/useAppState";
import { useAppShellEffects } from "./hooks/useAppShellEffects";
import { usePackagingInbox } from "./hooks/usePackagingInbox";
import { preloadCriticalViews } from "./app/preloadViews";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { useNavigation } from "./contexts/NavigationContext";
import { useUiState } from "./contexts/UiStateContext";
import { ShipmentProvider } from "./contexts/ShipmentContext";
import { AppChrome } from "./components/AppChrome";
import { AppDialogs } from "./components/AppDialogs";

const AdminView = lazy(() => import("./views/AdminView").then((m) => ({ default: m.AdminView })));
const DatabaseCatalogView = lazy(() => import("./views/DatabaseCatalogView").then((m) => ({ default: m.DatabaseCatalogView })));
const WorkshopView = lazy(() => import("./views/WorkshopView").then((m) => ({ default: m.WorkshopView })));
const ShipmentView = lazy(() => import("./views/ShipmentView").then((m) => ({ default: m.ShipmentView })));
const OverviewView = lazy(() => import("./views/OverviewView").then((m) => ({ default: m.OverviewView })));
const LaborView = lazy(() => import("./views/LaborView").then((m) => ({ default: m.LaborView })));
const WarehouseView = lazy(() => import("./views/WarehouseView").then((m) => ({ default: m.WarehouseView })));
const WarehouseMissingView = lazy(() => import("./views/WarehouseMissingView").then((m) => ({ default: m.WarehouseMissingView })));
const StrapStockView = lazy(() => import("./views/StrapStockView").then((m) => ({ default: m.StrapStockView })));
const StatsView = lazy(() => import("./views/StatsView").then((m) => ({ default: m.StatsView })));
const SheetMirrorView = lazy(() => import("./views/SheetMirrorView").then((m) => ({ default: m.SheetMirrorView })));
const FurnitureView = lazy(() => import("./views/FurnitureView").then((m) => ({ default: m.FurnitureView })));
const MetalView = lazy(() => import("./views/MetalView").then((m) => ({ default: m.MetalView })));
const MetalProcessView = lazy(() => import("./views/MetalProcessView").then((m) => ({ default: m.MetalProcessView })));
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
  formatDateTimeRu,
} from "./app/rowHelpers";
import {
  getStatsDeleteActionKey,
} from "./app/statsDeleteHelpers";
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


function AppInner({ onAuthChangeRef }) {
  const [manualLaborOpenNonce, setManualLaborOpenNonce] = useState(0);
  const openManualLaborDialog = () => setManualLaborOpenNonce((x) => x + 1);

  const auth = useAuth();
  const {
    shell,
    admin,
    shipment,
    workshop,
    warehouse,
    labor,
    furniture,
    metal,
    dialogs,
    actions,
    services,
  } = useAppState({ auth });

  useEffect(() => {
    preloadCriticalViews();
  }, []);

  useEffect(() => {
    if (onAuthChangeRef) onAuthChangeRef.current = shell.mutationLoad;
  }, [shell.mutationLoad, onAuthChangeRef]);

  useAppShellEffects({
    view: shell.view,
    warehouseSubView: shell.warehouseSubView,
    setWarehouseSubView: shell.setWarehouseSubView,
  });

  const packaging = usePackagingInbox({
    callBackend: services.callBackend,
    mutationLoad: shell.mutationLoad,
    setError: shell.setError,
  });

  const shipmentTableRowsForView = useMemo(
    () =>
      packaging.showPackagingOnly
        ? shipment.shipmentTableRowsWithStockStatus.filter((row) => String(row.section || "").trim().toLowerCase() === "упаковка")
        : shipment.shipmentTableRowsWithStockStatus,
    [shipment.shipmentTableRowsWithStockStatus, packaging.showPackagingOnly],
  );
  const shipmentRenderSectionsForView = useMemo(
    () =>
      packaging.showPackagingOnly
        ? shipment.shipmentRenderSections.filter((section) => String(section?.name || "").trim().toLowerCase() === "упаковка")
        : shipment.shipmentRenderSections,
    [shipment.shipmentRenderSections, packaging.showPackagingOnly],
  );
  const shipmentTableGroupNamesForView = useMemo(
    () =>
      packaging.showPackagingOnly
        ? shipment.shipmentTableGroupNames.filter((name) => String(name || "").trim().toLowerCase() === "упаковка")
        : shipment.shipmentTableGroupNames,
    [shipment.shipmentTableGroupNames, packaging.showPackagingOnly],
  );

  const currentView = (() => {
    switch (shell.view) {
      case "shipment":
        return <ShipmentView />;
      case "overview":
        return (
          <OverviewView
            overviewSubView={shell.overviewSubView}
            filtered={shipment.filtered}
            loading={shell.loading}
            overviewColumns={shell.overviewColumns}
            getStageLabel={getStageLabel}
            overviewShippedOnly={shell.overviewShippedOnly}
            formatDateTimeRu={formatDateTimeRu}
            onOpenOrderDrawer={shell.setOrderDrawerId}
          />
        );
      case "labor":
        return (
          <LaborView
            labor={{
              ...labor,
              laborSubView: shell.laborSubView,
              manualLaborOpenNonce,
            }}
            permissions={{ canAdminSettings: auth.canAdminSettings }}
            shell={{
              setError: shell.setError,
              loading: shell.loading,
              load: shell.mutationLoad,
            }}
          />
        );
      case "warehouse":
        return (
          <WarehouseView
            warehouseSubView={shell.warehouseSubView}
            warehouseTableRows={warehouse.warehouseTableRows}
            leftoversTableRows={warehouse.leftoversTableRows}
            consumeHistoryTableRows={warehouse.consumeHistoryTableRows}
            warehouseOrderPlanRows={shipment.warehouseOrderPlanRows}
            loading={shell.loading}
            canOperateWarehouse={auth.canOperateWarehouse}
            onManualConsume={actions.openPilkaDoneConsumeDialog}
            onSendMissingToWork={async ({ name, qty }) => {
              await services.callBackend("webSendPlanksToWork", { items: [{ name, qty }] });
            }}
          />
        );
      case "warehouseMissing":
        return (
          <WarehouseMissingView
            callBackend={services.callBackend}
            furnitureTemplates={furniture.furnitureTemplates}
            furnitureArticleGroups={furniture.furnitureArticleGroups}
            sectionArticleRows={shipment.sectionArticleRows}
            materialsStockRows={shipment.materialsStockRows}
            formatProductName={furnitureProductLabel}
          />
        );
      case "strapStock":
        return (
          <StrapStockView
            callBackend={services.callBackend}
            workshopRows={workshop.workshopRows}
            furnitureTemplates={furniture.furnitureTemplates}
            furnitureCustomTemplates={furniture.furnitureCustomTemplates}
            furnitureDetailArticleRows={furniture.furnitureDetailArticleRows}
            normalizeFurnitureKey={normalizeFurnitureKey}
          />
        );
      case "metal":
        return (
          <MetalView
            rows={metal.metalStockRows.filter((row) => {
              const q = String(shell.query || "").trim().toLowerCase();
              if (!q) return true;
              return (
                String(row.metal_article || "").toLowerCase().includes(q) ||
                String(row.metal_name || "").toLowerCase().includes(q)
              );
            })}
            loading={shell.loading}
            canOperateProduction={auth.canOperateProduction}
            savingKey={metal.metalSavingArticle}
            onAdjustStock={metal.adjustMetalStock}
          />
        );
      case "metalProcess":
        return (
          <MetalProcessView
            loading={metal.metalProcessLoading}
            catalogLoading={metal.metalProcessCatalogLoading}
            canOperateProduction={auth.canOperateProduction}
            canManageOrders={auth.canManageOrders}
            metalProcessRows={metal.metalProcessRows}
            metalProcessCatalogRows={metal.metalProcessCatalogRows}
            metalProcessDraft={metal.metalProcessDraft}
            setMetalProcessDraft={metal.setMetalProcessDraft}
            createMetalProcessPlanItem={metal.createMetalProcessPlanItem}
            transitionMetalProcessStage={metal.transitionMetalProcessStage}
            saveMetalProcessComment={metal.saveMetalProcessComment}
            deleteMetalProcessItem={metal.deleteMetalProcessItem}
            upsertMetalCatalogItem={metal.upsertMetalCatalogItem}
            deleteMetalCatalogItem={metal.deleteMetalCatalogItem}
            metalProcessActionKey={metal.metalProcessActionKey}
          />
        );
      case "stats":
        return (
          <StatsView
            statsList={shell.statsList}
            loading={shell.loading}
            getStageLabel={getStageLabel}
            getOverallStatusDisplay={getOverallStatusDisplay}
            actionLoading={shell.actionLoading}
            getStatsDeleteActionKey={getStatsDeleteActionKey}
            canManageOrders={auth.canManageOrders}
            deleteStatsOrder={actions.deleteStatsOrder}
          />
        );
      case "sheetMirror":
        return (
          <SheetMirrorView
            filtered={shipment.filtered}
            loading={shell.loading}
            formatDateTimeRu={formatDateTimeRu}
          />
        );
      case "furniture":
        return (
          <FurnitureView
            furniture={{
              ...furniture,
              sectionCatalogRows: shipment.sectionCatalogRows,
            }}
            permissions={{ canOperateProduction: auth.canOperateProduction }}
            actions={{
              createShelfPlanOrder: actions.createShelfPlanOrder,
              createFurniturePlanOrder: actions.createFurniturePlanOrder,
              load: shell.mutationLoad,
              refreshPlanCatalogs: actions.refreshPlanCatalogs,
            }}
            helpers={{ furnitureProductLabel }}
          />
        );
      case "db":
        return (
          <DatabaseCatalogView
            canAdminSettings={auth.canAdminSettings}
            refreshPlanCatalogs={actions.refreshPlanCatalogs}
            load={shell.mutationLoad}
          />
        );
      case "admin":
        return (
          <AdminView
            canAdminSettings={auth.canAdminSettings}
            crmUsersLoading={admin.crmUsersLoading}
            crmUsersSaving={admin.crmUsersSaving}
            loadCrmUsers={admin.loadCrmUsers}
            newCrmUserId={admin.newCrmUserId}
            setNewCrmUserId={admin.setNewCrmUserId}
            newCrmUserRole={admin.newCrmUserRole}
            setNewCrmUserRole={admin.setNewCrmUserRole}
            newCrmUserNote={admin.newCrmUserNote}
            setNewCrmUserNote={admin.setNewCrmUserNote}
            createCrmUserRole={admin.createCrmUserRole}
            crmUsers={admin.crmUsers}
            updateCrmUserRole={admin.updateCrmUserRole}
            removeCrmUserRole={admin.removeCrmUserRole}
            auditLog={admin.auditLog}
            auditLoading={admin.auditLoading}
            auditError={admin.auditError}
            auditAction={admin.auditAction}
            auditEntity={admin.auditEntity}
            auditLimit={admin.auditLimit}
            auditOffset={admin.auditOffset}
            setAuditAction={admin.setAuditAction}
            setAuditEntity={admin.setAuditEntity}
            loadAuditLog={admin.loadAuditLog}
            formatDateTimeRu={formatDateTimeRu}
            roleOptions={CRM_ROLES}
            roleLabels={CRM_ROLE_LABELS}
            workSchedule={admin.workSchedule}
            setWorkSchedule={admin.setWorkSchedule}
            workScheduleLoading={admin.workScheduleLoading}
            workScheduleSaving={admin.workScheduleSaving}
            loadWorkSchedule={admin.loadWorkSchedule}
            saveWorkSchedule={admin.saveWorkSchedule}
            consumeLogSheetName={admin.consumeLogSheetName}
            consumeLogSheetUpdatedAt={admin.consumeLogSheetUpdatedAt}
            consumeLogSheetLoading={admin.consumeLogSheetLoading}
            consumeLogSheetSaving={admin.consumeLogSheetSaving}
            loadConsumeLogSheetSetting={admin.loadConsumeLogSheetSetting}
            saveConsumeLogSheetSetting={admin.saveConsumeLogSheetSetting}
          />
        );
      case "workshop":
        return (
          <WorkshopView
            workshop={{
              ...workshop,
              loading: shell.loading,
              tab: shell.tab,
              shipmentOrders: shipment.shipmentOrders,
              shipmentBoard: shipment.shipmentBoard,
              furnitureCustomTemplates: furniture.furnitureCustomTemplates,
              furnitureDetailArticleRows: furniture.furnitureDetailArticleRows,
              furnitureTemplates: furniture.furnitureTemplates,
              normalizeFurnitureKey,
            }}
            permissions={{ canOperateProduction: auth.canOperateProduction }}
            helpers={{
              statusClass,
              resolveDefaultConsumeSheets,
              resolveDefaultConsumeSheetsFromBoard,
              isDone,
              isInWork,
              isOrderCustomerShipped,
              getMaterialLabel,
            }}
          />
        );
      default:
        return null;
    }
  })();

  const shipmentContextValue = useMemo(
    () => ({
      ...shipment,
      loading: shell.loading,
      actionLoading: shell.actionLoading,
      shipmentTableGroupNames: shipmentTableGroupNamesForView,
      shipmentTableRowsWithStockStatus: shipmentTableRowsForView,
      shipmentRenderSections: shipmentRenderSectionsForView,
      shipmentTableRowsForView,
      shipmentRenderSectionsForView,
      shipmentTableGroupNamesForView,
    }),
    [
      shipment,
      shell.loading,
      shell.actionLoading,
      shipmentTableGroupNamesForView,
      shipmentTableRowsForView,
      shipmentRenderSectionsForView,
    ],
  );

  return (
    <ShipmentProvider value={shipmentContextValue}>
      <AppChrome
        shell={shell}
        auth={auth}
        shipment={shipment}
        warehouse={warehouse}
        labor={labor}
        metal={metal}
        packaging={packaging}
        actions={{
          ...actions,
          openManualLaborDialog,
        }}
      >
        <section className="cards">
          <Suspense fallback={(
            <div className="view-loading">
              <span className="view-loading__spinner" />
              Загружаем...
            </div>
          )}
          >
            {currentView}
          </Suspense>
        </section>
      </AppChrome>

      <AppDialogs
        shell={shell}
        admin={{ ...admin, canAdminSettings: auth.canAdminSettings }}
        shipment={shipment}
        dialogs={dialogs}
        packaging={packaging}
        actions={actions}
        helpers={{
          getStageLabel,
          formatDateTimeRu,
          isDone,
          isInWork,
          getMaterialLabel,
        }}
      />
    </ShipmentProvider>
  );
}

export default function App() {
  const { setError } = useUiState();
  const { view } = useNavigation();
  const onAuthChangeRef = useRef(() => Promise.resolve());

  return (
    <AuthProvider
      view={view}
      onAuthChange={() => onAuthChangeRef.current()}
      setError={setError}
    >
      <AppInner onAuthChangeRef={onAuthChangeRef} />
    </AuthProvider>
  );
}
