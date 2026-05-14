import { useCallback, useEffect, useRef } from "react";
import { OrderService } from "../services/orderService";
import { getViewCache, setViewCache } from "./viewCache";

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
    if (view === "workshop") {
      if (snapshot.shipmentBoard) {
        setShipmentBoard(snapshot.shipmentBoard);
      }
      if (typeof setFurnitureCustomTemplates === "function" && Array.isArray(snapshot.furnitureCustomTemplates)) {
        setFurnitureCustomTemplates(snapshot.furnitureCustomTemplates);
      }
      setFurnitureDetailArticleRows(
        Array.isArray(snapshot.furnitureDetailArticleRows) ? snapshot.furnitureDetailArticleRows : [],
      );
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
        shipmentPayload = await loadShipmentDomainData({
          callBackend,
          normalizeShipmentBoard,
          mergeShipmentBoardWithTable,
          normalizeOrder,
        });
        data = shipmentPayload.data;
      } else if (view === "overview") {
        data = await loadOrdersDomainData({ view, callBackend });
      } else if (view === "sheetMirror") {
        data = await OrderService.getSheetOrdersMirror(SHEET_MIRROR_GID);
      } else if (view === "warehouse") {
        warehousePayload = await loadWarehouseDomainData({ callBackend });
        data = warehousePayload.data;
      } else if (view === "labor") {
        data = await OrderService.getLaborTable();
      } else if (view === "stats") {
        data = await loadOrdersDomainData({ view, callBackend });
      } else if (view === "furniture") {
        furniturePayload = await loadFurnitureDomainData({ callBackend });
        data = furniturePayload.data;
      } else if (view === "metalProcess") {
        data = [];
      } else {
        data = await loadOrdersDomainData({ view, callBackend });
      }

      if (seq !== loadSeqRef.current) return;
      if (view === "shipment") {
        const normalizedBoard = normalizeShipmentBoard(data);
        setPlanCatalogRows(shipmentPayload?.planCatalogRows || []);
        setSectionCatalogRows(shipmentPayload?.sectionCatalogRows || []);
        setSectionArticleRows(shipmentPayload?.sectionArticleRows || []);
        setShipmentOrders(shipmentPayload?.shipmentOrders || []);
        setFurnitureDetailArticleRows(shipmentPayload?.furnitureDetailArticleRows || []);
        if (typeof setFurnitureCustomTemplates === "function") {
          setFurnitureCustomTemplates(shipmentPayload?.furnitureCustomTemplates || []);
        }
        setMaterialsStockRows(shipmentPayload?.materialsStockRows || []);
        setShipmentBoard(normalizedBoard);
        setViewCache(view, buildViewSnapshot({
          view,
          data: normalizedBoard,
          shipmentPayload,
        }));
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
        if (view === "workshop") {
          try {
            const boardData = await OrderService.getShipmentBoard();
            if (seq !== loadSeqRef.current) return;
            workshopBoard = normalizeShipmentBoard(boardData);
            setShipmentBoard(workshopBoard);
          } catch (_) {
            // keep previous shipment board snapshot
          }
        }
        if (view === "workshop" || view === "strapStock") {
          // Load furniture custom templates + detail map (как в цеху) — для расчёта обвязки на складе и в карточках
          if (typeof setFurnitureCustomTemplates === "function") {
            try {
              const templates = await OrderService.getFurnitureCustomTemplates();
              if (seq !== loadSeqRef.current) return;
              if (Array.isArray(templates)) {
                workshopTemplates = templates;
                setFurnitureCustomTemplates(templates);
              }
            } catch (_) {
              // non-critical: strap availability display will be limited
            }
          }
          try {
            const detailArticles = await OrderService.getFurnitureDetailArticles();
            if (seq !== loadSeqRef.current) return;
            workshopDetailArticles = Array.isArray(detailArticles) ? detailArticles : [];
            setFurnitureDetailArticleRows(workshopDetailArticles);
          } catch (_) {
            // same source as shipment strap dialog; workshop strap badges degrade without it
          }
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
