import { useMemo } from "react";

interface UseWarehouseTableDataParams {
  view: string;
  rows: unknown[];
  warehouseStock: unknown[];
  warehouseLeftovers: unknown[];
  warehouseConsumeHistory: unknown[];
  query: string;
}

interface UseWarehouseTableDataReturn {
  warehouseTableRows: unknown[];
  leftoversTableRows: unknown[];
  consumeHistoryTableRows: unknown[];
}

export function useWarehouseTableData({
  view,
  rows,
  warehouseStock,
  warehouseLeftovers,
  warehouseConsumeHistory,
  query,
}: UseWarehouseTableDataParams): UseWarehouseTableDataReturn {
  const warehouseTableRows = useMemo(() => {
    if (view !== "warehouse") return [];
    const q = String(query || "").trim().toLowerCase();
    let list = (warehouseStock || []).map((x) => {
      const item = x as Record<string, unknown>;
      return {
        ...item,
        material: String(item.material || ""),
        qty: Number(item.qty || 0),
        updatedAt: item.updated_at || item.updatedAt || "",
      } as Record<string, unknown>;
    });
    if (q) {
      list = list.filter(
        (x) =>
          String(x.material || "").toLowerCase().includes(q) ||
          String(x.item_name || x.itemName || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [view, warehouseStock, query]);

  const leftoversTableRows = useMemo(() => {
    if (view !== "warehouse") return [];
    const q = String(query || "").trim().toLowerCase();
    let list = (warehouseLeftovers || []).map((x) => {
      const item = x as Record<string, unknown>;
      return {
        ...item,
        material: String(item.material || ""),
        qty: Number(item.qty || 0),
        updatedAt: item.updated_at || item.updatedAt || "",
      } as Record<string, unknown>;
    });
    if (q) {
      list = list.filter(
        (x) =>
          String(x.material || "").toLowerCase().includes(q) ||
          String(x.item_name || x.itemName || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [view, warehouseLeftovers, query]);

  const consumeHistoryTableRows = useMemo(() => {
    if (view !== "warehouse") return [];
    const q = String(query || "").trim().toLowerCase();
    let list = (warehouseConsumeHistory || []).map((x) => {
      const item = x as Record<string, unknown>;
      return {
        ...item,
        material: String(item.material || ""),
        qty: Number(item.qty || 0),
        orderId: item.order_id || item.orderId || "",
        createdAt: item.created_at || item.createdAt || "",
      };
    });
    if (q) {
      list = list.filter(
        (x) =>
          String(x.material || "").toLowerCase().includes(q) ||
          String(x.orderId || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [view, warehouseConsumeHistory, query]);

  return {
    warehouseTableRows,
    leftoversTableRows,
    consumeHistoryTableRows,
  };
}
