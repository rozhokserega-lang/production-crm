import { OrderDrawer } from "./OrderDrawer";
import { ConsumeDialog } from "./ConsumeDialog";
import { StrapDialog } from "./StrapDialog";
import { PlanDialog } from "./PlanDialog";
import { PackagingInboxDialog } from "./PackagingInboxDialog";
import { StrapDoneDialog } from "./StrapDoneDialog";

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
        planQty={plan.qty}
        planSaving={plan.saving}
        planPreviewing={false}
        onSectionChange={actions.handlePlanSectionChange}
        onArticleChange={actions.handlePlanArticleChange}
        onMaterialChange={plan.setMaterial}
        onPlanWeekChange={(value) => plan.setWeek(value.replace(/[^\d-]/g, ""))}
        onPlanQtyChange={(value) => plan.setQty(value.replace(/[^0-9.,]/g, ""))}
        onSave={actions.saveCreatePlanDialog}
        onPreview={actions.previewCreatePlanDialog}
        onClose={actions.closeCreatePlanDialog}
        refreshPlanCatalogs={actions.refreshPlanCatalogs}
      />
    </>
  );
}
