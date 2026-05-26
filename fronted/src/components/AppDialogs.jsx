import { OrderDrawer } from "./OrderDrawer";
import { ConsumeDialog } from "./ConsumeDialog";
import { StrapDialog } from "./StrapDialog";
import { PlanDialog } from "./PlanDialog";
import { PackagingInboxDialog } from "./PackagingInboxDialog";
import { StrapDoneDialog } from "./StrapDoneDialog";
import { ShipmentSendToWorkDialog } from "./ShipmentSendToWorkDialog";
import { WorkshopFinalDoneDialog } from "./WorkshopFinalDoneDialog";
import { WorkshopPlanPrintDialog } from "./WorkshopPlanPrintDialog";

export function AppDialogs({
  shell,
  admin,
  shipment,
  dialogs,
  packaging,
  actions,
  helpers,
}) {
  const {
    orderDrawerId,
    setOrderDrawerId,
  } = shell;
  const {
    workSchedule,
    saveOrderAdminComment,
    adminCommentSaving,
  } = admin;
  const {
    orderDrawerLines,
    selectedItemVariants,
    sectionOptions,
    sectionArticles,
    strapProductNames,
    strapOptionsForSelectedProduct,
    weeks,
  } = shipment;
  const {
    consume,
    strap,
    plan,
    strapDone,
  } = dialogs;

  return (
    <>
      <PackagingInboxDialog
        open={packaging.packagingDialogOpen}
        orders={packaging.packagingOrders}
        acceptingId={packaging.packagingAcceptingId}
        actionError={packaging.packagingActionError}
        successMessage={packaging.packagingSuccessMessage}
        onAccept={packaging.acceptPackagingOrder}
        onClose={packaging.closePackagingDialog}
      />

      <StrapDoneDialog
        open={strapDone.open}
        meta={strapDone.meta}
        qtyInput={strapDone.qtyInput}
        setQtyInput={strapDone.setQtyInput}
        error={strapDone.error}
        saving={strapDone.saving}
        onClose={strapDone.close}
        onSubmit={strapDone.submit}
      />

      <WorkshopPlanPrintDialog
        open={dialogs.workshopPlanPrint?.open}
        loading={dialogs.workshopPlanPrint?.loading}
        error={dialogs.workshopPlanPrint?.error}
        planPreview={dialogs.workshopPlanPrint?.planPreview}
        onClose={dialogs.workshopPlanPrint?.close}
        onPrint={dialogs.workshopPlanPrint?.print}
        articleLookupByItemKey={dialogs.workshopPlanPrint?.articleLookupByItemKey}
        printAreaRef={dialogs.workshopPlanPrint?.printAreaRef}
      />

      <WorkshopFinalDoneDialog
        open={dialogs.workshopFinalDone?.open}
        meta={dialogs.workshopFinalDone?.meta}
        qtyInput={dialogs.workshopFinalDone?.qtyInput}
        setQtyInput={dialogs.workshopFinalDone?.setQtyInput}
        planPreview={dialogs.workshopFinalDone?.planPreview}
        setPlanPreview={dialogs.workshopFinalDone?.setPlanPreview}
        previewLoading={dialogs.workshopFinalDone?.previewLoading}
        error={dialogs.workshopFinalDone?.error}
        saving={dialogs.workshopFinalDone?.saving}
        onClose={dialogs.workshopFinalDone?.close}
        onConfirm={dialogs.workshopFinalDone?.confirm}
        onPrint={dialogs.workshopFinalDone?.print}
        articleLookupByItemKey={dialogs.workshopFinalDone?.articleLookupByItemKey}
        previewDeps={dialogs.workshopFinalDone?.previewDeps}
        printAreaRef={dialogs.workshopFinalDone?.printAreaRef}
      />

      <ShipmentSendToWorkDialog
        open={dialogs.sendToWork?.open}
        items={dialogs.sendToWork?.items || []}
        planPreviews={dialogs.sendToWork?.planPreviews || []}
        loading={dialogs.sendToWork?.loading}
        error={dialogs.sendToWork?.error}
        printing={dialogs.sendToWork?.printing}
        onClose={dialogs.sendToWork?.close}
        onShowPrint={dialogs.sendToWork?.showPrintSheets}
        articleLookupByItemKey={dialogs.sendToWork?.articleLookupByItemKey}
        printAreaRef={dialogs.sendToWork?.printAreaRef}
      />

      <OrderDrawer
        orderId={orderDrawerId}
        lines={orderDrawerLines}
        open={Boolean(orderDrawerId)}
        onClose={() => setOrderDrawerId("")}
        getStageLabel={helpers.getStageLabel}
        formatDateTimeRu={helpers.formatDateTimeRu}
        isDone={helpers.isDone}
        isInWork={helpers.isInWork}
        getMaterialLabel={helpers.getMaterialLabel}
        canEditAdminComment={admin.canAdminSettings}
        onSaveAdminComment={saveOrderAdminComment}
        savingAdminComment={adminCommentSaving}
        canAdminStageOverride={admin.canAdminSettings}
        onAdminStageOverride={actions.overrideOrderStageFromDrawer}
        canViewOrderTimeline={admin.canAdminSettings || admin.canManageOrders}
        workSchedule={workSchedule}
      />

      <ConsumeDialog
        isOpen={consume.open}
        consumeDialogData={consume.data}
        consumeLoading={consume.loading}
        consumeEditMode={consume.editMode}
        consumeMaterial={consume.material}
        consumeQty={consume.qty}
        consumeSaving={consume.saving}
        consumeError={consume.error}
        onSubmit={actions.submitConsume}
        onSetEditMode={consume.setEditMode}
        onClose={actions.closeConsumeDialog}
        onMaterialChange={consume.setMaterial}
        onQtyChange={consume.setQty}
      />

      <StrapDialog
        isOpen={strap.open}
        strapTargetProduct={strap.targetProduct}
        strapProductNames={strapProductNames}
        strapPlanWeek={strap.planWeek}
        strapOptionsForSelectedProduct={strapOptionsForSelectedProduct}
        strapDraft={strap.draft}
        isSaving={shell.actionLoading === "shipment:strapsave"}
        onTargetProductChange={strap.setTargetProduct}
        onPlanWeekChange={(value) => strap.setPlanWeek(value.replace(/[^\d-]/g, ""))}
        onDraftValueChange={(name, value) =>
          strap.setDraft((prev) => ({
            ...prev,
            [name]: value.replace(/[^0-9.,]/g, ""),
          }))
        }
        onSave={actions.saveStrapDialog}
        onClose={() => strap.setOpen(false)}
        onClear={() => {
          shipment.setStrapItems([]);
          strap.setDraft(
            strapOptionsForSelectedProduct.reduce((acc, name) => ({ ...acc, [name]: "" }), {}),
          );
          strap.setOpen(false);
        }}
      />

      <PlanDialog
        isOpen={plan.open}
        planSection={plan.section}
        sectionOptions={sectionOptions}
        planArticle={plan.article}
        sectionArticles={sectionArticles}
        selectedItemVariants={selectedItemVariants}
        planMaterial={plan.material}
        planWeek={plan.week}
        weeks={weeks}
        planQty={plan.qty}
        planSaving={plan.saving}
        planPreviewing={false}
        onSectionChange={actions.handlePlanSectionChange}
        onArticleChange={actions.handlePlanArticleChange}
        onMaterialChange={plan.setMaterial}
        onPlanWeekChange={(value) => plan.setWeek(value.replace(/[^\d-]/g, ""))}
        onPlanQtyChange={(value) => plan.setQty(value.replace(/[^0-9.,]/g, ""))}
        onSave={actions.saveCreatePlanDialog}
        onSaveAll={actions.saveAllPlanDialogItems}
        onPreviewItems={actions.previewMultiplePlanDialogItems}
        onPreview={actions.previewCreatePlanDialog}
        onClose={actions.closeCreatePlanDialog}
        refreshPlanCatalogs={actions.refreshPlanCatalogs}
      />
    </>
  );
}
