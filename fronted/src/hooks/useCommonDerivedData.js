import { useMemo } from "react";

export function useCommonDerivedData({
  view,
  shipmentFiltered,
  laborFiltered,
  sheetMirrorFiltered,
  baseOrderFiltered,
  rows,
  orderDrawerId,
}) {
  const filtered = useMemo(() => {
    if (view === "shipment") return shipmentFiltered;
    if (view === "labor") return laborFiltered;
    if (view === "sheetMirror") return sheetMirrorFiltered;
    return baseOrderFiltered;
  }, [baseOrderFiltered, laborFiltered, sheetMirrorFiltered, shipmentFiltered, view]);

  const orderDrawerLines = useMemo(() => {
    const id = String(orderDrawerId || "").trim();
    if (!id) return [];
    return (rows || []).filter((r) => String(r?.orderId || r?.order_id || "").trim() === id);
  }, [rows, orderDrawerId]);

  return { filtered, orderDrawerLines };
}
