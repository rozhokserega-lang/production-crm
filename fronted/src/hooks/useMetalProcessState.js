import { useCallback, useEffect, useState } from "react";
import { OrderService } from "../services/orderService";
import {
  createLinearProcessGraph,
  DEFAULT_PROCESS_GRAPH,
  deriveStageRouteFromGraph,
  processGraphFromCatalogRow,
} from "../app/metalProcessGraph";
import { mapMetalCatalogCategoryRow, normalizeCatalogCategory } from "../app/metalCatalogHelpers";

const DEFAULT_ROUTE = ["laser", "bending", "welding", "painting"];
const VALID_STAGES = ["laser", "saw", "bending", "welding", "painting"];

function parseQty(value) {
  const n = Number(String(value || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function mapCatalogRow(row) {
  const processGraph = processGraphFromCatalogRow(row);
  const stageRoute = deriveStageRouteFromGraph(processGraph);
  return {
    article: String(row?.article || row?.metal_article || "").trim(),
    name: String(row?.name || row?.metal_name || "").trim(),
    category: normalizeCatalogCategory(row?.category),
    isActive: Boolean(row?.is_active ?? row?.isActive ?? true),
    stageRoute,
    processGraph,
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
    result.push({
      article,
      name,
      category: "",
      isActive: true,
      stageRoute: DEFAULT_ROUTE,
      processGraph: DEFAULT_PROCESS_GRAPH,
    });
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
      category: normalizeCatalogCategory(row?.category),
      isActive: row?.isActive !== false,
      stageRoute: Array.isArray(row?.stageRoute) && row.stageRoute.length > 0
        ? row.stageRoute
        : DEFAULT_ROUTE,
      processGraph: row?.processGraph || createLinearProcessGraph(
        Array.isArray(row?.stageRoute) && row.stageRoute.length > 0 ? row.stageRoute : DEFAULT_ROUTE,
      ),
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
    processGraph: row?.process_graph ?? row?.processGraph ?? null,
    forkGroupId: row?.fork_group_id ?? row?.forkGroupId ?? null,
    forkRole: String(row?.fork_role ?? row?.forkRole ?? "").trim() || null,
    parentId: Number(row?.parent_id ?? row?.parentId ?? 0) || null,
    forkMeta: row?.fork_meta ?? row?.forkMeta ?? null,
    shortfallQty: Number(row?.shortfall_qty ?? row?.shortfallQty ?? 0) || 0,
    lastEventStage: String(row?.last_event_stage ?? row?.lastEventStage ?? ""),
    lastEventAction: String(row?.last_event_action ?? row?.lastEventAction ?? ""),
    lastEventNote: String(row?.last_event_note ?? row?.lastEventNote ?? ""),
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
  const [metalCatalogOptionRows, setMetalCatalogOptionRows] = useState([]);
  const [metalCatalogCategories, setMetalCatalogCategories] = useState([]);
  const [metalProcessLoading, setMetalProcessLoading] = useState(false);
  const [metalProcessCatalogLoading, setMetalProcessCatalogLoading] = useState(false);
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
      const [catalog, categories, items] = await Promise.all([
        // Важно: грузим и неактивные строки, чтобы они подавляли "fallback" из остатков склада.
        // В UI таблица каталога всё равно фильтрует только активные.
        OrderService.listMetalProcessCatalog(false).catch(() => null),
        OrderService.listMetalCatalogCategories().catch(() => []),
        OrderService.listMetalProcessItems(),
      ]);
      const catalogRowsPrimary = Array.isArray(catalog) ? catalog.map(mapCatalogRow) : [];
      const categoryRows = Array.isArray(categories) ? categories.map(mapMetalCatalogCategoryRow) : [];
      const stockRows = await OrderService.getMetalStock().catch(() => []);
      const stockCatalogRows = buildCatalogFromMetalStock(stockRows);
      setMetalCatalogCategories(categoryRows);
      setMetalProcessCatalogRows(catalogRowsPrimary);
      setMetalCatalogOptionRows(mergeCatalogRows(catalogRowsPrimary, stockCatalogRows));
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
        week: week || null,
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

  // Зачислить готовую позицию производства на склад готовой продукции.
  // Переводит metal_work_items.status 'done' -> 'stocked', позиция исчезает из «Готовых».
  const receiveMetalFinished = useCallback(async (id) => {
    if (!canManageOrders) return;
    const rowId = Number(id || 0);
    if (!(rowId > 0)) return;
    setMetalProcessActionKey(`row:${rowId}:receive`);
    setError("");
    try {
      await OrderService.receiveMetalFinished(rowId);
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

  const upsertMetalCatalogItem = useCallback(async (article, name, routePayload, isActive = true, category = "") => {
    if (!canManageOrders) return;
    const key = `catalog:upsert:${article}`;
    setMetalProcessActionKey(key);
    setMetalProcessCatalogLoading(true);
    setError("");
    try {
      let processGraph;
      let stageRoute;
      if (Array.isArray(routePayload)) {
        stageRoute = routePayload;
        processGraph = createLinearProcessGraph(stageRoute);
      } else {
        processGraph = routePayload?.processGraph || DEFAULT_PROCESS_GRAPH;
        stageRoute = routePayload?.stageRoute || deriveStageRouteFromGraph(processGraph);
      }
      await OrderService.upsertMetalProcessCatalogItem(
        article,
        name,
        isActive,
        stageRoute,
        processGraph,
        category,
      );
      await loadMetalProcessData();
    } catch (e) {
      setError(explainRpcMissing(e));
    } finally {
      setMetalProcessActionKey("");
      setMetalProcessCatalogLoading(false);
    }
  }, [canManageOrders, explainRpcMissing, loadMetalProcessData, setError]);

  const upsertMetalCatalogCategory = useCallback(async (name, payload = {}) => {
    if (!canManageOrders) return;
    const categoryName = String(name || "").trim();
    if (!categoryName) return;
    setMetalProcessActionKey(`catalog:category:${categoryName}`);
    setMetalProcessCatalogLoading(true);
    setError("");
    try {
      await OrderService.upsertMetalCatalogCategory(categoryName, payload);
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
            await OrderService.upsertMetalProcessCatalogItem(
              fallbackArticle,
              fallbackName,
              false,
              DEFAULT_ROUTE,
              DEFAULT_PROCESS_GRAPH,
            );
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
    metalCatalogOptionRows,
    metalCatalogCategories,
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
    receiveMetalFinished,
    upsertMetalCatalogItem,
    upsertMetalCatalogCategory,
    deleteMetalCatalogItem,
  };
}
