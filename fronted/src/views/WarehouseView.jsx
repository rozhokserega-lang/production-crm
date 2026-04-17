export function WarehouseView({
  warehouseSubView,
  warehouseTableRows,
  leftoversTableRows,
  loading,
}) {
  return (
    <>
      {warehouseSubView === "sheets" && !warehouseTableRows.length && !loading && <div className="empty">Нет данных по складу</div>}
      {warehouseSubView === "sheets" && warehouseTableRows.length > 0 && (
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
    </>
  );
}
