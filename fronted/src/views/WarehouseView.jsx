import { memo } from "react";

export const WarehouseView = memo(function WarehouseView({
  warehouseSubView,
  warehouseTableRows,
  leftoversTableRows,
  consumeHistoryTableRows,
  warehouseOrderPlanRows,
  loading,
  canOperateProduction,
  onManualConsume,
}) {
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
                    <td>{r.material || "-"}</td>
                    <td><b>{r.qtySheets}</b></td>
                    <td>{r.sizeLabel || "-"}</td>
                    <td>{r.updatedAt ? new Date(r.updatedAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "-"}</td>
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
                    <th>Нужно</th>
                    <th>В наличии</th>
                    <th>Заказать</th>
                  </tr>
                </thead>
                <tbody>
                  {warehouseOrderPlanRows.map((r) => (
                    <tr key={`order-${r.material}`}>
                      <td>{r.material || "-"}</td>
                      <td>{r.needed}</td>
                      <td>{r.available}</td>
                      <td><b>{r.toOrder}</b></td>
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
                <th>Цвет</th>
                <th>Размер</th>
                <th>Количество</th>
              </tr>
            </thead>
            <tbody>
              {leftoversTableRows.map((r, idx) => (
                <tr key={`${r.material}-${r.leftoverFormat}-${idx}`}>
                  <td>{r.material || "-"}</td>
                  <td>{r.leftoverFormat || "-"}</td>
                  <td><b>{r.leftoversQty}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {warehouseSubView === "history" && !consumeHistoryTableRows.length && !loading && (
        <div className="empty">Нет данных по списаниям</div>
      )}
      {warehouseSubView === "history" && consumeHistoryTableRows.length > 0 && (
        <div className="sheet-table-wrap">
          <table className="sheet-table">
            <thead>
              <tr>
                <th>Когда</th>
                <th>Событие</th>
                <th>Заказ</th>
                <th>Материал</th>
                <th>Списано (листов)</th>
                <th>Остаток</th>
                <th>Комментарий</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {consumeHistoryTableRows.map((r) => (
                <tr key={r.moveId || `${r.createdAt}-${r.orderId}-${r.material}`}>
                  <td>{r.createdAt ? new Date(r.createdAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "-"}</td>
                  <td>
                    {r.rowType === "leftover"
                      ? "Сформирован остаток"
                      : r.rowType === "pilka_done"
                        ? "Пильщик завершил"
                        : "Списание"}
                  </td>
                  <td>{r.orderId || "-"}</td>
                  <td>{r.material || "-"}</td>
                  <td><b>{r.rowType === "consume" ? r.qtySheets : "-"}</b></td>
                  <td><b>{r.rowType === "leftover" ? `${r.leftoversQty}${r.leftoverFormat ? ` (${r.leftoverFormat})` : ""}` : "-"}</b></td>
                  <td>{r.comment || "-"}</td>
                  <td>
                    {r.rowType === "pilka_done" && canOperateProduction ? (
                      <button
                        type="button"
                        className="mini ok"
                        onClick={() =>
                          onManualConsume?.(r.orderId, {
                            item: r.comment || "",
                            material: r.material || "",
                            defaultSheets: 1,
                            week: "",
                          })
                        }
                      >
                        Списать
                      </button>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
});
