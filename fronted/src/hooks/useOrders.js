import { useMemo, useState, useCallback, useEffect } from "react";
import { OrderService } from "../services/orderService";
import { matchesWeekFilter } from "../app/weekFilterUtils";
import { orderCountsTowardStrapDemand } from "../app/workshopStrapNeeds";
import { orderMatchesWorkshopQrScan } from "../app/workshopQrSearchHelpers";

export function useOrders({
  autoLoad = true
} = {}) {
  const [tab, setTab] = useState("all");
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [workshopQrScan, setWorkshopQrScan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await OrderService.getAllOrders();
      // Ensure data is an array
      const ordersData = Array.isArray(data) ? data : [];
      setRows(ordersData);
    } catch (err) {
      setError(err.message);
      console.error('Failed to load orders:', err);
      setRows([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOrdersByStage = useCallback(async (stage) => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await OrderService.getOrdersByStage(stage);
      // Ensure data is an array
      const ordersData = Array.isArray(data) ? data : [];
      setRows(ordersData);
    } catch (err) {
      setError(err.message);
      console.error(`Failed to load orders for stage ${stage}:`, err);
      setRows([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoLoad) {
      loadOrders();
    }
  }, [autoLoad, loadOrders]);

  return {
    tab,
    setTab,
    rows,
    setRows,
    query,
    setQuery,
    workshopQrScan,
    setWorkshopQrScan,
    loading,
    setLoading,
    error,
    loadOrders,
    loadOrdersByStage,
    refetch: loadOrders
  };
}

export function useWorkshopRows({
  filtered = [],
  view = "",
  tab = "all",
  isDone = () => false,
  isInWork = () => false,
  getOverviewLaneId = () => "",
  isOrderCustomerShipped = () => false,
} = {}) {
  return useMemo(() => {
    /** На «Склад обвязки» нужен тот же набор заказов, что в цеху при вкладке «Все» — для колонки нехватки. */
    const strapStockPlanning = view === "strapStock";
    if ((view !== "workshop" && !strapStockPlanning) || tab === "stats" || tab === "debt") return [];
    const effectiveTab = strapStockPlanning ? "all" : tab;
    const arr = [...filtered].filter((o) => {
      const pilkaStatus = String(o.pilkaStatus || o.pilka || "");
      const kromkaStatus = String(o.kromkaStatus || o.kromka || "");
      const prasStatus = String(o.prasStatus || o.pras || "");
      const assemblyStatus = String(o.assemblyStatus || "");
      const overallStatus = String(o.overallStatus || o.overall || "");
      const pilkaDone = isDone(pilkaStatus);
      const kromkaDone = isDone(kromkaStatus);
      const prasDone = isDone(prasStatus);
      const assemblyDone = isDone(assemblyStatus);
      const shipped = isOrderCustomerShipped(o);
      const onPackaging = /упаков/i.test(overallStatus);
      const lane = getOverviewLaneId(o);
      if (effectiveTab === "pilka") return lane === "pilka";
      if (effectiveTab === "kromka") return lane === "kromka";
      if (effectiveTab === "pras") return lane === "pras";
      if (effectiveTab === "assembly") return pilkaDone && kromkaDone && prasDone && !assemblyDone && !shipped;
      if (effectiveTab === "done") return assemblyDone && !onPackaging && !shipped && lane !== "warehouse_kit";
      return true;
    });
    const list = strapStockPlanning ? arr.filter(orderCountsTowardStrapDemand) : arr;
    const isPaused = (status) => /пауза/i.test(String(status || ""));
    const isRowPaused = (o) => {
      if (effectiveTab === "pilka") return isPaused(o.pilkaStatus);
      if (effectiveTab === "kromka") return isPaused(o.kromkaStatus);
      if (effectiveTab === "pras") return isPaused(o.prasStatus);
      if (effectiveTab === "assembly") return isPaused(o.assemblyStatus);
      if (effectiveTab === "done") return false;
      return isPaused(o.pilkaStatus) || isPaused(o.kromkaStatus) || isPaused(o.prasStatus) || isPaused(o.assemblyStatus);
    };
    const isRowInWork = (o) => {
      if (effectiveTab === "pilka") return isInWork(o.pilkaStatus);
      if (effectiveTab === "kromka") return isInWork(o.kromkaStatus);
      if (effectiveTab === "pras") return isInWork(o.prasStatus);
      if (effectiveTab === "assembly") return isInWork(o.assemblyStatus);
      if (effectiveTab === "done") return false;
      return isInWork(o.pilkaStatus) || isInWork(o.kromkaStatus) || isInWork(o.prasStatus);
    };
    list.sort((a, b) => {
      const aw = isRowInWork(a) ? 1 : 0;
      const bw = isRowInWork(b) ? 1 : 0;
      if (aw !== bw) return bw - aw;
      const ap = isRowPaused(a) ? 1 : 0;
      const bp = isRowPaused(b) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return String(a.item || "").localeCompare(String(b.item || ""), "ru");
    });
    return list;
  }, [filtered, getOverviewLaneId, isDone, isInWork, isOrderCustomerShipped, tab, view]);
}

export function useBaseOrderFilter({
  rows = [],
  view = "",
  tab = "all",
  query = "",
  weekFilter = "all",
  workshopQrScan = null,
  getOverviewLaneId = () => "",
  isStorageLikeName = () => false,
  isObvyazkaSectionName = () => false,
  isGarbageShipmentItemName = () => false,
} = {}) {
  return useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    function hasArticleLikeCode(row) {
      const raw = String(
        row?.article_code ||
          row?.articleCode ||
          row?.article ||
          row?.mapped_article_code ||
          row?.mappedArticleCode ||
          "",
      ).trim();
      if (!raw) return false;
      const compact = raw.replace(/\s+/g, "");
      return /^[A-Za-z0-9][A-Za-z0-9._-]{2,}$/.test(compact);
    }
    return rows.filter((x) => {
      if (view === "stats") {
        const byWeek = matchesWeekFilter(x.week, weekFilter);
        const byQuery =
          !q ||
          String(x.item || "").toLowerCase().includes(q) ||
          String(x.orderId || x.order_id || "").toLowerCase().includes(q);
        return byWeek && byQuery;
      }
      // Скрываем тех/мусорные позиции во вкладках заказов (Производство/Обзор/Статистика).
      const sectionName = String(x.section_name || x.sectionName || "").trim();
      const sourceRowId = String(x.source_row_id || x.sourceRowId || "").trim();
      const storageLike = isStorageLikeName(x.item);
      const allowInWorkshop = view === "workshop" && storageLike;
      const allowInStats = view === "stats" && storageLike;
      const laneId = String(getOverviewLaneId(x) || "");
      const inWorkStage =
        /в работе/i.test(String(x.pilkaStatus || x.pilka_status || x.pilka || "")) ||
        /в работе/i.test(String(x.kromkaStatus || x.kromka_status || x.kromka || "")) ||
        /в работе/i.test(String(x.prasStatus || x.pras_status || x.pras || "")) ||
        /в работе/i.test(String(x.assemblyStatus || x.assembly_status || ""));
      const inActiveProductionLane = laneId && laneId !== "ready_to_ship" && laneId !== "shipped";
      const allowInOverviewInWork = view === "overview" && storageLike && (inWorkStage || inActiveProductionLane);
      const allowStorageLike =
        allowInWorkshop ||
        allowInStats ||
        allowInOverviewInWork ||
        (storageLike &&
          (isObvyazkaSectionName(sectionName) || sourceRowId.startsWith("manual:") || hasArticleLikeCode(x)));
      if ((storageLike && !allowStorageLike) || isGarbageShipmentItemName(x.item)) return false;
      const byWeek = matchesWeekFilter(x.week, weekFilter);
      const qrMatch =
        view === "workshop" &&
        workshopQrScan &&
        (tab === "kromka" || tab === "pras")
          ? orderMatchesWorkshopQrScan(x, workshopQrScan)
          : true;
      const byQuery =
        workshopQrScan && view === "workshop" && (tab === "kromka" || tab === "pras")
          ? qrMatch
          : !q ||
            String(x.item || "").toLowerCase().includes(q) ||
            String(x.orderId || x.order_id || "").toLowerCase().includes(q);
      if (!byWeek || !byQuery) return false;
      if (view === "stats" || view === "overview") return true;
      // Производство: те же «дорожки», что и в «Обзор заказов» (pipeline), иначе вкладки и канбан расходятся.
      if (tab === "pilka") return getOverviewLaneId(x) === "pilka";
      if (tab === "kromka") return getOverviewLaneId(x) === "kromka";
      if (tab === "pras") return getOverviewLaneId(x) === "pras";
      return true;
    });
  }, [
    getOverviewLaneId,
    isGarbageShipmentItemName,
    isObvyazkaSectionName,
    isStorageLikeName,
    query,
    rows,
    tab,
    view,
    weekFilter,
    workshopQrScan,
  ]);
}

export function useLaborFilter({
  laborRows = [],
  query = "",
  weekFilter = "all",
} = {}) {
  return useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return laborRows.filter((x) => {
      const byWeek = matchesWeekFilter(x.week, weekFilter);
      const byQuery =
        !q ||
        String(x.item || "").toLowerCase().includes(q) ||
        String(x.order_id || x.orderId || "").toLowerCase().includes(q);
      return byWeek && byQuery;
    });
  }, [laborRows, query, weekFilter]);
}

export function useSheetMirrorFilter({
  rows = [],
  query = "",
} = {}) {
  return useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return rows.filter((x) => {
      const byQuery =
        !q ||
        String(x.item_label || x.itemLabel || "").toLowerCase().includes(q) ||
        String(x.article_code || x.articleCode || "").toLowerCase().includes(q) ||
        String(x.order_code || x.orderCode || "").toLowerCase().includes(q) ||
        String(x.material_raw || x.materialRaw || "").toLowerCase().includes(q);
      return byQuery;
    });
  }, [query, rows]);
}

export function isOrdersDomainView(view) {
  return !["shipment", "sheetMirror", "warehouse", "labor", "furniture", "metal", "metalProcess"].includes(String(view || ""));
}

function mergeOrdersById(chunks) {
  const byId = new Map();
  for (const chunk of chunks) {
    if (!Array.isArray(chunk)) continue;
    for (const row of chunk) {
      const id = String(row?.order_id || row?.orderId || "").trim();
      if (id) byId.set(id, row);
    }
  }
  return Array.from(byId.values());
}

export async function fetchOrdersStagedFallback() {
  const [pilka, kromka, pras, shipped, postWorkshop] = await Promise.all([
    OrderService.getOrdersByStage("pilka").catch(() => []),
    OrderService.getOrdersByStage("kromka").catch(() => []),
    OrderService.getOrdersByStage("pras").catch(() => []),
    OrderService.getOrdersByStage("shipped").catch(() => []),
    OrderService.getOrdersByStage("post_workshop").catch(() => []),
  ]);
  const merged = mergeOrdersById([pilka, kromka, pras, shipped, postWorkshop]);
  if (merged.length) return merged;
  throw new Error("Не удалось загрузить заказы по этапам");
}

export async function fetchAllOrdersWithRetry(options = {}) {
  const maxAttempts = Number(options.maxAttempts ?? 2);
  const preferStaged = options.preferStaged !== false;

  if (preferStaged) {
    try {
      const staged = await fetchOrdersStagedFallback();
      if (staged.length) return staged;
    } catch (_) {
      /* fall through to full list */
    }
  }

  let lastError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await OrderService.getAllOrders();
    } catch (e) {
      lastError = e;
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
  }

  if (!preferStaged) {
    try {
      return await fetchOrdersStagedFallback();
    } catch (stagedError) {
      throw lastError || stagedError || new Error("NETWORK_UNAVAILABLE");
    }
  }

  throw lastError || new Error("NETWORK_UNAVAILABLE");
}

export async function loadOrdersDomainData({ view }) {
  if (view === "stats") {
    try {
      return await OrderService.getOrderStats();
    } catch (_) {
      return fetchAllOrdersWithRetry({ preferStaged: false, maxAttempts: 3 });
    }
  }
  return fetchAllOrdersWithRetry({ preferStaged: true, maxAttempts: 1 });
}

export async function loadShipmentBoardPayload({
  normalizeShipmentBoard,
  mergeShipmentBoardWithTable,
}) {
  const [
    boardDataResult,
    tableDataResult,
    catalogDataResult,
    sectionsDataResult,
    articlesDataResult,
    detailArticlesResult,
    templatesResult,
    stockDataResult,
  ] = await Promise.all([
    OrderService.getShipmentBoard().catch(() => null),
    OrderService.getShipmentTable().catch(() => null),
    OrderService.getPlanCatalog().catch(() => null),
    OrderService.getSectionCatalog().catch(() => null),
    OrderService.getSectionArticles().catch(() => null),
    OrderService.getFurnitureDetailArticles().catch(() => null),
    OrderService.getFurnitureCustomTemplates().catch(() => null),
    OrderService.getMaterialsStock().catch(() => null),
  ]);

  let data = normalizeShipmentBoard(boardDataResult ?? tableDataResult);
  if (boardDataResult != null && tableDataResult != null) {
    try {
      data = mergeShipmentBoardWithTable(data, tableDataResult);
    } catch (_) {
      // keep shipment board data if merge fails
    }
  }

  return {
    data,
    planCatalogRows: Array.isArray(catalogDataResult) ? catalogDataResult : [],
    sectionCatalogRows: Array.isArray(sectionsDataResult) ? sectionsDataResult : [],
    sectionArticleRows: Array.isArray(articlesDataResult) ? articlesDataResult : [],
    furnitureDetailArticleRows: Array.isArray(detailArticlesResult) ? detailArticlesResult : [],
    furnitureCustomTemplates: Array.isArray(templatesResult) ? templatesResult : [],
    materialsStockRows: Array.isArray(stockDataResult) ? stockDataResult : [],
  };
}

export async function loadShipmentOrdersPayload({ normalizeOrder }) {
  const shipmentOrdersDataResult = await fetchAllOrdersWithRetry(2).catch(() => null);
  return Array.isArray(shipmentOrdersDataResult)
    ? shipmentOrdersDataResult.map(normalizeOrder)
    : [];
}

export async function loadShipmentDomainData({
  normalizeShipmentBoard,
  mergeShipmentBoardWithTable,
  normalizeOrder,
}) {
  const [boardPayload, shipmentOrders] = await Promise.all([
    loadShipmentBoardPayload({ normalizeShipmentBoard, mergeShipmentBoardWithTable }),
    loadShipmentOrdersPayload({ normalizeOrder }),
  ]);

  return {
    ...boardPayload,
    shipmentOrders,
  };
}

function filterPilkaDoneAuditRows(auditData) {
  const auditRows = Array.isArray(auditData) ? auditData : [];
  return auditRows.filter((row) => {
    const details = row?.details && typeof row.details === "object" ? row.details : {};
    const stage = String(details?.stage || details?.p_stage || "").trim().toLowerCase();
    const status = String(
      details?.status ||
        details?.new_status ||
        details?.to_status ||
        details?.p_status ||
        "",
    )
      .trim()
      .toLowerCase();
    return stage === "pilka" && status === "done";
  });
}

export async function loadWarehouseDomainData() {
  const [
    data,
    leftoversData,
    leftoversHistoryData,
    consumeHistoryData,
    auditData,
    ordersData,
    consumeResolveBoard,
    tplRaw,
  ] = await Promise.all([
    OrderService.getMaterialsStock(),
    OrderService.getLeftovers().catch(() => null),
    OrderService.getLeftoversHistory(500).catch(() => null),
    OrderService.getConsumeHistory(300).catch(() => null),
    OrderService.getAuditLog({
      limit: 1000,
      offset: 0,
      action: "set_stage",
      entity: "orders",
    }).catch(() => null),
    OrderService.getAllOrders().catch(() => null),
    OrderService.getShipmentBoard().catch(() => null),
    OrderService.getFurnitureCustomTemplates().catch(() => null),
  ]);

  const leftoversRows = Array.isArray(leftoversData) ? leftoversData : [];
  const leftoversHistoryRows = Array.isArray(leftoversHistoryData) ? leftoversHistoryData : [];
  const consumeHistoryRows = Array.isArray(consumeHistoryData) ? consumeHistoryData : [];
  let pilkaDoneHistoryRows = filterPilkaDoneAuditRows(auditData);
  const ordersSnapshot = Array.isArray(ordersData) ? ordersData : [];
  const consumeResolveTemplates = Array.isArray(tplRaw) ? tplRaw : [];

  const existingIds = new Set(
    pilkaDoneHistoryRows.map((row) => String(row?.entity_id || row?.entityId || "").trim()).filter(Boolean),
  );
  const fallbackRows = ordersSnapshot
    .filter((row) => {
      const orderId = String(row?.order_id || row?.orderId || "").trim();
      if (!orderId || existingIds.has(orderId)) return false;
      return Boolean(row?.pilka_done_at || row?.pilkaDoneAt);
    })
    .map((row) => ({
      id: `fallback:${String(row?.order_id || row?.orderId || "").trim()}`,
      created_at: String(row?.pilka_done_at || row?.pilkaDoneAt || row?.updated_at || row?.updatedAt || ""),
      action: "set_stage",
      entity: "orders",
      entity_id: String(row?.order_id || row?.orderId || "").trim(),
      details: {
        stage: "pilka",
        status: "done",
        material: String(row?.material || "").trim(),
        item: String(row?.item || "").trim(),
        week: String(row?.week || "").trim(),
        qty: Number(row?.qty || 0),
        source_row_id: String(row?.source_row_id || row?.sourceRowId || "").trim(),
        sheets_needed: Number(row?.sheets_needed ?? row?.sheetsNeeded ?? 0),
        source: "orders_fallback",
      },
    }));
  pilkaDoneHistoryRows = [...pilkaDoneHistoryRows, ...fallbackRows];

  const orderById = new Map(
    ordersSnapshot
      .map((o) => [String(o?.order_id || o?.orderId || "").trim(), o])
      .filter(([id]) => Boolean(id)),
  );
  pilkaDoneHistoryRows = pilkaDoneHistoryRows.map((row) => {
    const oid = String(row?.entity_id || row?.entityId || "").trim();
    const o = orderById.get(oid);
    if (!o || !row?.details || typeof row.details !== "object") return row;
    const d = row.details;
    const merged = {
      ...d,
      material: String(d.material || o.material || "").trim(),
      item: String(d.item || o.item || "").trim(),
      week: String(d.week || o.week || "").trim(),
      qty: Number(d.qty ?? o.qty ?? 0),
      source_row_id: String(d.source_row_id || d.sourceRowId || o.source_row_id || o.sourceRowId || "").trim(),
      sheets_needed: Number(d.sheets_needed ?? d.sheetsNeeded ?? o.sheets_needed ?? o.sheetsNeeded ?? 0) || 0,
    };
    return { ...row, details: merged };
  });

  return {
    data,
    materialsStockRows: Array.isArray(data) ? data : [],
    leftoversRows,
    leftoversHistoryRows,
    consumeHistoryRows,
    pilkaDoneHistoryRows,
    consumeResolveOrders: ordersSnapshot,
    consumeResolveBoard,
    consumeResolveTemplates,
  };
}

export async function loadFurnitureDomainData() {
  const [mappingData, detailArticles, templates] = await Promise.all([
    OrderService.getFurnitureProductArticles().catch(() => null),
    OrderService.getFurnitureDetailArticles().catch(() => null),
    OrderService.getFurnitureCustomTemplates().catch(() => null),
  ]);

  return {
    data: [],
    furnitureArticleRows: Array.isArray(mappingData) ? mappingData : [],
    furnitureDetailArticleRows: Array.isArray(detailArticles) ? detailArticles : [],
    furnitureCustomTemplates: Array.isArray(templates) ? templates : [],
  };
}

export function useShipmentFilter({
  shipmentBoard = { sections: [] },
  shipmentOrderMaps = null,
  query = "",
  weekFilter = "all",
  isStorageLikeName = () => false,
  isObvyazkaSectionName = () => false,
  isGarbageShipmentItemName = () => false,
  getShipmentStageKey = () => "awaiting",
  passesShipmentStageFilter = () => true,
} = {}) {
  return useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    const isStorageSystemSection = (name) => /система\s*хранения/i.test(String(name || ""));
    return (shipmentBoard.sections || [])
      .filter((s) => {
        if (!isStorageLikeName(s.name)) return true;
        // Keep dedicated storage system section visible in shipment plan.
        return isStorageSystemSection(s.name) || isObvyazkaSectionName(s.name);
      })
      .map((s) => ({
        ...s,
        items: (s.items || []).filter((it) => {
          if (isStorageLikeName(it.item) && !isObvyazkaSectionName(s.name)) return false;
          if (isGarbageShipmentItemName(it.item)) return false;
          const sourceRow = it.sourceRowId != null ? String(it.sourceRowId) : String(it.row);
          const visibleCells = (it.cells || []).filter((c) => {
            const qtyOk = (Number(c.qty) || 0) > 0;
            if (!qtyOk) return false;
            const stageKey = getShipmentStageKey(c, sourceRow, shipmentOrderMaps, it.item, it.material);
            return passesShipmentStageFilter(stageKey);
          });
          const byWeek = visibleCells.some((c) => matchesWeekFilter(c.week, weekFilter));
          const byQuery = !q || String(it.item || "").toLowerCase().includes(q);
          return byWeek && byQuery && visibleCells.length > 0;
        }),
      }))
      .filter((s) => s.items.length > 0);
  }, [
    getShipmentStageKey,
    isGarbageShipmentItemName,
    isObvyazkaSectionName,
    isStorageLikeName,
    passesShipmentStageFilter,
    query,
    shipmentBoard.sections,
    shipmentOrderMaps,
    weekFilter,
  ]);
}
