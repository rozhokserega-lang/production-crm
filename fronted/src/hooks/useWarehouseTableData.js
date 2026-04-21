import { useMemo } from "react";

export function useWarehouseTableData({ view, query, warehouseRows, leftoversRows, consumeHistoryRows }) {
  const warehouseTableRows = useMemo(() => {
    if (view !== "warehouse") return [];
    const q = String(query || "").trim().toLowerCase();
    return [...warehouseRows]
      .map((x) => ({
        material: String(x.material || ""),
        qtySheets: Number(x.qty_sheets ?? x.qtySheets ?? 0),
        sizeLabel: String(x.size_label || x.sizeLabel || ""),
        widthMm: Number(x.sheet_width_mm ?? x.sheetWidthMm ?? 0),
        heightMm: Number(x.sheet_height_mm ?? x.sheetHeightMm ?? 0),
        updatedAt: String(x.updated_at || x.updatedAt || ""),
      }))
      .filter((x) => !q || x.material.toLowerCase().includes(q))
      .sort((a, b) => a.material.localeCompare(b.material, "ru"));
  }, [query, view, warehouseRows]);

  const leftoversTableRows = useMemo(() => {
    if (view !== "warehouse") return [];
    return [...leftoversRows]
      .map((x) => ({
        orderId: String(x.orderId || x.order_id || ""),
        item: String(x.item || ""),
        material: String(x.material || ""),
        sheetsNeeded: Number(x.sheetsNeeded || x.sheets_needed || 0),
        leftoverFormat: String(x.leftoverFormat || x.leftover_format || ""),
        leftoversQty: Number(x.leftoversQty || x.leftovers_qty || 0),
        createdAt: String(x.createdAt || x.created_at || ""),
      }))
      .filter((x) => {
        const q = String(query || "").trim().toLowerCase();
        return !q || x.material.toLowerCase().includes(q) || x.leftoverFormat.toLowerCase().includes(q);
      })
      .sort((a, b) => a.item.localeCompare(b.item, "ru"));
  }, [leftoversRows, query, view]);

  const consumeHistoryTableRows = useMemo(() => {
    if (view !== "warehouse") return [];
    const q = String(query || "").trim().toLowerCase();
    return [...consumeHistoryRows]
      .map((x) => ({
        moveId: String(x.move_id || x.moveId || ""),
        createdAt: String(x.created_at || x.createdAt || ""),
        orderId: String(x.order_id || x.orderId || ""),
        material: String(x.material || ""),
        qtySheets: Number(x.qty_sheets ?? x.qtySheets ?? 0),
        comment: String(x.comment || ""),
      }))
      .filter((x) => {
        if (!q) return true;
        return (
          x.orderId.toLowerCase().includes(q) ||
          x.material.toLowerCase().includes(q) ||
          x.comment.toLowerCase().includes(q)
        );
      });
  }, [consumeHistoryRows, query, view]);

  return {
    warehouseTableRows,
    leftoversTableRows,
    consumeHistoryTableRows,
  };
}
