import { useCallback } from "react";
import { OrderService } from "../services/orderService";
import { resolvePlanMaterial, formatDateTimeForPrint } from "../app/appUtils";
import { buildPreviewRowsFromFurnitureTemplate } from "../app/appUtils";
import { resolveFurnitureTemplateForPreview } from "../utils/furnitureUtils";
import {
  buildCreatePlanDialogInit,
  buildEditPlanDialogInit,
  matchPlanCatalogRowSelectKey,
  planCatalogRowSelectKey,
} from "../app/shipmentDialogHelpers";
import { catalogSectionMatchesPlanSection } from "../utils/shipmentUtils";
import { normalizePlanWeek, sortPlanWeeks } from "../app/overviewPlansHelpers";
import { buildShipmentCellAttempts, runShipmentCellActionWithFallback } from "../app/shipmentActionHelpers";
import { isShipmentCellMissingError } from "../app/rowHelpers";
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
 * @param {Function} params.setPlanMonthId
 * @param {string} params.planMonthId
 * @param {Array} params.planMonths
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
 * @param {Function} params.load
 * @param {object|null} params.planEditSource
 * @param {Function} params.setPlanEditSource
 * @param {Function} params.updatePlanMonth
 */
export function usePlanDialog({
  canOperateProduction,
  denyActionByRole,
  setError,
  setPlanSection,
  setPlanArticle,
  setPlanMaterial,
  setPlanMonthId,
  setPlanWeek,
  setPlanQty,
  setPlanSaving,
  setPlanDialogOpen,
  setPlanPreviews,
  sectionOptions,
  weeks,
  planMonths,
  sectionArticleRows,
  sectionArticles,
  planSection,
  planArticle,
  planMaterial,
  planMonthId,
  planWeek,
  planQty,
  planSaving,
  resolvedPlanItem,
  furnitureTemplates,
  load,
  planEditSource,
  setPlanEditSource,
  setSelectedShipments,
  updatePlanMonth,
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
        .find((x) => catalogSectionMatchesPlanSection(x.sectionName, nextSection) && (x.article || x.itemName));
      setPlanArticle(firstArticle ? planCatalogRowSelectKey(firstArticle) : "");
      setPlanMaterial(resolvePlanMaterial(firstArticle));
    },
    [sectionArticleRows, setPlanSection, setPlanArticle, setPlanMaterial],
  );

  const handlePlanArticleChange = useCallback(
    (nextKey) => {
      setPlanArticle(nextKey);
      const matched = sectionArticles.find((x) =>
        matchPlanCatalogRowSelectKey(x, String(nextKey || "").trim()),
      );
      setPlanMaterial(resolvePlanMaterial(matched));
    },
    [sectionArticles, setPlanArticle, setPlanMaterial],
  );

  const handlePlanMonthChange = useCallback(
    (nextMonthId) => {
      const monthId = String(nextMonthId || "").trim();
      setPlanMonthId(monthId);
      const month = (planMonths || []).find((m) => String(m.id) === monthId);
      const monthWeekList = (month?.weeks || []).map(normalizePlanWeek).filter(Boolean);
      const currentWeek = normalizePlanWeek(planWeek);
      const nextWeek = currentWeek && monthWeekList.includes(currentWeek)
        ? currentWeek
        : (monthWeekList[0] || "");
      setPlanWeek(nextWeek);
    },
    [planMonths, planWeek, setPlanMonthId, setPlanWeek],
  );

  const handleAddPlanMonthWeek = useCallback(async (rawWeek) => {
    const week = normalizePlanWeek(rawWeek);
    if (!week) {
      setError("Укажите номер недели (только цифры).");
      return false;
    }
    setPlanWeek(week);
    const monthId = String(planMonthId || "").trim();
    if (!monthId || typeof updatePlanMonth !== "function") return true;

    const month = (planMonths || []).find((m) => String(m.id) === monthId);
    if (!month) return true;

    const existing = (month.weeks || []).map(normalizePlanWeek).filter(Boolean);
    if (existing.includes(week)) return true;

    setPlanSaving(true);
    setError("");
    try {
      const ok = await updatePlanMonth(monthId, { weeks: sortPlanWeeks([...existing, week]) });
      if (!ok) {
        setError("Не удалось добавить неделю в месяц.");
        return false;
      }
      return true;
    } catch (e) {
      setError(toUserError(e));
      return false;
    } finally {
      setPlanSaving(false);
    }
  }, [
    planMonthId,
    planMonths,
    setError,
    setPlanSaving,
    setPlanWeek,
    updatePlanMonth,
  ]);

  const openCreatePlanDialog = useCallback(() => {
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для добавления плана.");
      return;
    }
    setPlanEditSource(null);
    const init = buildCreatePlanDialogInit({
      sectionOptions,
      weeks,
      planMonths,
      sectionArticleRows,
      resolvePlanMaterial,
    });
    setPlanSection(init.section);
    setPlanArticle(init.article);
    setPlanMaterial(init.material);
    setPlanMonthId(init.monthId || "");
    setPlanWeek(init.week);
    setPlanQty(init.qty);
    setPlanDialogOpen(true);
  }, [
    canOperateProduction,
    denyActionByRole,
    sectionOptions,
    weeks,
    planMonths,
    sectionArticleRows,
    setPlanSection,
    setPlanArticle,
    setPlanMaterial,
    setPlanMonthId,
    setPlanWeek,
    setPlanQty,
    setPlanDialogOpen,
    setPlanEditSource,
  ]);

  const openEditPlanDialog = useCallback(
    (selection) => {
      if (!canOperateProduction) {
        denyActionByRole("Недостаточно прав для редактирования плана.");
        return;
      }
      if (!selection?.canSendToWork) {
        setError("Позиция недоступна для редактирования (уже в работе или закрыта).");
        return;
      }
      const init = buildEditPlanDialogInit({
        selection,
        sectionOptions,
        planMonths,
        sectionArticleRows,
        resolvePlanMaterial,
      });
      if (!init.editSource?.row || !init.editSource?.col) {
        setError("Не удалось определить ячейку плана для редактирования.");
        return;
      }
      setPlanEditSource(init.editSource);
      setPlanSection(init.section);
      setPlanArticle(init.article);
      setPlanMaterial(init.material);
      setPlanMonthId(init.monthId || "");
      setPlanWeek(init.week);
      setPlanQty(init.qty);
      setPlanDialogOpen(true);
    },
    [
      canOperateProduction,
      denyActionByRole,
      setError,
      sectionOptions,
      planMonths,
      sectionArticleRows,
      setPlanEditSource,
      setPlanSection,
      setPlanArticle,
      setPlanMaterial,
      setPlanMonthId,
      setPlanWeek,
      setPlanQty,
      setPlanDialogOpen,
    ],
  );

  const closeCreatePlanDialog = useCallback(() => {
    if (planSaving) return;
    setPlanEditSource(null);
    setPlanDialogOpen(false);
  }, [planSaving, setPlanDialogOpen, setPlanEditSource]);

  /** Сохранить и остаться в диалоге — сбрасывает артикул и количество, секция и неделя остаются.
   *  Возвращает объект { ok, resolvedItem, catalogArticle, material, week, qty } или false при ошибке.
   */
  const saveAndContinuePlanDialog = useCallback(async () => {
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для изменения плана.");
      return false;
    }
    const item = String(resolvedPlanItem || "").trim();
    const material = String(planMaterial || "").trim();
    const week = String(planWeek || "").trim();
    const qty = Number(String(planQty || "").replace(",", "."));
    if (!item) { setError("Выберите изделие."); return false; }
    if (!material) { setError("Укажите материал."); return false; }
    if (!week) { setError("Укажите неделю плана."); return false; }
    if (!Number.isFinite(qty) || qty <= 0) { setError("Количество должно быть больше 0."); return false; }
    const catalogArticle = String(
      (sectionArticles || []).find((x) => matchPlanCatalogRowSelectKey(x, String(planArticle || "").trim()))?.article || "",
    ).trim();
    setPlanSaving(true);
    setError("");
    try {
      await OrderService.createShipmentPlanCell({ sectionName: planSection, item, material, week, qty });
      setPlanArticle("");
      setPlanMaterial("");
      setPlanQty("");
      void load();
      return { ok: true, resolvedItem: item, catalogArticle, material, week, qty };
    } catch (e) {
      setError(toUserError(e));
      return false;
    } finally {
      setPlanSaving(false);
    }
  }, [
    canOperateProduction,
    denyActionByRole,
    resolvedPlanItem,
    planArticle,
    planMaterial,
    planWeek,
    planQty,
    planSection,
    sectionArticles,
    setError,
    setPlanSaving,
    setPlanArticle,
    setPlanMaterial,
    setPlanQty,
    load,
  ]);

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
      setError("Выберите изделие в списке «Артикул» (не удалось определить название по выбранной строке).");
      return;
    }
    if (!material) {
      setError("Укажите материал (он подставляется из артикула или выбирается в списке).");
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
      setPlanEditSource(null);
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
    setPlanEditSource,
    load,
  ]);

  const saveEditPlanDialog = useCallback(async () => {
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для изменения плана.");
      return;
    }
    if (!planEditSource?.row || !planEditSource?.col) {
      setError("Не удалось определить ячейку плана для сохранения.");
      return;
    }
    const item = String(resolvedPlanItem || "").trim();
    const material = String(planMaterial || "").trim();
    const week = String(planWeek || "").trim();
    const qty = Number(String(planQty || "").replace(",", "."));
    if (!item) {
      setError("Выберите изделие в списке «Артикул» (не удалось определить название по выбранной строке).");
      return;
    }
    if (!material) {
      setError("Укажите материал (он подставляется из артикула или выбирается в списке).");
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
      const attempts = buildShipmentCellAttempts(planEditSource);
      await runShipmentCellActionWithFallback({
        actionFn: (params) =>
          OrderService.updateShipmentPlanCell({
            row: params.p_row,
            col: params.p_col,
            sectionName: planSection,
            item,
            material,
            week,
            qty,
          }),
        attempts,
        isMissingError: isShipmentCellMissingError,
        requestBuilder: (p) => ({ p_row: p.row, p_col: p.col }),
      });
      setPlanEditSource(null);
      setPlanDialogOpen(false);
      if (typeof setSelectedShipments === "function") {
        setSelectedShipments([]);
      }
      await load();
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setPlanSaving(false);
    }
  }, [
    canOperateProduction,
    denyActionByRole,
    planEditSource,
    resolvedPlanItem,
    planMaterial,
    planWeek,
    planQty,
    planSection,
    setError,
    setPlanSaving,
    setPlanEditSource,
    setPlanDialogOpen,
    setSelectedShipments,
    load,
  ]);

  const previewCreatePlanDialog = useCallback(() => {
    const item = String(resolvedPlanItem || "").trim();
    const material = String(planMaterial || "").trim();
    const week = String(planWeek || "").trim();
    const qty = Number(String(planQty || "").replace(",", "."));
    const selectedCatalogArticle = String(
      (sectionArticles || []).find((x) => matchPlanCatalogRowSelectKey(x, String(planArticle || "").trim()))
        ?.article ||
        (sectionArticles || []).find(
          (x) => x.itemName === planArticle && String(x.material || "").trim() === String(planMaterial || "").trim(),
        )?.article ||
        (sectionArticles || []).find((x) => x.itemName === planArticle)?.article ||
        "",
    ).trim();
    if (!item) {
      setError("Выберите изделие в списке «Артикул» (не удалось определить название по выбранной строке).");
      return;
    }
    if (!material) {
      setError("Укажите материал (он подставляется из артикула или выбирается в списке).");
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

  /** Пакетное сохранение нескольких позиций из локального списка диалога. */
  const saveAllPlanDialogItems = useCallback(async (items) => {
    if (!canOperateProduction) {
      denyActionByRole("Недостаточно прав для изменения плана.");
      return;
    }
    if (!items || items.length === 0) return;
    setPlanSaving(true);
    setError("");
    try {
      for (const { resolvedItem, material, week, qty, section } of items) {
        await OrderService.createShipmentPlanCell({ sectionName: section, item: resolvedItem, material, week, qty });
      }
      setPlanDialogOpen(false);
      await load();
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setPlanSaving(false);
    }
  }, [canOperateProduction, denyActionByRole, setError, setPlanSaving, setPlanDialogOpen, load]);

  /** Предпросмотр нескольких позиций (накопленный список из диалога). */
  const previewMultiplePlanDialogItems = useCallback((items) => {
    if (!items || items.length === 0) { previewCreatePlanDialog(); return; }
    setError("");
    const previews = items.map(({ resolvedItem, catalogArticle, material, week, qty }) => {
      const basePreview = {
        _key: `dialog-preview:${Date.now()}-${Math.random()}`,
        generatedAt: formatDateTimeForPrint(new Date()),
        firstName: resolvedItem,
        detailedName: resolvedItem,
        colorName: material,
        planNumber: week,
        qty,
        article: catalogArticle,
        rows: [],
      };
      const template = resolveFurnitureTemplateForPreview(basePreview, furnitureTemplates);
      const rows = template ? buildPreviewRowsFromFurnitureTemplate(template, qty) : [];
      return { ...basePreview, rows };
    });
    setPlanPreviews(previews);
    setPlanDialogOpen(false);
  }, [setError, furnitureTemplates, setPlanPreviews, setPlanDialogOpen, previewCreatePlanDialog]);

  return {
    handlePlanSectionChange,
    handlePlanArticleChange,
    handlePlanMonthChange,
    handleAddPlanMonthWeek,
    openCreatePlanDialog,
    openEditPlanDialog,
    closeCreatePlanDialog,
    saveCreatePlanDialog,
    saveEditPlanDialog,
    saveAllPlanDialogItems,
    previewCreatePlanDialog,
    previewMultiplePlanDialogItems,
  };
}
