export function buildShipmentCellAttempts(selection) {
  return [
    { row: selection?.row, col: selection?.col },
    { row: selection?.rawRow, col: selection?.rawCol },
    { row: selection?.row, col: selection?.weekCol },
    { row: selection?.rawRow, col: selection?.weekCol },
  ].filter(
    (x) => x.row != null && x.col != null && String(x.row).trim() && String(x.col).trim(),
  );
}

/**
 * Выполняет действие над ячейкой плана отгрузки с fallback по разным комбинациям row/col.
 * @param {Function} actionFn - асинхронная функция вида (params) => OrderService.method(params)
 */
export async function runShipmentCellActionWithFallback({
  actionFn,
  attempts,
  isMissingError,
  requestBuilder,
}) {
  let done = false;
  let lastErr = null;
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
