import { useCallback, useEffect, useRef } from "react";
import { OrderService } from "../services/orderService";
import { partitionDomains, preferStagedOrdersReloadForView } from "../app/domainReload";
import { reconcileOrderSnapshot } from "../app/orderSnapshotGuard";
import { getViewCache, setViewCache } from "./viewCache";
import {
  loadOrdersDomainData,
  loadShipmentBoardPayload,
  loadShipmentOrdersPayload,
  loadShipmentDomainData,
  loadWarehouseDomainData,
  loadFurnitureDomainData,
  isOrdersDomainView,
} from "./useOrders";

async function loadOrdersWithCacheFallback({ view, callBackend, preferStaged }) {
  try {
    return await loadOrdersDomainData({ view, callBackend, preferStaged });
  } catch (e) {
    const overviewCache = getViewCache("overview");
    const shipmentCache = getViewCache("shipment");
    const cachedOrders =
      (Array.isArray(overviewCache?.rows) && overviewCache.rows.length ? overviewCache.rows : null)
      || (Array.isArray(shipmentCache?.shipmentOrders) && shipmentCache.shipmentOrders.length
        ? shipmentCache.shipmentOrders
        : null);
    if (cachedOrders?.length) {
      return cachedOrders;
    }
    throw e;
  }
}

function readCachedOrderRows() {
  const overviewCache = getViewCache("overview");
  const shipmentCache = getViewCache("shipment");
  if (Array.isArray(overviewCache?.rows) && overviewCache.rows.length) return overviewCache.rows;
  if (Array.isArray(shipmentCache?.shipmentOrders) && shipmentCache.shipmentOrders.length) {
    return shipmentCache.shipmentOrders;
  }
  return [];
}

function clearViewState(view, setters) {
  const {
    setRows,
    setShipmentBoard,
    setWarehouseRows,
    setLeftoversRows,
    setLeftoversHistoryRows,
    setConsumeHistoryRows,
    setPilkaDoneHistoryRows,
    setLaborRows,
  } = setters;
  if (view === "workshop" || view === "floorMap") setRows([]);
  if (view === "shipment") setShipmentBoard({ sections: [] });
  if (view === "warehouse") {
    setWarehouseRows([]);
    setLeftoversRows([]);
    setLeftoversHistoryRows([]);
    setConsumeHistoryRows([]);
    setPilkaDoneHistoryRows([]);
  }
  if (view === "labor") setLaborRows([]);
}

function applyViewSnapshot(view, snapshot, setters) {
  if (!snapshot || typeof snapshot !== "object") return false;
  const {
    setRows,
    setShipmentBoard,
    setPlanCatalogRows,
    setSectionCatalogRows,
    setSectionArticleRows,
    setShipmentOrders,
    setFurnitureDetailArticleRows,
    setFurnitureCustomTemplates,
    setMaterialsStockRows,
    setLeftoversRows,
    setLeftoversHistoryRows,
    setConsumeHistoryRows,
    setPilkaDoneHistoryRows,
    setWarehouseRows,
    setLaborRows,
    setFurnitureArticleRows,
  } = setters;
  if (view === "shipment") {
    setShipmentBoard(snapshot.shipmentBoard || { sections: [] });
    setPlanCatalogRows(snapshot.planCatalogRows || []);
    setSectionCatalogRows(snapshot.sectionCatalogRows || []);
    setSectionArticleRows(snapshot.sectionArticleRows || []);
    setShipmentOrders(snapshot.shipmentOrders || []);
    setFurnitureDetailArticleRows(snapshot.furnitureDetailArticleRows || []);
    if (typeof setFurnitureCustomTemplates === "function") {
      setFurnitureCustomTemplates(snapshot.furnitureCustomTemplates || []);
    }
    setMaterialsStockRows(snapshot.materialsStockRows || []);
    return true;
  }
  if (view === "warehouse") {
    setWarehouseRows(snapshot.warehouseRows || []);
    setMaterialsStockRows(snapshot.materialsStockRows || []);
    setLeftoversRows(snapshot.leftoversRows || []);
    setLeftoversHistoryRows(snapshot.leftoversHistoryRows || []);
    setConsumeHistoryRows(snapshot.consumeHistoryRows || []);
    setPilkaDoneHistoryRows(snapshot.pilkaDoneHistoryRows || []);
    if (snapshot.consumeResolveBoard) {
      setShipmentBoard(snapshot.consumeResolveBoard);
    }
    if (Array.isArray(snapshot.consumeResolveOrders)) {
      setShipmentOrders(snapshot.consumeResolveOrders);
    }
    if (typeof setFurnitureCustomTemplates === "function" && Array.isArray(snapshot.consumeResolveTemplates)) {
      setFurnitureCustomTemplates(snapshot.consumeResolveTemplates);
    }
    return true;
  }
  if (view === "labor") {
    setLaborRows(snapshot.laborRows || []);
    return true;
  }
  if (view === "furniture") {
    setRows(snapshot.rows || []);
    setFurnitureArticleRows(snapshot.furnitureArticleRows || []);
    setFurnitureDetailArticleRows(snapshot.furnitureDetailArticleRows || []);
    if (typeof setFurnitureCustomTemplates === "function") {
      setFurnitureCustomTemplates(snapshot.furnitureCustomTemplates || []);
    }
    return true;
  }
  if (snapshot.rows) {
    setRows(snapshot.rows || []);
    if (Array.isArray(snapshot.shipmentOrders)) {
      setShipmentOrders(snapshot.shipmentOrders);
    }
    if (view === "workshop" || view === "floorMap" || view === "overview") {
      if (snapshot.shipmentBoard) {
        setShipmentBoard(snapshot.shipmentBoard);
      }
      if (view === "workshop" || view === "floorMap") {
        if (typeof setFurnitureCustomTemplates === "function" && Array.isArray(snapshot.furnitureCustomTemplates)) {
          setFurnitureCustomTemplates(snapshot.furnitureCustomTemplates);
        }
        setFurnitureDetailArticleRows(
          Array.isArray(snapshot.furnitureDetailArticleRows) ? snapshot.furnitureDetailArticleRows : [],
        );
      }
    }
    return true;
  }
  return false;
}

function buildViewSnapshot({
  view,
  data,
  shipmentPayload,
  warehousePayload,
  furniturePayload,
  normalizedRows,
  workshopBoard,
  overviewBoard,
  workshopTemplates,
  workshopDetailArticles,
}) {
  if (view === "shipment") {
    return {
      shipmentBoard: data,
      planCatalogRows: shipmentPayload?.planCatalogRows || [],
      sectionCatalogRows: shipmentPayload?.sectionCatalogRows || [],
      sectionArticleRows: shipmentPayload?.sectionArticleRows || [],
      shipmentOrders: shipmentPayload?.shipmentOrders || [],
      furnitureDetailArticleRows: shipmentPayload?.furnitureDetailArticleRows || [],
      furnitureCustomTemplates: shipmentPayload?.furnitureCustomTemplates || [],
      materialsStockRows: shipmentPayload?.materialsStockRows || [],
    };
  }
  if (view === "warehouse") {
    return {
      warehouseRows: Array.isArray(data) ? data : [],
      materialsStockRows: warehousePayload?.materialsStockRows || [],
      leftoversRows: warehousePayload?.leftoversRows || [],
      leftoversHistoryRows: warehousePayload?.leftoversHistoryRows || [],
      consumeHistoryRows: warehousePayload?.consumeHistoryRows || [],
      pilkaDoneHistoryRows: warehousePayload?.pilkaDoneHistoryRows || [],
      consumeResolveOrders: warehousePayload?.consumeResolveOrders || [],
      consumeResolveBoard: warehousePayload?.consumeResolveBoard || null,
      consumeResolveTemplates: warehousePayload?.consumeResolveTemplates || [],
    };
  }
  if (view === "labor") {
    return { laborRows: Array.isArray(data) ? data : [] };
  }
  if (view === "furniture") {
    return {
      rows: Array.isArray(data) ? data : [],
      furnitureArticleRows: furniturePayload?.furnitureArticleRows || [],
      furnitureDetailArticleRows: furniturePayload?.furnitureDetailArticleRows || [],
      furnitureCustomTemplates: furniturePayload?.furnitureCustomTemplates || [],
    };
  }
  if (Array.isArray(normalizedRows)) {
    const snap = {
      rows: normalizedRows,
      shipmentOrders: view === "workshop" || view === "floorMap" || view === "overview" || view === "stats" ? normalizedRows : null,
      shipmentBoard: workshopBoard || null,
      furnitureCustomTemplates: workshopTemplates || [],
    };
    if (view === "overview" && overviewBoard) {
      snap.shipmentBoard = overviewBoard;
    }
    if (view === "workshop" || view === "floorMap") {
      snap.furnitureDetailArticleRows = Array.isArray(workshopDetailArticles) ? workshopDetailArticles : [];
    }
    return snap;
  }
  return null;
}

function createLoaderSetters({
  setRows,
  setShipmentBoard,
  setPlanCatalogRows,
  setSectionCatalogRows,
  setSectionArticleRows,
  setShipmentOrders,
  setFurnitureDetailArticleRows,
  setFurnitureCustomTemplates,
  setMaterialsStockRows,
  setLeftoversRows,
  setLeftoversHistoryRows,
  setConsumeHistoryRows,
  setPilkaDoneHistoryRows,
  setWarehouseRows,
  setLaborRows,
  setFurnitureArticleRows,
}) {
  return {
    setRows,
    setShipmentBoard,
    setPlanCatalogRows,
    setSectionCatalogRows,
    setSectionArticleRows,
    setShipmentOrders,
    setFurnitureDetailArticleRows,
    setFurnitureCustomTemplates,
    setMaterialsStockRows,
    setLeftoversRows,
    setLeftoversHistoryRows,
    setConsumeHistoryRows,
    setPilkaDoneHistoryRows,
    setWarehouseRows,
    setLaborRows,
    setFurnitureArticleRows,
  };
}

async function reloadOrdersDomain({
  view,
  seq,
  loadSeqRef,
  callBackend,
  preferStaged,
  preserveOnEmpty,
  normalizeOrder,
  normalizeShipmentBoard,
  setters,
}) {
  const data = await loadOrdersWithCacheFallback({ view, callBackend, preferStaged });
  if (seq !== loadSeqRef.current) return;
  const normalizedRows = Array.isArray(data) ? data.map(normalizeOrder) : [];
  setters.setRows((current) => reconcileOrderSnapshot(current, normalizedRows, { preserveOnEmpty }));
  if (view === "workshop" || view === "floorMap" || view === "overview" || view === "stats" || view === "shipment") {
    setters.setShipmentOrders((current) => reconcileOrderSnapshot(current, normalizedRows, { preserveOnEmpty }));
  }
  let workshopBoard = null;
  let workshopTemplates = [];
  let workshopDetailArticles = [];
  if (view === "workshop" || view === "floorMap" || view === "strapStock") {
    const [boardResult, templatesResult, detailArticlesResult] = await Promise.all([
      view === "workshop" || view === "floorMap" ? OrderService.getShipmentBoard().catch(() => null) : Promise.resolve(null),
      typeof setters.setFurnitureCustomTemplates === "function"
        ? OrderService.getFurnitureCustomTemplates().catch(() => null)
        : Promise.resolve(null),
      OrderService.getFurnitureDetailArticles().catch(() => null),
    ]);
    if (seq !== loadSeqRef.current) return;
    if ((view === "workshop" || view === "floorMap") && boardResult != null) {
      try {
        workshopBoard = normalizeShipmentBoard(boardResult);
        setters.setShipmentBoard(workshopBoard);
      } catch (_) {
        /* keep previous board */
      }
    }
    if (Array.isArray(templatesResult) && typeof setters.setFurnitureCustomTemplates === "function") {
      workshopTemplates = templatesResult;
      setters.setFurnitureCustomTemplates(templatesResult);
    }
    workshopDetailArticles = Array.isArray(detailArticlesResult) ? detailArticlesResult : [];
    setters.setFurnitureDetailArticleRows(workshopDetailArticles);
  }
  if (!preserveOnEmpty || normalizedRows.length > 0) {
    setViewCache(view, buildViewSnapshot({
      view,
      normalizedRows,
      workshopBoard,
      workshopTemplates,
      workshopDetailArticles,
    }));
  }
}

async function reloadShipmentDomain({
  view,
  seq,
  loadSeqRef,
  normalizeShipmentBoard,
  mergeShipmentBoardWithTable,
  normalizeOrder,
  setters,
}) {
  if (view === "shipment") {
    const boardPayload = await loadShipmentBoardPayload({
      normalizeShipmentBoard,
      mergeShipmentBoardWithTable,
    });
    if (seq !== loadSeqRef.current) return;
    const normalizedBoard = normalizeShipmentBoard(boardPayload.data);
    setters.setPlanCatalogRows(boardPayload.planCatalogRows || []);
    setters.setSectionCatalogRows(boardPayload.sectionCatalogRows || []);
    setters.setSectionArticleRows(boardPayload.sectionArticleRows || []);
    setters.setFurnitureDetailArticleRows(boardPayload.furnitureDetailArticleRows || []);
    if (typeof setters.setFurnitureCustomTemplates === "function") {
      setters.setFurnitureCustomTemplates(boardPayload.furnitureCustomTemplates || []);
    }
    setters.setMaterialsStockRows(boardPayload.materialsStockRows || []);
    setters.setShipmentBoard(normalizedBoard);
    setViewCache(view, buildViewSnapshot({
      view,
      data: normalizedBoard,
      shipmentPayload: { ...boardPayload, shipmentOrders: [] },
    }));

    const shipmentOrders = await loadShipmentOrdersPayload({ normalizeOrder });
    if (seq !== loadSeqRef.current) return;
    setters.setShipmentOrders(shipmentOrders);
    setViewCache(view, buildViewSnapshot({
      view,
      data: normalizedBoard,
      shipmentPayload: { ...boardPayload, shipmentOrders },
    }));
    return;
  }

  if (view === "overview") {
    const boardPayload = await loadShipmentBoardPayload({
      normalizeShipmentBoard,
      mergeShipmentBoardWithTable,
    }).catch(() => null);
    if (seq !== loadSeqRef.current) return;
    if (boardPayload?.data) {
      const overviewBoard = normalizeShipmentBoard(boardPayload.data);
      setters.setShipmentBoard(overviewBoard);
      const cachedRows = readCachedOrderRows();
      setViewCache(view, buildViewSnapshot({
        view,
        normalizedRows: cachedRows.length ? cachedRows.map(normalizeOrder) : undefined,
        overviewBoard,
      }));
    }
    return;
  }

  if (view === "workshop" || view === "floorMap" || view === "strapStock") {
    const [boardResult, templatesResult, detailArticlesResult] = await Promise.all([
      view === "workshop" || view === "floorMap" ? OrderService.getShipmentBoard().catch(() => null) : Promise.resolve(null),
      typeof setters.setFurnitureCustomTemplates === "function"
        ? OrderService.getFurnitureCustomTemplates().catch(() => null)
        : Promise.resolve(null),
      OrderService.getFurnitureDetailArticles().catch(() => null),
    ]);
    if (seq !== loadSeqRef.current) return;
    if ((view === "workshop" || view === "floorMap") && boardResult != null) {
      try {
        setters.setShipmentBoard(normalizeShipmentBoard(boardResult));
      } catch (_) {
        /* keep previous board */
      }
    }
    if (Array.isArray(templatesResult) && typeof setters.setFurnitureCustomTemplates === "function") {
      setters.setFurnitureCustomTemplates(templatesResult);
    }
    setters.setFurnitureDetailArticleRows(Array.isArray(detailArticlesResult) ? detailArticlesResult : []);
    return;
  }

  if (view === "hardware" || view === "warehouseMissing") {
    const [articlesResult, stockResult, detailArticlesResult, templatesResult] = await Promise.all([
      OrderService.getSectionArticles().catch(() => null),
      OrderService.getMaterialsStock().catch(() => null),
      OrderService.getFurnitureDetailArticles().catch(() => null),
      OrderService.getFurnitureCustomTemplates().catch(() => null),
    ]);
    if (seq !== loadSeqRef.current) return;
    setters.setSectionArticleRows(Array.isArray(articlesResult) ? articlesResult : []);
    setters.setMaterialsStockRows(Array.isArray(stockResult) ? stockResult : []);
    setters.setFurnitureDetailArticleRows(Array.isArray(detailArticlesResult) ? detailArticlesResult : []);
    if (typeof setters.setFurnitureCustomTemplates === "function") {
      setters.setFurnitureCustomTemplates(Array.isArray(templatesResult) ? templatesResult : []);
    }
  }
}

async function reloadWarehouseDomain({
  view,
  seq,
  loadSeqRef,
  callBackend,
  normalizeShipmentBoard,
  setters,
}) {
  const warehousePayload = await loadWarehouseDomainData({ callBackend });
  if (seq !== loadSeqRef.current) return;
  let consumeResolveBoard = null;
  if (warehousePayload?.consumeResolveBoard != null) {
    try {
      consumeResolveBoard = normalizeShipmentBoard(warehousePayload.consumeResolveBoard);
    } catch (_) {
      consumeResolveBoard = null;
    }
  }
  setters.setMaterialsStockRows(warehousePayload?.materialsStockRows || []);
  setters.setLeftoversRows(warehousePayload?.leftoversRows || []);
  setters.setLeftoversHistoryRows(warehousePayload?.leftoversHistoryRows || []);
  setters.setConsumeHistoryRows(warehousePayload?.consumeHistoryRows || []);
  setters.setPilkaDoneHistoryRows(warehousePayload?.pilkaDoneHistoryRows || []);
  setters.setWarehouseRows(Array.isArray(warehousePayload.data) ? warehousePayload.data : []);
  if (consumeResolveBoard) {
    setters.setShipmentBoard(consumeResolveBoard);
  }
  if (Array.isArray(warehousePayload?.consumeResolveOrders)) {
    setters.setShipmentOrders(warehousePayload.consumeResolveOrders);
  }
  if (typeof setters.setFurnitureCustomTemplates === "function" && Array.isArray(warehousePayload?.consumeResolveTemplates)) {
    setters.setFurnitureCustomTemplates(warehousePayload.consumeResolveTemplates);
  }
  setViewCache(view, buildViewSnapshot({
    view,
    data: warehousePayload.data,
    warehousePayload: {
      ...warehousePayload,
      consumeResolveBoard,
    },
  }));
}

async function reloadLaborDomain({ view, seq, loadSeqRef, setters }) {
  const data = await OrderService.getLaborTable();
  if (seq !== loadSeqRef.current) return;
  setters.setLaborRows(Array.isArray(data) ? data : []);
  setViewCache(view, buildViewSnapshot({ view, data }));
}

async function reloadFurnitureDomain({
  view,
  seq,
  loadSeqRef,
  callBackend,
  setters,
}) {
  const furniturePayload = await loadFurnitureDomainData({ callBackend });
  if (seq !== loadSeqRef.current) return;
  setters.setFurnitureArticleRows(furniturePayload?.furnitureArticleRows || []);
  setters.setFurnitureDetailArticleRows(furniturePayload?.furnitureDetailArticleRows || []);
  if (typeof setters.setFurnitureCustomTemplates === "function") {
    setters.setFurnitureCustomTemplates(furniturePayload?.furnitureCustomTemplates || []);
  }
  setViewCache(view, buildViewSnapshot({
    view,
    data: furniturePayload.data,
    furniturePayload,
  }));
}

export function useDataLoader({
  view,
  tab: _tab,
  callBackend,
  setLoading,
  setError,
  setRows,
  setShipmentBoard,
  setPlanCatalogRows,
  setSectionCatalogRows,
  setSectionArticleRows,
  setShipmentOrders,
  setFurnitureDetailArticleRows,
  setFurnitureCustomTemplates,
  setMaterialsStockRows,
  setLeftoversRows,
  setLeftoversHistoryRows,
  setConsumeHistoryRows,
  setPilkaDoneHistoryRows,
  setWarehouseRows,
  setLaborRows,
  setFurnitureArticleRows,
  normalizeShipmentBoard,
  mergeShipmentBoardWithTable,
  normalizeOrder,
  isOrdersDomainView,
  loadOrdersDomainData,
  loadShipmentDomainData,
  loadWarehouseDomainData,
  loadFurnitureDomainData,
  toUserError,
}) {
  const loadSeqRef = useRef(0);
  const loadInFlightRef = useRef(false);

  const load = useCallback(async ({ background = false, preferStaged } = {}) => {
    loadInFlightRef.current = true;
    const seq = ++loadSeqRef.current;
    const ordersPreferStaged = preferStaged ?? preferStagedOrdersReloadForView(view);
    if (!background) {
      setLoading(true);
      setError("");
    }
    try {
      let data;
      let shipmentPayload = null;
      let warehousePayload = null;
      let furniturePayload = null;
      let normalizedRows = null;
      let workshopBoard = null;
      let workshopTemplates = [];
      let workshopDetailArticles = [];
      if (view === "shipment") {
        const boardPayload = await loadShipmentBoardPayload({
          normalizeShipmentBoard,
          mergeShipmentBoardWithTable,
        });
        if (seq !== loadSeqRef.current) return;
        shipmentPayload = { ...boardPayload, shipmentOrders: [] };
        data = boardPayload.data;
        const normalizedBoard = normalizeShipmentBoard(data);
        setPlanCatalogRows(boardPayload.planCatalogRows || []);
        setSectionCatalogRows(boardPayload.sectionCatalogRows || []);
        setSectionArticleRows(boardPayload.sectionArticleRows || []);
        setShipmentOrders([]);
        setFurnitureDetailArticleRows(boardPayload.furnitureDetailArticleRows || []);
        if (typeof setFurnitureCustomTemplates === "function") {
          setFurnitureCustomTemplates(boardPayload.furnitureCustomTemplates || []);
        }
        setMaterialsStockRows(boardPayload.materialsStockRows || []);
        setShipmentBoard(normalizedBoard);
        if (!background) {
          setLoading(false);
        }
        setViewCache(view, buildViewSnapshot({
          view,
          data: normalizedBoard,
          shipmentPayload,
        }));

        void (async () => {
          const shipmentOrders = await loadShipmentOrdersPayload({ normalizeOrder });
          if (seq !== loadSeqRef.current) return;
          const fullPayload = { ...boardPayload, shipmentOrders };
          setShipmentOrders(shipmentOrders);
          setViewCache(view, buildViewSnapshot({
            view,
            data: normalizedBoard,
            shipmentPayload: fullPayload,
          }));
        })();
      } else if (view === "overview") {
        const cachedRows = readCachedOrderRows();
        let overviewBoard =
          getViewCache("overview")?.shipmentBoard
          || getViewCache("shipment")?.shipmentBoard
          || null;

        if (cachedRows.length) {
          const initialRows = cachedRows.map(normalizeOrder);
          setRows(initialRows);
          setShipmentOrders(initialRows);
        }
        if (overviewBoard) {
          setShipmentBoard(overviewBoard);
        }
        if ((cachedRows.length || overviewBoard) && !background) {
          setLoading(false);
        }

        void (async () => {
          const boardPayload = await loadShipmentBoardPayload({
            normalizeShipmentBoard,
            mergeShipmentBoardWithTable,
          }).catch(() => null);
          if (seq !== loadSeqRef.current) return;
          if (boardPayload?.data) {
            overviewBoard = normalizeShipmentBoard(boardPayload.data);
            setShipmentBoard(overviewBoard);
            setViewCache(view, buildViewSnapshot({
              view,
              normalizedRows: cachedRows.length ? cachedRows.map(normalizeOrder) : undefined,
              overviewBoard,
            }));
          }
        })();

        try {
          const fresh = await loadOrdersWithCacheFallback({ view, callBackend, preferStaged: ordersPreferStaged });
          if (seq !== loadSeqRef.current) return;
          const rows = Array.isArray(fresh) ? fresh.map(normalizeOrder) : [];
          setRows((current) => reconcileOrderSnapshot(current, rows, { preserveOnEmpty: background }));
          setShipmentOrders((current) => reconcileOrderSnapshot(current, rows, { preserveOnEmpty: background }));
          if (!background || rows.length > 0) {
            setViewCache(view, buildViewSnapshot({
              view,
              normalizedRows: rows,
              overviewBoard,
            }));
          }
          setError("");
        } catch (e) {
          if (seq !== loadSeqRef.current) return;
          if (!cachedRows.length && !background) {
            setError(toUserError(e));
          }
        } finally {
          if (seq === loadSeqRef.current && !background) {
            setLoading(false);
          }
        }
      } else if (view === "warehouse") {
        warehousePayload = await loadWarehouseDomainData({ callBackend });
        data = warehousePayload.data;
      } else if (view === "labor") {
        data = await OrderService.getLaborTable();
      } else if (view === "stats") {
        data = await loadOrdersWithCacheFallback({ view, callBackend, preferStaged: ordersPreferStaged });
      } else if (view === "furniture") {
        furniturePayload = await loadFurnitureDomainData({ callBackend });
        data = furniturePayload.data;
      } else if (view === "metalProcess") {
        data = [];
      } else if (view === "hardware" || view === "warehouseMissing") {
        const [articlesResult, stockResult, detailArticlesResult, templatesResult] = await Promise.all([
          OrderService.getSectionArticles().catch(() => null),
          OrderService.getMaterialsStock().catch(() => null),
          OrderService.getFurnitureDetailArticles().catch(() => null),
          OrderService.getFurnitureCustomTemplates().catch(() => null),
        ]);
        if (seq !== loadSeqRef.current) return;
        setSectionArticleRows(Array.isArray(articlesResult) ? articlesResult : []);
        setMaterialsStockRows(Array.isArray(stockResult) ? stockResult : []);
        setFurnitureDetailArticleRows(Array.isArray(detailArticlesResult) ? detailArticlesResult : []);
        if (typeof setFurnitureCustomTemplates === "function") {
          setFurnitureCustomTemplates(Array.isArray(templatesResult) ? templatesResult : []);
        }
        data = [];
      } else {
        data = await loadOrdersWithCacheFallback({ view, callBackend, preferStaged: ordersPreferStaged });
      }

      if (seq !== loadSeqRef.current) return;
      if (view === "shipment") {
        // Shipment state is applied above with progressive orders loading.
      } else if (view === "overview") {
        // Overview state is applied above with progressive orders loading.
      } else if (view === "warehouse") {
        let consumeResolveBoard = null;
        if (warehousePayload?.consumeResolveBoard != null) {
          try {
            consumeResolveBoard = normalizeShipmentBoard(warehousePayload.consumeResolveBoard);
          } catch (_) {
            consumeResolveBoard = null;
          }
        }
        setMaterialsStockRows(warehousePayload?.materialsStockRows || []);
        setLeftoversRows(warehousePayload?.leftoversRows || []);
        setLeftoversHistoryRows(warehousePayload?.leftoversHistoryRows || []);
        setConsumeHistoryRows(warehousePayload?.consumeHistoryRows || []);
        setPilkaDoneHistoryRows(warehousePayload?.pilkaDoneHistoryRows || []);
        setWarehouseRows(Array.isArray(data) ? data : []);
        if (consumeResolveBoard) {
          setShipmentBoard(consumeResolveBoard);
        }
        if (Array.isArray(warehousePayload?.consumeResolveOrders)) {
          setShipmentOrders(warehousePayload.consumeResolveOrders);
        }
        if (typeof setFurnitureCustomTemplates === "function" && Array.isArray(warehousePayload?.consumeResolveTemplates)) {
          setFurnitureCustomTemplates(warehousePayload.consumeResolveTemplates);
        }
        setViewCache(view, buildViewSnapshot({
          view,
          data,
          warehousePayload: {
            ...warehousePayload,
            consumeResolveBoard,
          },
        }));
      } else if (view === "labor") {
        setLaborRows(Array.isArray(data) ? data : []);
        setViewCache(view, buildViewSnapshot({ view, data }));
      } else if (isOrdersDomainView(view)) {
        normalizedRows = Array.isArray(data) ? data.map(normalizeOrder) : [];
        setRows((current) => reconcileOrderSnapshot(current, normalizedRows, { preserveOnEmpty: background }));
        if (view === "workshop" || view === "floorMap" || view === "overview" || view === "stats") {
          setShipmentOrders((current) => reconcileOrderSnapshot(current, normalizedRows, { preserveOnEmpty: background }));
        }
        if (view === "workshop" || view === "floorMap" || view === "strapStock") {
          const [boardResult, templatesResult, detailArticlesResult] = await Promise.all([
            view === "workshop" || view === "floorMap" ? OrderService.getShipmentBoard().catch(() => null) : Promise.resolve(null),
            typeof setFurnitureCustomTemplates === "function"
              ? OrderService.getFurnitureCustomTemplates().catch(() => null)
              : Promise.resolve(null),
            OrderService.getFurnitureDetailArticles().catch(() => null),
          ]);
          if (seq !== loadSeqRef.current) return;

          if ((view === "workshop" || view === "floorMap") && boardResult != null) {
            try {
              workshopBoard = normalizeShipmentBoard(boardResult);
              setShipmentBoard(workshopBoard);
            } catch (_) {
              // keep previous shipment board snapshot
            }
          }
          if (Array.isArray(templatesResult)) {
            workshopTemplates = templatesResult;
            if (typeof setFurnitureCustomTemplates === "function") {
              setFurnitureCustomTemplates(templatesResult);
            }
          }
          workshopDetailArticles = Array.isArray(detailArticlesResult) ? detailArticlesResult : [];
          setFurnitureDetailArticleRows(workshopDetailArticles);
        }
        if (!background || normalizedRows.length > 0) {
          setViewCache(view, buildViewSnapshot({
            view,
            normalizedRows,
            workshopBoard,
            workshopTemplates,
            workshopDetailArticles,
          }));
        }
      } else if (view === "furniture") {
        setFurnitureArticleRows(furniturePayload?.furnitureArticleRows || []);
        setFurnitureDetailArticleRows(furniturePayload?.furnitureDetailArticleRows || []);
        if (typeof setFurnitureCustomTemplates === "function") {
          setFurnitureCustomTemplates(furniturePayload?.furnitureCustomTemplates || []);
        }
        setRows(Array.isArray(data) ? data : []);
        setViewCache(view, buildViewSnapshot({
          view,
          data,
          furniturePayload,
        }));
      } else if (view === "metalProcess") {
        setRows([]);
      } else if (view === "hardware" || view === "warehouseMissing") {
        setRows([]);
        setViewCache(view, buildViewSnapshot({ view, normalizedRows: [] }));
      } else {
        setRows(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      if (!background) {
        setError(toUserError(e));
      }
    } finally {
      loadInFlightRef.current = false;
      if (seq !== loadSeqRef.current) return;
      setLoading(false);
    }
  }, [
    callBackend,
    isOrdersDomainView,
    loadFurnitureDomainData,
    loadOrdersDomainData,
    loadShipmentBoardPayload,
    loadShipmentOrdersPayload,
    loadShipmentDomainData,
    loadWarehouseDomainData,
    mergeShipmentBoardWithTable,
    normalizeOrder,
    normalizeShipmentBoard,
    setError,
    setFurnitureArticleRows,
    setFurnitureCustomTemplates,
    setFurnitureDetailArticleRows,
    setLaborRows,
    setLeftoversHistoryRows,
    setConsumeHistoryRows,
    setPilkaDoneHistoryRows,
    setLeftoversRows,
    setLoading,
    setMaterialsStockRows,
    setPlanCatalogRows,
    setRows,
    setSectionArticleRows,
    setSectionCatalogRows,
    setShipmentBoard,
    setShipmentOrders,
    setWarehouseRows,
    toUserError,
    view,
  ]);

  const loadDomains = useCallback(async ({
    background = true,
    domains = [],
    preferStaged,
    extras = {},
  } = {}) => {
    const uniqueDomains = [...new Set((Array.isArray(domains) ? domains : []).filter(Boolean))];
    if (!uniqueDomains.length) return;

    const { internal, external } = partitionDomains(uniqueDomains);
    if (!internal.length && !external.length) return;

    loadInFlightRef.current = true;
    const seq = ++loadSeqRef.current;
    const ordersPreferStaged = preferStaged ?? preferStagedOrdersReloadForView(view);
    const setters = createLoaderSetters({
      setRows,
      setShipmentBoard,
      setPlanCatalogRows,
      setSectionCatalogRows,
      setSectionArticleRows,
      setShipmentOrders,
      setFurnitureDetailArticleRows,
      setFurnitureCustomTemplates,
      setMaterialsStockRows,
      setLeftoversRows,
      setLeftoversHistoryRows,
      setConsumeHistoryRows,
      setPilkaDoneHistoryRows,
      setWarehouseRows,
      setLaborRows,
      setFurnitureArticleRows,
    });

    try {
      for (const domain of internal) {
        if (seq !== loadSeqRef.current) return;
        if (domain === "orders") {
          await reloadOrdersDomain({
            view,
            seq,
            loadSeqRef,
            callBackend,
            preferStaged: ordersPreferStaged,
            preserveOnEmpty: background,
            normalizeOrder,
            normalizeShipmentBoard,
            setters,
          });
        } else if (domain === "shipment") {
          await reloadShipmentDomain({
            view,
            seq,
            loadSeqRef,
            normalizeShipmentBoard,
            mergeShipmentBoardWithTable,
            normalizeOrder,
            setters,
          });
        } else if (domain === "warehouse") {
          await reloadWarehouseDomain({
            view,
            seq,
            loadSeqRef,
            callBackend,
            normalizeShipmentBoard,
            setters,
          });
        } else if (domain === "labor") {
          await reloadLaborDomain({ view, seq, loadSeqRef, setters });
        } else if (domain === "furniture") {
          await reloadFurnitureDomain({
            view,
            seq,
            loadSeqRef,
            callBackend,
            setters,
          });
        }
      }

      await Promise.all(
        external.map(async (domain) => {
          const handler = extras?.[domain];
          if (typeof handler === "function") {
            await handler();
          }
        }),
      );
    } catch (_) {
      /* фоновая перезагрузка — без ошибок в UI */
    } finally {
      loadInFlightRef.current = false;
    }
  }, [
    callBackend,
    mergeShipmentBoardWithTable,
    normalizeOrder,
    normalizeShipmentBoard,
    setConsumeHistoryRows,
    setFurnitureArticleRows,
    setFurnitureCustomTemplates,
    setFurnitureDetailArticleRows,
    setLaborRows,
    setLeftoversHistoryRows,
    setLeftoversRows,
    setMaterialsStockRows,
    setPilkaDoneHistoryRows,
    setPlanCatalogRows,
    setRows,
    setSectionArticleRows,
    setSectionCatalogRows,
    setShipmentBoard,
    setShipmentOrders,
    setWarehouseRows,
    view,
  ]);

  useEffect(() => {
    const setters = {
      setRows,
      setShipmentBoard,
      setPlanCatalogRows,
      setSectionCatalogRows,
      setSectionArticleRows,
      setShipmentOrders,
      setFurnitureDetailArticleRows,
      setFurnitureCustomTemplates,
      setMaterialsStockRows,
      setLeftoversRows,
      setLeftoversHistoryRows,
      setConsumeHistoryRows,
      setPilkaDoneHistoryRows,
      setWarehouseRows,
      setLaborRows,
      setFurnitureArticleRows,
    };
    const cachedSnapshot = getViewCache(view);
    if (applyViewSnapshot(view, cachedSnapshot, setters)) {
      setError("");
      setLoading(false);
      void load({ background: true, preferStaged: preferStagedOrdersReloadForView(view) });
      return;
    }
    clearViewState(view, setters);
    void load();
    // Polling removed — data is now refreshed via Supabase Realtime subscriptions
    // (see App.jsx for the Realtime channel setup)
  }, [
    view,
    load,
    setConsumeHistoryRows,
    setError,
    setFurnitureArticleRows,
    setFurnitureCustomTemplates,
    setFurnitureDetailArticleRows,
    setLaborRows,
    setLeftoversHistoryRows,
    setLeftoversRows,
    setLoading,
    setMaterialsStockRows,
    setPilkaDoneHistoryRows,
    setPlanCatalogRows,
    setRows,
    setSectionArticleRows,
    setSectionCatalogRows,
    setShipmentBoard,
    setShipmentOrders,
    setWarehouseRows,
  ]);

  return { load, loadDomains };
}
