import { useMemo, useState, useCallback, useEffect } from "react";
import { OrderService } from "../services/orderService";

export function useOrders({
  autoLoad = true
} = {}) {
  const [tab, setTab] = useState("all");
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
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
    if (view !== "workshop" || tab === "stats") return [];
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
      if (tab === "pilka") return lane === "pilka";
      if (tab === "kromka") return lane === "kromka";
      if (tab === "pras") return lane === "pras";
      if (tab === "assembly") return pilkaDone && kromkaDone && prasDone && !assemblyDone && !shipped;
      if (tab === "done") return assemblyDone && !onPackaging && !shipped;
      return true;
    });
    const isRowInWork = (o) => {
      if (tab === "pilka") return isInWork(o.pilkaStatus);
      if (tab === "kromka") return isInWork(o.kromkaStatus);
      if (tab === "pras") return isInWork(o.prasStatus);
      if (tab === "assembly") return isInWork(o.assemblyStatus);
      if (tab === "done") return false;
      return isInWork(o.pilkaStatus) || isInWork(o.kromkaStatus) || isInWork(o.prasStatus);
    };
    arr.sort((a, b) => {
      const aw = isRowInWork(a) ? 1 : 0;
      const bw = isRowInWork(b) ? 1 : 0;
      if (aw !== bw) return bw - aw;
      return String(a.item || "").localeCompare(String(b.item || ""), "ru");
    });
    return arr;
  }, [filtered, getOverviewLaneId, isDone, isInWork, isOrderCustomerShipped, tab, view]);
}

export function useBaseOrderFilter({
  rows = [],
  view = "",
  tab = "all",
  query = "",
  weekFilter = "all",
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
        const byWeek = weekFilter === "all" || String(x.week || "") === weekFilter;
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
      const allowStorageLike =
        allowInWorkshop ||
        allowInStats ||
        (storageLike &&
          (isObvyazkaSectionName(sectionName) || sourceRowId.startsWith("manual:") || hasArticleLikeCode(x)));
      if ((storageLike && !allowStorageLike) || isGarbageShipmentItemName(x.item)) return false;
      const byWeek = weekFilter === "all" || String(x.week || "") === weekFilter;
      const byQuery =
        !q ||
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
      const byWeek = weekFilter === "all" || String(x.week || "") === weekFilter;
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
  return !["shipment", "sheetMirror", "warehouse", "labor", "furniture"].includes(String(view || ""));
}

export async function loadOrdersDomainData({ view, callBackend }) {
  if (view === "overview") {
    return callBackend("webGetOrdersAll");
  }
  if (view === "stats") {
    try {
      return await callBackend("webGetOrderStats");
    } catch (_) {
      return callBackend("webGetOrdersAll");
    }
  }
  // Для согласованности с "Обзор заказов" всегда берем полный список
  // и уже на фронте раскладываем по табам этапов.
  return callBackend("webGetOrdersAll");
}

export async function loadShipmentDomainData({
  callBackend,
  normalizeShipmentBoard,
  mergeShipmentBoardWithTable,
  normalizeOrder,
}) {
  let boardData;
  try {
    boardData = await callBackend("webGetShipmentBoard");
  } catch (_) {
    boardData = await callBackend("webGetShipmentTable");
  }
  let data = normalizeShipmentBoard(boardData);
  try {
    const tableData = await callBackend("webGetShipmentTable");
    data = mergeShipmentBoardWithTable(data, tableData);
  } catch (_) {
    // keep shipment board data if table snapshot is unavailable
  }

  let planCatalogRows = [];
  try {
    const catalogData = await callBackend("webGetPlanCatalog");
    planCatalogRows = Array.isArray(catalogData) ? catalogData : [];
  } catch (_) {}

  let sectionCatalogRows = [];
  try {
    const sectionsData = await callBackend("webGetSectionCatalog");
    sectionCatalogRows = Array.isArray(sectionsData) ? sectionsData : [];
  } catch (_) {}

  let sectionArticleRows = [];
  try {
    const articlesData = await callBackend("webGetSectionArticles");
    sectionArticleRows = Array.isArray(articlesData) ? articlesData : [];
  } catch (_) {}

  let shipmentOrders = [];
  try {
    const shipmentOrdersData = await callBackend("webGetOrdersAll");
    shipmentOrders = Array.isArray(shipmentOrdersData) ? shipmentOrdersData.map(normalizeOrder) : [];
  } catch (_) {}

  let furnitureDetailArticleRows = [];
  try {
    const detailArticles = await callBackend("webGetFurnitureDetailArticles");
    furnitureDetailArticleRows = Array.isArray(detailArticles) ? detailArticles : [];
  } catch (_) {}

  let materialsStockRows = [];
  try {
    const stockData = await callBackend("webGetMaterialsStock");
    materialsStockRows = Array.isArray(stockData) ? stockData : [];
  } catch (_) {}

  return {
    data,
    planCatalogRows,
    sectionCatalogRows,
    sectionArticleRows,
    shipmentOrders,
    furnitureDetailArticleRows,
    materialsStockRows,
  };
}

export async function loadWarehouseDomainData({ callBackend }) {
  const data = await callBackend("webGetMaterialsStock");
  let leftoversRows = [];
  try {
    const leftoversData = await callBackend("webGetLeftovers");
    leftoversRows = Array.isArray(leftoversData) ? leftoversData : [];
  } catch (_) {}
  return {
    data,
    materialsStockRows: Array.isArray(data) ? data : [],
    leftoversRows,
  };
}

export async function loadFurnitureDomainData({ callBackend }) {
  let furnitureArticleRows = [];
  try {
    const mappingData = await callBackend("webGetFurnitureProductArticles");
    furnitureArticleRows = Array.isArray(mappingData) ? mappingData : [];
  } catch (_) {}

  let furnitureDetailArticleRows = [];
  try {
    const detailArticles = await callBackend("webGetFurnitureDetailArticles");
    furnitureDetailArticleRows = Array.isArray(detailArticles) ? detailArticles : [];
  } catch (_) {}

  return {
    data: [],
    furnitureArticleRows,
    furnitureDetailArticleRows,
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
    return (shipmentBoard.sections || [])
      .filter((s) => !isStorageLikeName(s.name))
      .map((s) => ({
        ...s,
        items: (s.items || []).filter((it) => {
          if (isStorageLikeName(it.item) && !isObvyazkaSectionName(s.name)) return false;
          if (isGarbageShipmentItemName(it.item)) return false;
          const sourceRow = it.sourceRowId != null ? String(it.sourceRowId) : String(it.row);
          const visibleCells = (it.cells || []).filter((c) => {
            const qtyOk = (Number(c.qty) || 0) > 0;
            if (!qtyOk) return false;
            const stageKey = getShipmentStageKey(c, sourceRow, shipmentOrderMaps, it.item);
            return passesShipmentStageFilter(stageKey);
          });
          const byWeek = weekFilter === "all" || visibleCells.some((c) => String(c.week || "") === weekFilter);
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
