import { memo } from "react";

interface WarehouseViewProps {
  warehouseSubView: string;
  warehouseTableRows: Record<string, unknown>[];
  leftoversTableRows: Record<string, unknown>[];
  consumeHistoryTableRows: Record<string, unknown>[];
  warehouseOrderPlanRows: Record<string, unknown>[];
  loading: boolean;
  canOperateProduction: boolean;
  onManualConsume?: (orderId: string, meta: Record<string, unknown>) => void;
}

export const WarehouseView = memo(function WarehouseView({
  warehouseSubView,
  warehouseTableRows,
  leftoversTableRows,
  consumeHistoryTableRows,
  warehouseOrderPlanRows,
  loading,
  canOperateProduction,
  onManualConsume,
}: WarehouseViewProps) {
  return (
    <>
      {warehouseSubView === "sheets" && !warehouseTableRows.length && !loading && <div className="empty">Нет данных по складу</div>}
      {warehouseSubView === "sheets" && warehouseTableRows.length > 0 && (
        <div style={{ display: "grid", gap: 12 }}>
          <div className="sheet-table-wrap">
            <table className="sheet-table">
              <thead>
                <tr>
                  <th>Материал</th>
                  <th>Листов в наличии</th>
                  <th>Размер</th>
                  <th>Обновлено</th>
                </tr>
              </thead>
              <tbody>
                {warehouseTableRows.map((r) => (
                  <tr key={`${r.material}-${r.sizeLabel}`}>
                    <td>{String(r.material || "-")}</td>
                    <td><b>{String(r.qtySheets)}</b></td>
                    <td>{String(r.sizeLabel || "-")}</td>
                    <td>{r.updatedAt ? new Date(String(r.updatedAt)).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sheet-table-wrap">
            <div className="selection-summary-title" style={{ marginBottom: 8 }}>
              Что заказать для закрытия плана
            </div>
            {warehouseOrderPlanRows.length === 0 ? (
              <div className="empty">Дефицита материалов нет.</div>
            ) : (
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th>Материал</th>
                    <th>Размер</th>
                    <th>Требуется</th>
                    <th>В наличии</th>
                    <th>Не хватает</th>
                  </tr>
                </thead>
                <tbody>
                  {warehouseOrderPlanRows.map((r, idx) => (
                    <tr key={`plan-${idx}`}>
                      <td>{String(r.material || "-")}</td>
                      <td>{String(r.size || "-")}</td>
                      <td>{String(r.required || 0)}</td>
                      <td>{String(r.available || 0)}</td>
                      <td style={{ color: "#be123c", fontWeight: 700 }}>{String(r.deficit || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {warehouseSubView === "leftovers" && !leftoversTableRows.length && !loading && <div className="empty">Нет данных по остаткам</div>}
      {warehouseSubView === "leftovers" && leftoversTableRows.length > 0 && (
        <div className="sheet-table-wrap">
          <table className="sheet-table">
            <thead>
              <tr>
                <th>Материал</th>
                <th>Размер</th>
                <th>Кол-во</th>
                <th>Обновлено</th>
              </tr>
            </thead>
            <tbody>
              {leftoversTableRows.map((r, idx) => (
                <tr key={`lo-${idx}`}>
                  <td>{String(r.material || "-")}</td>
                  <td>{String(r.size || "-")}</td>
                  <td><b>{String(r.qty || 0)}</b></td>
                  <td>{r.updatedAt ? new Date(String(r.updatedAt)).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {warehouseSubView === "consume" && !consumeHistoryTableRows.length && !loading && <div className="empty">Нет истории списаний</div>}
      {warehouseSubView === "consume" && consumeHistoryTableRows.length > 0 && (
        <div className="sheet-table-wrap">
          <table className="sheet-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Материал</th>
                <th>Кол-во</th>
                <th>Заказ</th>
                <th>Примечание</th>
              </tr>
            </thead>
            <tbody>
              {consumeHistoryTableRows.map((r, idx) => (
                <tr key={`ch-${idx}`}>
                  <td>{r.createdAt ? new Date(String(r.createdAt)).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "-"}</td>
                  <td>{String(r.material || "-")}</td>
                  <td>{String(r.qty || 0)}</td>
                  <td>{String(r.orderId || r.order_id || "-")}</td>
                  <td>{String(r.note || "-")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
});
