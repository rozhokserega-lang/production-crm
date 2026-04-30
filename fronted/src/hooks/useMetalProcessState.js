import { useCallback, useEffect, useState } from "react";
import { OrderService } from "../services/orderService";

function parseQty(value) {
  const n = Number(String(value || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const DEFAULT_ROUTE = ["laser", "bending", "welding", "painting"];
const VALID_STAGES = ["laser", "saw", "bending", "welding", "painting"];

function mapCatalogRow(row) {
  const rawRoute = row?.stage_route ?? row?.stageRoute;
  const stageRoute =
    Array.isArray(rawRoute) && rawRoute.length > 0
      ? rawRoute.filter((s) => VALID_STAGES.includes(s))
      : DEFAULT_ROUTE;
  return {
    article: String(row?.article || row?.metal_article || "").trim(),
    name: String(row?.name || row?.metal_name || "").trim(),
    isActive: Boolean(row?.is_active ?? row?.isActive ?? true),
    stageRoute: stageRoute.length > 0 ? stageRoute : DEFAULT_ROUTE,
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
    result.push({ article, name, isActive: true, stageRoute: DEFAULT_ROUTE });
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
    out.push({
      article,
      name,
      isActive: row?.isActive !== false,
      stageRoute: Array.isArray(row?.stageRoute) && row.stageRoute.length > 0
        ? row.stageRoute
        : DEFAULT_ROUTE,
    });
  };
  for (const row of Array.isArray(primaryRows) ? primaryRows : []) pushUnique(row);
  for (const row of Array.isArray(fallbackRows) ? fallbackRows : []) pushUnique(row);
  out.sort((a, b) => String(a.article).localeCompare(String(b.article), "ru"));
  return out;
}

function mapProcessRow(row) {
  const rawRoute = row?.stage_route ?? row?.stageRoute;
  const stageRoute =
    Array.isArray(rawRoute) && rawRoute.length > 0
      ? rawRoute.map((s) => String(s || "").trim().toLowerCase()).filter((s) => VALID_STAGES.includes(s))
      : DEFAULT_ROUTE;
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
    stageRoute: stageRoute.length > 0 ? stageRoute : DEFAULT_ROUTE,
    routeIdx: Number(row?.route_idx ?? row?.routeIdx ?? 0) || 0,
    stageDoneQty: Number(row?.stage_done_qty ?? row?.stageDoneQty ?? 0) || 0,
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
  const [metalProcessCatalogLoading, setMetalProcessCatalogLoading] = useState(false);
  const [metalProcessActionKey, setMetalProcessActionKey] = useState("");
  const [metalProcessDraft, setMetalProcessDraft] = useState({
    article: "",
    name: "",
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
        // Важно: грузим и неактивные строки, чтобы они подавляли "fallback" из остатков склада.
        // В UI таблица каталога всё равно фильтрует только активные.
        OrderService.listMetalProcessCatalog(false).catch(() => null),
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
    const qty = parseQty(metalProcessDraft.qty);
    if (!article || !name || !(qty > 0)) {
      setError("Заполните артикул, название и количество > 0.");
      return;
    }

    setMetalProcessActionKey("create");
    setError("");
    try {
      await OrderService.createMetalProcessItem({
        article,
        name,
        week: null,
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

  const transitionMetalProcessStage = useCallback(async (id, action, startStage = null, doneQty = null, note = null) => {
    if (!canOperateProduction) return;
    const rowId = Number(id || 0);
    if (!(rowId > 0)) return;
    setMetalProcessActionKey(`row:${rowId}:${action}`);
    setError("");
    try {
      await OrderService.transitionMetalProcessStage(rowId, action, startStage, doneQty, note);
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

  const upsertMetalCatalogItem = useCallback(async (article, name, stageRoute, isActive = true) => {
    if (!canManageOrders) return;
    const key = `catalog:upsert:${article}`;
    setMetalProcessActionKey(key);
    setMetalProcessCatalogLoading(true);
    setError("");
    try {
      await OrderService.upsertMetalProcessCatalogItem(article, name, isActive, stageRoute);
      await loadMetalProcessData();
    } catch (e) {
      setError(explainRpcMissing(e));
    } finally {
      setMetalProcessActionKey("");
      setMetalProcessCatalogLoading(false);
    }
  }, [canManageOrders, explainRpcMissing, loadMetalProcessData, setError]);

  const deleteMetalCatalogItem = useCallback(async (article, name) => {
    if (!canManageOrders) return;
    setMetalProcessActionKey(`catalog:delete:${article}`);
    setMetalProcessCatalogLoading(true);
    setError("");
    try {
      await OrderService.deleteMetalCatalogItem(article);
      await loadMetalProcessData();
    } catch (e) {
      const msg = String(e?.message || e || "");
      if (msg.includes("Артикул не найден в каталоге")) {
        const fallbackArticle = String(article || "").trim().toUpperCase();
        const fallbackName = String(name || "").trim();
        if (fallbackArticle && fallbackName) {
          try {
            await OrderService.upsertMetalProcessCatalogItem(fallbackArticle, fallbackName, false, DEFAULT_ROUTE);
            await loadMetalProcessData();
            return;
          } catch (e2) {
            setError(explainRpcMissing(e2));
            return;
          }
        }
      }
      setError(explainRpcMissing(e));
    } finally {
      setMetalProcessActionKey("");
      setMetalProcessCatalogLoading(false);
    }
  }, [canManageOrders, explainRpcMissing, loadMetalProcessData, setError]);

  return {
    metalProcessRows,
    metalProcessCatalogRows,
    metalProcessLoading,
    metalProcessCatalogLoading,
    metalProcessActionKey,
    metalProcessDraft,
    setMetalProcessDraft,
    loadMetalProcessData,
    createMetalProcessPlanItem,
    transitionMetalProcessStage,
    saveMetalProcessComment,
    deleteMetalProcessItem,
    upsertMetalCatalogItem,
    deleteMetalCatalogItem,
  };
}
