import { useCallback, useEffect, useState } from "react";
import { OrderService } from "../services/orderService";

function parseQty(value) {
  const n = Number(String(value || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function mapCatalogRow(row) {
  return {
    article: String(row?.article || row?.metal_article || "").trim(),
    name: String(row?.name || row?.metal_name || "").trim(),
    isActive: Boolean(row?.is_active ?? row?.isActive ?? true),
  };
}

function buildCatalogFromMetalStock(rows) {
  const seen = new Set();
  const result = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const article = String(row?.metal_article || row?.article || "").trim();
    const name = String(row?.metal_name || row?.name || "").trim();
    if (!article || !name) continue;
    const key = `${article}|||${name}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ article, name, isActive: true });
  }
  result.sort((a, b) => String(a.article).localeCompare(String(b.article), "ru"));
  return result;
}

function mergeCatalogRows(primaryRows, fallbackRows) {
  const out = [];
  const seen = new Set();
  const pushUnique = (row) => {
    const article = String(row?.article || "").trim();
    const name = String(row?.name || "").trim();
    if (!article || !name) return;
    const key = `${article}|||${name}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ article, name, isActive: row?.isActive !== false });
  };
  for (const row of Array.isArray(primaryRows) ? primaryRows : []) pushUnique(row);
  for (const row of Array.isArray(fallbackRows) ? fallbackRows : []) pushUnique(row);
  out.sort((a, b) => String(a.article).localeCompare(String(b.article), "ru"));
  return out;
}

function mapProcessRow(row) {
  return {
    id: Number(row?.id || 0),
    article: String(row?.article || "").trim(),
    name: String(row?.name || "").trim(),
    week: String(row?.week || "").trim(),
    qty: Number(row?.qty || 0),
    currentStage: String(row?.current_stage || row?.currentStage || ""),
    stageStatus: String(row?.stage_status || row?.stageStatus || ""),
    status: String(row?.status || ""),
    operatorComment: String(row?.operator_comment || row?.operatorComment || ""),
    laserSeconds: Number(row?.laser_seconds || row?.laserSeconds || 0),
    sawSeconds: Number(row?.saw_seconds || row?.sawSeconds || 0),
    bendingSeconds: Number(row?.bending_seconds || row?.bendingSeconds || 0),
    weldingSeconds: Number(row?.welding_seconds || row?.weldingSeconds || 0),
    paintingSeconds: Number(row?.painting_seconds || row?.paintingSeconds || 0),
  };
}

function normalizeUserFacingError(value, fallbackText) {
  const text = String(value ?? "").trim();
  if (!text || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") {
    return fallbackText;
  }
  return text;
}

export function useMetalProcessState({
  view,
  canOperateProduction,
  canManageOrders,
  setError,
  toUserError,
}) {
  const [metalProcessRows, setMetalProcessRows] = useState([]);
  const [metalProcessCatalogRows, setMetalProcessCatalogRows] = useState([]);
  const [metalProcessLoading, setMetalProcessLoading] = useState(false);
  const [metalProcessActionKey, setMetalProcessActionKey] = useState("");
  const [metalProcessDraft, setMetalProcessDraft] = useState({
    article: "",
    name: "",
    week: "",
    qty: "1",
  });

  const explainRpcMissing = useCallback((error) => {
    const message = String(error?.message || error || "");
    if (
      message.includes("web_create_metal_work_item") ||
      message.includes("web_set_metal_work_item_comment") ||
      message.includes("web_delete_metal_work_item") ||
      message.includes("schema cache")
    ) {
      return "RPC для metal-процесса не найдена в Supabase. Примените миграции (включая 20260429133000_metal_process_domain.sql) и обновите schema cache.";
    }
    const fallback = toUserError(error);
    return normalizeUserFacingError(fallback || message, "Ошибка загрузки данных metal-процесса.");
  }, [toUserError]);

  const loadMetalProcessData = useCallback(async () => {
    setMetalProcessLoading(true);
    try {
      const [catalog, items] = await Promise.all([
        OrderService.listMetalProcessCatalog().catch(() => null),
        OrderService.listMetalProcessItems(),
      ]);
      const catalogRowsPrimary = Array.isArray(catalog) ? catalog.map(mapCatalogRow) : [];
      const stockRows = await OrderService.getMetalStock().catch(() => []);
      const stockCatalogRows = buildCatalogFromMetalStock(stockRows);
      const catalogRows = mergeCatalogRows(catalogRowsPrimary, stockCatalogRows);
      setMetalProcessCatalogRows(catalogRows);
      setMetalProcessRows(Array.isArray(items) ? items.map(mapProcessRow) : []);
    } catch (e) {
      setError(explainRpcMissing(e));
    } finally {
      setMetalProcessLoading(false);
    }
  }, [explainRpcMissing, setError]);

  useEffect(() => {
    if (view !== "metalProcess") return;
    void loadMetalProcessData();
  }, [view, loadMetalProcessData]);

  const createMetalProcessPlanItem = useCallback(async () => {
    if (!canOperateProduction) return;
    const article = String(metalProcessDraft.article || "").trim().toUpperCase();
    const name = String(metalProcessDraft.name || "").trim();
    const week = String(metalProcessDraft.week || "").trim();
    const qty = parseQty(metalProcessDraft.qty);
    if (!article || !name || !week || !(qty > 0)) {
      setError("Заполните артикул, название, неделю и количество > 0.");
      return;
    }

    setMetalProcessActionKey("create");
    setError("");
    try {
      await OrderService.createMetalProcessItem({
        article,
        name,
        week,
        qty,
      });
      setMetalProcessDraft((prev) => ({ ...prev, article: "", name: "", qty: "1" }));
      await loadMetalProcessData();
    } catch (e) {
      setError(explainRpcMissing(e));
    } finally {
      setMetalProcessActionKey("");
    }
  }, [canOperateProduction, metalProcessDraft, setError, explainRpcMissing, loadMetalProcessData]);

  const transitionMetalProcessStage = useCallback(async (id, action, startStage = null) => {
    if (!canOperateProduction) return;
    const rowId = Number(id || 0);
    if (!(rowId > 0)) return;
    setMetalProcessActionKey(`row:${rowId}:${action}`);
    setError("");
    try {
      await OrderService.transitionMetalProcessStage(rowId, action, startStage);
      await loadMetalProcessData();
    } catch (e) {
      setError(explainRpcMissing(e));
    } finally {
      setMetalProcessActionKey("");
    }
  }, [canOperateProduction, loadMetalProcessData, setError, explainRpcMissing]);

  const deleteMetalProcessItem = useCallback(async (id) => {
    if (!canManageOrders) return;
    const rowId = Number(id || 0);
    if (!(rowId > 0)) return;
    setMetalProcessActionKey(`row:${rowId}:delete`);
    setError("");
    try {
      await OrderService.deleteMetalProcessItem(rowId);
      await loadMetalProcessData();
    } catch (e) {
      setError(explainRpcMissing(e));
    } finally {
      setMetalProcessActionKey("");
    }
  }, [canManageOrders, explainRpcMissing, loadMetalProcessData, setError]);

  const saveMetalProcessComment = useCallback(async (id, comment) => {
    if (!canManageOrders) return;
    const rowId = Number(id || 0);
    if (!(rowId > 0)) return;
    setMetalProcessActionKey(`row:${rowId}:comment`);
    setError("");
    try {
      await OrderService.setMetalProcessComment(rowId, comment);
      await loadMetalProcessData();
    } catch (e) {
      setError(explainRpcMissing(e));
    } finally {
      setMetalProcessActionKey("");
    }
  }, [canManageOrders, explainRpcMissing, loadMetalProcessData, setError]);

  return {
    metalProcessRows,
    metalProcessCatalogRows,
    metalProcessLoading,
    metalProcessActionKey,
    metalProcessDraft,
    setMetalProcessDraft,
    loadMetalProcessData,
    createMetalProcessPlanItem,
    transitionMetalProcessStage,
    saveMetalProcessComment,
    deleteMetalProcessItem,
  };
}
