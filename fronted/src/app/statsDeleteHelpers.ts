import { OrderService } from "../services/orderService";

interface SourceCell {
  row: string;
  col: string;
}

function pickSourceCellParts(entity: Record<string, unknown>): SourceCell {
  return {
    row: String(
      entity?.sourceRowId ||
        entity?.source_row_id ||
        entity?.sourceRow ||
        entity?.row_ref ||
        entity?.rowRef ||
        entity?.row ||
        "",
    ).trim(),
    col: String(
      entity?.sourceColId ||
        entity?.source_col_id ||
        entity?.sourceCol ||
        entity?.col_ref ||
        entity?.colRef ||
        entity?.col ||
        "",
    ).trim(),
  };
}

export function getStatsOrderSourceCell(order: Record<string, unknown>, rows: Record<string, unknown>[] = []): SourceCell {
  const source = pickSourceCellParts(order);
  if (source.row && source.col) return source;

  const orderId = String(order?.orderId || order?.order_id || "").trim();
  if (!orderId) return { row: "", col: "" };

  const linked = (rows || []).find((r) => String(r?.orderId || r?.order_id || "").trim() === orderId);
  if (!linked) return { row: "", col: "" };
  return pickSourceCellParts(linked);
}

export function getStatsDeleteActionKey(order: Record<string, unknown>, rows: Record<string, unknown>[] = []): string {
  const orderId = String(order?.orderId || order?.order_id || "").trim();
  const source = getStatsOrderSourceCell(order, rows);
  return `stats:delete:${orderId || `${source.row}-${source.col}`}`;
}

export async function resolveStatsOrderSourceCell(
  order: Record<string, unknown>,
  rows: Record<string, unknown>[] = [],
): Promise<SourceCell> {
  const fromCurrent = getStatsOrderSourceCell(order, rows);
  if (fromCurrent.row && fromCurrent.col) return fromCurrent;

  const orderId = String(order?.orderId || order?.order_id || "").trim();
  if (!orderId) return fromCurrent;

  try {
    const allOrders = await OrderService.getAllOrders();
    const allOrdersList = Array.isArray(allOrders) ? allOrders : [];
    const linked = allOrdersList.find((r) => String(r?.orderId || r?.order_id || "").trim() === orderId);
    if (!linked) return fromCurrent;
    return pickSourceCellParts(linked);
  } catch (_) {
    return fromCurrent;
  }
}
