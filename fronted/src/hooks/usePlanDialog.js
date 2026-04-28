import { useCallback } from "react";
import { OrderService } from "../services/orderService";
import { resolvePlanMaterial, formatDateTimeForPrint } from "../app/appUtils";
import { buildPreviewRowsFromFurnitureTemplate } from "../app/appUtils";
import { resolveFurnitureTemplateForPreview } from "../utils/furnitureUtils";
import { buildCreatePlanDialogInit } from "../app/shipmentDialogHelpers";
import { toUserError } from "../app/errorCatalogHelpers";

/**
 * Encapsulates plan dialog logic: open, close, save, preview, section/article change handlers.
 *
 * @param {object} params
 * @param {boolean} params.canOperateProduction
 * @param {Function} params.denyActionByRole
 * @param {Function} params.setError
 * @param {Function} params.setPlanSection
 * @param {Function} params.setPlanArticle
 * @param {Function} params.setPlanMaterial
 * @param {Function} params.setPlanWeek
 * @param {Function} params.setPlanQty
 * @param {Function} params.setPlanSaving
 * @param {Function} params.setPlanDialogOpen
 * @param {Function} params.setPlanPreviews
 * @param {Array} params.sectionOptions
 * @param {Array} params.weeks
 * @param {Array} params.sectionArticleRows
 * @param {Array} params.sectionArticles
 * @param {string} params.planSection
 * @param {string} params.planArticle
 * @param {string} params.planMaterial
 * @param {string} params.planWeek
 * @param {string} params.planQty
 * @param {boolean} params.planSaving
 * @param {string} params.resolvedPlanItem
 * @param {Array} params.furnitureTemplates
 * @param {Function} params.syncPlanCellToGoogleSheet
 * @param {Function} params.load
 */
export function usePlanDialog({
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
}) {
  const handlePlanSectionChange = useCallback(
    (nextSection) => {
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
    },
    [sectionArticleRows, setPlanSection, setPlanArticle, setPlanMaterial],
  );

  const handlePlanArticleChange = useCallback(
    (nextArticle) => {
      setPlanArticle(nextArticle);
      const matched = sectionArticles.find((x) => x.itemName === nextArticle);
      setPlanMaterial(resolvePlanMaterial(matched));
    },
    [sectionArticles, setPlanArticle, setPlanMaterial],
  );

  const openCreatePlanDialog = useCallback(() => {
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
  }, [
    canOperateProduction,
    denyActionByRole,
    sectionOptions,
    weeks,
    sectionArticleRows,
    setPlanSection,
    setPlanArticle,
    setPlanMaterial,
    setPlanWeek,
    setPlanQty,
    setPlanDialogOpen,
  ]);

  const closeCreatePlanDialog = useCallback(() => {
    if (planSaving) return;
    setPlanDialogOpen(false);
  }, [planSaving, setPlanDialogOpen]);

  const saveCreatePlanDialog = useCallback(async () => {
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
      await OrderService.createShipmentPlanCell({
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
  }, [
    canOperateProduction,
    denyActionByRole,
    resolvedPlanItem,
    planMaterial,
    planWeek,
    planQty,
    planSection,
    setError,
    setPlanSaving,
    setPlanDialogOpen,
    syncPlanCellToGoogleSheet,
    load,
  ]);

  const previewCreatePlanDialog = useCallback(() => {
    const item = String(resolvedPlanItem || "").trim();
    const material = String(planMaterial || "").trim();
    const week = String(planWeek || "").trim();
    const qty = Number(String(planQty || "").replace(",", "."));
    const selectedCatalogArticle = String(
      (sectionArticles || []).find((x) => x.itemName === planArticle && String(x.material || "").trim() === String(planMaterial || "").trim())
        ?.article ||
      (sectionArticles || []).find((x) => x.itemName === planArticle)?.article ||
      "",
    ).trim();
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
    setError("");
    const basePreview = {
      _key: `dialog-preview:${Date.now()}`,
      generatedAt: formatDateTimeForPrint(new Date()),
      firstName: item,
      detailedName: item,
      colorName: material,
      planNumber: week,
      qty,
      article: selectedCatalogArticle,
      rows: [],
    };
    const template = resolveFurnitureTemplateForPreview(basePreview, furnitureTemplates);
    const rows = template ? buildPreviewRowsFromFurnitureTemplate(template, qty) : [];
    setPlanPreviews([{ ...basePreview, rows }]);
    setPlanDialogOpen(false);
  }, [
    resolvedPlanItem,
    planMaterial,
    planWeek,
    planQty,
    planArticle,
    sectionArticles,
    setError,
    furnitureTemplates,
    setPlanPreviews,
    setPlanDialogOpen,
  ]);

  return {
    handlePlanSectionChange,
    handlePlanArticleChange,
    openCreatePlanDialog,
    closeCreatePlanDialog,
    saveCreatePlanDialog,
    previewCreatePlanDialog,
  };
}
