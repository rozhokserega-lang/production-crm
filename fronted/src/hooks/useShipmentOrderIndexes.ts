import { useMemo } from "react";
import { mergeOrderPreferNewer } from "../app/orderHelpers";

interface UseShipmentOrderIndexesParams {
  shipmentOrders: unknown[];
  rows: unknown[];
}

interface UseShipmentOrderIndexesReturn {
  shipmentOrderMaps: Record<string, unknown>;
  orderIndexById: Map<string, unknown>;
}

export function useShipmentOrderIndexes({
  shipmentOrders,
  rows,
}: UseShipmentOrderIndexesParams): UseShipmentOrderIndexesReturn {
  const shipmentOrderMaps = useMemo(() => {
    const byRowWeek = new Map<string, Record<string, unknown>>();
    const byItemWeek = new Map<string, Record<string, unknown>>();
    (shipmentOrders || []).forEach((o) => {
      const order = o as Record<string, unknown>;
      const row = String(order.row || "").trim().toLowerCase();
      const item = String(order.item || "").trim().toLowerCase();
      const week = String(order.week || "").trim();
      const add = (x: Map<string, Record<string, unknown>>, key: string) => {
        mergeOrderPreferNewer(x, key, order);
      };
      if (row && week) add(byRowWeek, `${row}::${week}`);
      if (item && week) add(byItemWeek, `${item}::${week}`);
    });
    return { byRowWeek, byItemWeek };
  }, [shipmentOrders]);

  const orderIndexById = useMemo(() => {
    const map = new Map();
    (rows || []).forEach((r) => {
      const row = r as Record<string, unknown>;
      const id = String(row.id ?? "");
      if (id) map.set(id, row);
    });
    return map;
  }, [rows]);

  return { shipmentOrderMaps, orderIndexById };
}
