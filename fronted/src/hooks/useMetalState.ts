import { useCallback, useEffect, useState } from "react";
import { callBackend } from "../api";

interface MetalStockItem {
  article: string;
  qty: number;
  [key: string]: unknown;
}

interface MetalQueueItem {
  orderId: string;
  article: string;
  qty: number;
  [key: string]: unknown;
}

interface UseMetalStateParams {
  view: string;
  callBackend: typeof callBackend;
  setError: (msg: string) => void;
  toUserError: (e: unknown) => string;
  articleLookupByItemKey: Map<string, string>;
  normalizeFurnitureKey: (v: string) => string;
}

interface UseMetalStateReturn {
  metalStock: MetalStockItem[];
  setMetalStock: (v: MetalStockItem[]) => void;
  metalQueue: MetalQueueItem[];
  setMetalQueue: (v: MetalQueueItem[]) => void;
  metalDeficits: unknown[];
  selectedShipmentMetal: Record<string, unknown>;
  setSelectedShipmentMetal: (v: Record<string, unknown>) => void;
  loadSelectedShipmentMetal: () => Promise<void>;
  saveMetalStock: (stock: MetalStockItem[]) => Promise<void>;
  enqueueMetalWorkOrder: (params: Record<string, unknown>) => Promise<void>;
}

function resolveFurnitureArticle(
  itemName: string,
  directArticle: string,
  articleLookupByItemKey: Map<string, string>,
  normalizeFurnitureKey: (v: string) => string,
): string {
  if (directArticle) return directArticle;
  const key = normalizeFurnitureKey(itemName);
  return articleLookupByItemKey.get(key) || "";
}

export function useMetalState({
  view,
  callBackend: backendCall,
  setError,
  toUserError,
  articleLookupByItemKey,
  normalizeFurnitureKey,
}: UseMetalStateParams): UseMetalStateReturn {
  const [metalStock, setMetalStock] = useState<MetalStockItem[]>([]);
  const [metalQueue, setMetalQueue] = useState<MetalQueueItem[]>([]);
  const [metalDeficits, setMetalDeficits] = useState<unknown[]>([]);
  const [selectedShipmentMetal, setSelectedShipmentMetal] = useState<Record<string, unknown>>({
    items: [],
    totalQty: 0,
    totalWeight: 0,
  });

  const saveMetalStock = useCallback(
    async (stock: MetalStockItem[]) => {
      try {
        await backendCall("webSetMetalStock", {
          stock: stock.map((item) => ({
            article: item.article,
            qty: item.qty,
          })),
        });
        setMetalStock(stock);
      } catch (e) {
        setError(toUserError(e));
      }
    },
    [backendCall, setError, toUserError],
  );

  const enqueueMetalWorkOrder = useCallback(
    async (params: Record<string, unknown>) => {
      try {
        await backendCall("webEnqueueMetalWorkOrder", params);
      } catch (e) {
        setError(toUserError(e));
      }
    },
    [backendCall, setError, toUserError],
  );

  async function loadSelectedShipmentMetal() {
    try {
      const payload = await backendCall("webGetSelectedShipmentMetal");
      const data = payload as Record<string, unknown>;
      setSelectedShipmentMetal({
        items: Array.isArray(data.items) ? data.items : [],
        totalQty: Number(data.totalQty || data.total_qty || 0),
        totalWeight: Number(data.totalWeight || data.total_weight || 0),
      });
    } catch (e) {
      setError(toUserError(e));
    }
  }

  useEffect(() => {
    if (view !== "metal") return;
    (async () => {
      try {
        const [stockPayload, queuePayload] = await Promise.all([
          backendCall("webGetMetalStock"),
          backendCall("webGetMetalQueue"),
        ]);
        const stockData = stockPayload as Record<string, unknown>;
        const queueData = queuePayload as Record<string, unknown>;
        setMetalStock(Array.isArray(stockData.list) ? (stockData.list as MetalStockItem[]) : []);
        setMetalQueue(Array.isArray(queueData.list) ? (queueData.list as MetalQueueItem[]) : []);
      } catch (e) {
        setError(toUserError(e));
      }
    })();
  }, [view, backendCall, setError, toUserError]);

  return {
    metalStock,
    setMetalStock,
    metalQueue,
    setMetalQueue,
    metalDeficits,
    selectedShipmentMetal,
    setSelectedShipmentMetal,
    loadSelectedShipmentMetal,
    saveMetalStock,
    enqueueMetalWorkOrder,
  };
}
