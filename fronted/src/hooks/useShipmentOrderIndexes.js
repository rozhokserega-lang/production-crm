import { useMemo } from "react";
import { mergeOrderPreferNewer, shipmentOrderKey } from "../app/orderHelpers";
import { shipmentOrderItemWeekKey } from "../utils/shipmentUtils";

export function useShipmentOrderIndexes({ shipmentOrders, rows }) {
  const shipmentOrderMaps = useMemo(() => {
    const byRowWeek = new Map();
    const byItemWeek = new Map();
    (shipmentOrders || []).forEach((o) => {
      const week = String(o?.week || "").trim();
      if (!week) return;
      const sourceRow = String(o?.source_row_id || o?.sourceRowId || "").trim();
      if (sourceRow) mergeOrderPreferNewer(byRowWeek, shipmentOrderKey(sourceRow, week), o);
      const item = String(o?.item || "").trim();
      if (item) mergeOrderPreferNewer(byItemWeek, shipmentOrderItemWeekKey(item, week), o);
    });
    return { byRowWeek, byItemWeek };
  }, [shipmentOrders]);

  const orderIndexById = useMemo(() => {
    const map = new Map();
    const add = (x) => {
      const id = String(x?.orderId || x?.order_id || "").trim();
      if (!id || map.has(id)) return;
      map.set(id, x);
    };
    (rows || []).forEach(add);
    (shipmentOrders || []).forEach(add);
    return map;
  }, [rows, shipmentOrders]);

  return { shipmentOrderMaps, orderIndexById };
}
