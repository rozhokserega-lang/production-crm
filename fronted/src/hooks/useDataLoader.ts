import { useCallback, useEffect, useRef } from "react";

interface UseDataLoaderParams {
  view: string;
  tab: string;
  callBackend: (action: string, payload?: Record<string, unknown>) => Promise<unknown>;
  SHEET_MIRROR_GID: string;
  setLoading: (v: boolean) => void;
  setError: (v: string) => void;
  setRows: (v: unknown[]) => void;
  setShipmentBoard: (v: Record<string, unknown>) => void;
  setPlanCatalogRows: (v: unknown[]) => void;
  setSectionCatalogRows: (v: unknown[]) => void;
  setSectionArticleRows: (v: unknown[]) => void;
  setShipmentOrders: (v: unknown[]) => void;
  setFurnitureDetailArticleRows: (v: unknown[]) => void;
  setMaterialsStockRows: (v: unknown[]) => void;
  setLeftoversRows: (v: unknown[]) => void;
  setLeftoversHistoryRows: (v: unknown[]) => void;
  setConsumeHistoryRows: (v: unknown[]) => void;
  setPilkaDoneHistoryRows: (v: unknown[]) => void;
  setWarehouseRows: (v: unknown[]) => void;
  setLaborRows: (v: unknown[]) => void;
  setFurnitureArticleRows: (v: unknown[]) => void;
  normalizeShipmentBoard: (data: unknown) => Record<string, unknown>;
  mergeShipmentBoardWithTable: (board: Record<string, unknown>, tableRows: unknown[]) => Record<string, unknown>;
  normalizeOrder: (row: unknown) => unknown;
  isOrdersDomainView: (view: string) => boolean;
  loadOrdersDomainData: (params: { view: string; callBackend: (action: string, payload?: Record<string, unknown>) => Promise<unknown> }) => Promise<Record<string, unknown>>;
  loadShipmentDomainData: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
  loadWarehouseDomainData: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
  loadFurnitureDomainData: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
  toUserError: (e: unknown) => string;
}

interface UseDataLoaderReturn {
  load: () => Promise<void>;
}

export function useDataLoader({
  view,
  tab,
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
}: UseDataLoaderParams): UseDataLoaderReturn {
  const loadSeqRef = useRef(0);
  const loadInFlightRef = useRef(false);

  const load = useCallback(async () => {
    loadInFlightRef.current = true;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError("");
    try {
      let data: unknown;
      let shipmentPayload: Record<string, unknown> | null = null;
      let warehousePayload: Record<string, unknown> | null = null;
      let furniturePayload: Record<string, unknown> | null = null;
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
        setPlanCatalogRows((shipmentPayload?.planCatalogRows as unknown[]) || []);
        setSectionCatalogRows((shipmentPayload?.sectionCatalogRows as unknown[]) || []);
        setSectionArticleRows((shipmentPayload?.sectionArticleRows as unknown[]) || []);
        setShipmentOrders((shipmentPayload?.shipmentOrders as unknown[]) || []);
        setFurnitureDetailArticleRows((shipmentPayload?.furnitureDetailArticleRows as unknown[]) || []);
        setMaterialsStockRows((shipmentPayload?.materialsStockRows as unknown[]) || []);
        setShipmentBoard(normalizeShipmentBoard(data));
      } else if (view === "sheetMirror") {
        setRows(Array.isArray(data) ? (data as unknown[]) : []);
      } else if (view === "warehouse") {
        setMaterialsStockRows((warehousePayload?.materialsStockRows as unknown[]) || []);
        setLeftoversRows((warehousePayload?.leftoversRows as unknown[]) || []);
        setLeftoversHistoryRows((warehousePayload?.leftoversHistoryRows as unknown[]) || []);
        setConsumeHistoryRows((warehousePayload?.consumeHistoryRows as unknown[]) || []);
        setPilkaDoneHistoryRows((warehousePayload?.pilkaDoneHistoryRows as unknown[]) || []);
        setWarehouseRows(Array.isArray(data) ? (data as unknown[]) : []);
      } else if (view === "labor") {
        setLaborRows(Array.isArray(data) ? (data as unknown[]) : []);
      } else if (isOrdersDomainView(view)) {
        const normalizedRows = Array.isArray(data)
          ? (data as unknown[]).map(normalizeOrder)
          : [];
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
        setFurnitureArticleRows((furniturePayload?.furnitureArticleRows as unknown[]) || []);
        setFurnitureDetailArticleRows((furniturePayload?.furnitureDetailArticleRows as unknown[]) || []);
        setRows(Array.isArray(data) ? (data as unknown[]) : []);
      } else {
        setRows(Array.isArray(data) ? (data as unknown[]) : []);
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
