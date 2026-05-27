import { useCallback, useEffect, useRef } from "react";
import { OrderService } from "../services/orderService";
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

async function loadOrdersWithCacheFallback({ view, callBackend }) {
  try {
    return await loadOrdersDomainData({ view, callBackend });
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
  if (view === "workshop") setRows([]);
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
  if (view === "sheetMirror") {
    setRows(snapshot.rows || []);
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
    if (view === "workshop" || view === "overview") {
      if (snapshot.shipmentBoard) {
        setShipmentBoard(snapshot.shipmentBoard);
      }
      if (view === "workshop") {
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
  if (view === "sheetMirror") {
    return { rows: Array.isArray(data) ? data : [] };
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
      shipmentOrders: view === "workshop" || view === "overview" || view === "stats" ? normalizedRows : null,
      shipmentBoard: workshopBoard || null,
      furnitureCustomTemplates: workshopTemplates || [],
    };
    if (view === "overview" && overviewBoard) {
      snap.shipmentBoard = overviewBoard;
    }
    if (view === "workshop") {
      snap.furnitureDetailArticleRows = Array.isArray(workshopDetailArticles) ? workshopDetailArticles : [];
    }
    return snap;
  }
  return null;
}

export function useDataLoader({
  view,
  tab: _tab,
  callBackend,
  SHEET_MIRROR_GID,
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

  const load = useCallback(async ({ background = false } = {}) => {
    loadInFlightRef.current = true;
    const seq = ++loadSeqRef.current;
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
          const fresh = await loadOrdersWithCacheFallback({ view, callBackend });
          if (seq !== loadSeqRef.current) return;
          const rows = Array.isArray(fresh) ? fresh.map(normalizeOrder) : [];
          setRows(rows);
          setShipmentOrders(rows);
          setViewCache(view, buildViewSnapshot({
            view,
            normalizedRows: rows,
            overviewBoard,
          }));
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
      } else if (view === "sheetMirror") {
        data = await OrderService.getSheetOrdersMirror(SHEET_MIRROR_GID);
      } else if (view === "warehouse") {
        warehousePayload = await loadWarehouseDomainData({ callBackend });
        data = warehousePayload.data;
      } else if (view === "labor") {
        data = await OrderService.getLaborTable();
      } else if (view === "stats") {
        data = await loadOrdersWithCacheFallback({ view, callBackend });
      } else if (view === "furniture") {
        furniturePayload = await loadFurnitureDomainData({ callBackend });
        data = furniturePayload.data;
      } else if (view === "metalProcess") {
        data = [];
      } else {
        data = await loadOrdersWithCacheFallback({ view, callBackend });
      }

      if (seq !== loadSeqRef.current) return;
      if (view === "shipment") {
        // Shipment state is applied above with progressive orders loading.
      } else if (view === "overview") {
        // Overview state is applied above with progressive orders loading.
      } else if (view === "sheetMirror") {
        setRows(Array.isArray(data) ? data : []);
        setViewCache(view, buildViewSnapshot({ view, data }));
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
        setRows(normalizedRows);
        if (view === "workshop" || view === "overview" || view === "stats") {
          setShipmentOrders(normalizedRows);
        }
        if (view === "workshop" || view === "strapStock") {
          const [boardResult, templatesResult, detailArticlesResult] = await Promise.all([
            view === "workshop" ? OrderService.getShipmentBoard().catch(() => null) : Promise.resolve(null),
            typeof setFurnitureCustomTemplates === "function"
              ? OrderService.getFurnitureCustomTemplates().catch(() => null)
              : Promise.resolve(null),
            OrderService.getFurnitureDetailArticles().catch(() => null),
          ]);
          if (seq !== loadSeqRef.current) return;

          if (view === "workshop" && boardResult != null) {
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
        setViewCache(view, buildViewSnapshot({
          view,
          normalizedRows,
          workshopBoard,
          workshopTemplates,
          workshopDetailArticles,
        }));
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
    SHEET_MIRROR_GID,
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
      void load({ background: true });
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

  return { load };
}
