import { useCallback } from "react";
import { OrderService } from "../services/orderService";
import {
  resolvePlanMaterial,
  formatDateTimeForPrint,
  buildPreviewRowsFromFurnitureTemplate,
} from "../app/appUtils";
import { resolveFurnitureTemplateForPreview } from "../utils/furnitureUtils";
import { buildCreatePlanDialogInit } from "../app/shipmentDialogHelpers";
import { toUserError } from "../app/errorCatalogHelpers";

interface SectionArticleRow {
  sectionName: string;
  article: string;
  itemName: string;
  material: string;
}

interface FurnitureTemplate {
  productName: string;
  details: { detailName: string; perUnit: number; [key: string]: unknown }[];
  [key: string]: unknown;
}

interface UsePlanDialogParams {
  canOperateProduction: boolean;
  denyActionByRole: (msg: string) => void;
  setError: (msg: string) => void;
  setPlanSection: (v: string) => void;
  setPlanArticle: (v: string) => void;
  setPlanMaterial: (v: string) => void;
  setPlanWeek: (v: string) => void;
  setPlanQty: (v: string) => void;
  setPlanSaving: (v: boolean) => void;
  setPlanDialogOpen: (v: boolean) => void;
  setPlanPreviews: (v: unknown[]) => void;
  sectionOptions: string[];
  weeks: string[];
  sectionArticleRows: unknown[];
  sectionArticles: SectionArticleRow[];
  planSection: string;
  planArticle: string;
  planMaterial: string;
  planWeek: string;
  planQty: string;
  planSaving: boolean;
  resolvedPlanItem: string;
  furnitureTemplates: FurnitureTemplate[];
  syncPlanCellToGoogleSheet: (params: Record<string, unknown>) => Promise<void>;
  load: () => Promise<void>;
}

interface UsePlanDialogReturn {
  handlePlanSectionChange: (nextSection: string) => void;
  handlePlanArticleChange: (nextArticle: string) => void;
  openCreatePlanDialog: () => void;
  closeCreatePlanDialog: () => void;
  saveCreatePlanDialog: () => Promise<void>;
  previewCreatePlanDialog: () => void;
}

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
}: UsePlanDialogParams): UsePlanDialogReturn {
  const handlePlanSectionChange = useCallback(
    (nextSection: string) => {
      setPlanSection(nextSection);
      const firstArticle = (sectionArticleRows || [])
        .map((x) => {
          const row = x as Record<string, unknown>;
          return {
            sectionName: String(row.section_name || row.sectionName || "").trim(),
            article: String(row.article || "").trim(),
            itemName: String(row.item_name || row.itemName || "").trim(),
            material: String(row.material || "").trim(),
          };
        })
        .find((x) => x.sectionName === nextSection && x.article);
      setPlanArticle(firstArticle?.itemName || "");
      setPlanMaterial(resolvePlanMaterial(firstArticle as Record<string, unknown>));
    },
    [sectionArticleRows, setPlanSection, setPlanArticle, setPlanMaterial],
  );

  const handlePlanArticleChange = useCallback(
    (nextArticle: string) => {
      setPlanArticle(nextArticle);
      const matched = sectionArticles.find((x) => x.itemName === nextArticle);
      setPlanMaterial(resolvePlanMaterial(matched as unknown as Record<string, unknown>));
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
      sectionArticleRows: sectionArticleRows as Record<string, unknown>[],
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
      sectionArticles.find((x) => x.itemName === planArticle)?.article || "",
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
    const basePreview: Record<string, unknown> = {
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
    const template = resolveFurnitureTemplateForPreview(
      basePreview,
      furnitureTemplates as never,
    );
    const rows = template
      ? buildPreviewRowsFromFurnitureTemplate(template as never, qty)
      : [];
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
