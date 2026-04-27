import { OrderService } from "../services/orderService";

interface Selection {
  row?: string;
  col?: string;
  rawRow?: string;
  rawCol?: string;
  weekCol?: string;
}

interface Attempt {
  row: string;
  col: string;
}

export function buildShipmentCellAttempts(selection: Selection): Attempt[] {
  return [
    { row: selection?.row || "", col: selection?.col || "" },
    { row: selection?.rawRow || "", col: selection?.rawCol || "" },
    { row: selection?.row || "", col: selection?.weekCol || "" },
    { row: selection?.rawRow || "", col: selection?.weekCol || "" },
  ].filter(
    (x) => x.row != null && x.col != null && String(x.row).trim() && String(x.col).trim(),
  );
}

interface RunShipmentCellActionParams {
  actionFn: (params: Record<string, unknown>) => Promise<unknown>;
  attempts: Attempt[];
  isMissingError: (e: unknown) => boolean;
  requestBuilder: (p: Attempt) => Record<string, unknown>;
}

/**
 * Выполняет действие над ячейкой плана отгрузки с fallback по разным комбинациям row/col.
 */
export async function runShipmentCellActionWithFallback({
  actionFn,
  attempts,
  isMissingError,
  requestBuilder,
}: RunShipmentCellActionParams): Promise<void> {
  let done = false;
  let lastErr: unknown = null;
  for (const p of attempts) {
    try {
      await actionFn(requestBuilder(p));
      done = true;
      break;
    } catch (e) {
      lastErr = e;
      if (!isMissingError(e)) throw e;
    }
  }
  if (!done) throw lastErr || new Error("Shipment cell not found");
}
