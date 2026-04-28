import { useCallback, useEffect, useRef } from "react";

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

  const load = useCallback(async () => {
    loadInFlightRef.current = true;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError("");
    try {
      let data;
      let shipmentPayload = null;
      let warehousePayload = null;
      let furniturePayload = null;
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
        data = await callBackend("webGetSheetOrdersMirror", { p_sheet_gid: SHEET_MIRROR_GID });
      } else if (view === "warehouse") {
        warehousePayload = await loadWarehouseDomainData({ callBackend });
        data = warehousePayload.data;
      } else if (view === "labor") {
        data = await callBackend("webGetLaborTable");
      } else if (view === "stats") {
        data = await loadOrdersDomainData({ view, callBackend });
      } else if (view === "furniture") {
        furniturePayload = await loadFurnitureDomainData({ callBackend });
        data = furniturePayload.data;
      } else {
        data = await loadOrdersDomainData({ view, callBackend });
      }

      if (seq !== loadSeqRef.current) return;
      if (view === "shipment") {
        setPlanCatalogRows(shipmentPayload?.planCatalogRows || []);
        setSectionCatalogRows(shipmentPayload?.sectionCatalogRows || []);
        setSectionArticleRows(shipmentPayload?.sectionArticleRows || []);
        setShipmentOrders(shipmentPayload?.shipmentOrders || []);
        setFurnitureDetailArticleRows(shipmentPayload?.furnitureDetailArticleRows || []);
        setMaterialsStockRows(shipmentPayload?.materialsStockRows || []);
        setShipmentBoard(normalizeShipmentBoard(data));
      } else if (view === "sheetMirror") {
        setRows(Array.isArray(data) ? data : []);
      } else if (view === "warehouse") {
        setMaterialsStockRows(warehousePayload?.materialsStockRows || []);
        setLeftoversRows(warehousePayload?.leftoversRows || []);
        setLeftoversHistoryRows(warehousePayload?.leftoversHistoryRows || []);
        setConsumeHistoryRows(warehousePayload?.consumeHistoryRows || []);
        setPilkaDoneHistoryRows(warehousePayload?.pilkaDoneHistoryRows || []);
        setWarehouseRows(Array.isArray(data) ? data : []);
      } else if (view === "labor") {
        setLaborRows(Array.isArray(data) ? data : []);
      } else if (isOrdersDomainView(view)) {
        const normalizedRows = Array.isArray(data) ? data.map(normalizeOrder) : [];
        setRows(normalizedRows);
        if (view === "workshop" || view === "overview" || view === "stats") {
          setShipmentOrders(normalizedRows);
        }
        if (view === "workshop") {
          try {
            const boardData = await callBackend("webGetShipmentBoard");
            setShipmentBoard(normalizeShipmentBoard(boardData));
          } catch (_) {
            // keep previous shipment board snapshot
          }
        }
      } else if (view === "furniture") {
        setFurnitureArticleRows(furniturePayload?.furnitureArticleRows || []);
        setFurnitureDetailArticleRows(furniturePayload?.furnitureDetailArticleRows || []);
        setRows(Array.isArray(data) ? data : []);
      } else {
        setRows(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      setError(toUserError(e));
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
    load();
    // Polling removed — data is now refreshed via Supabase Realtime subscriptions
    // (see App.jsx for the Realtime channel setup)
  }, [view, load, setConsumeHistoryRows, setLaborRows, setLeftoversHistoryRows, setLeftoversRows, setPilkaDoneHistoryRows, setRows, setShipmentBoard, setWarehouseRows]);

  return { load };
}
