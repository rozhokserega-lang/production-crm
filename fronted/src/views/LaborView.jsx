export function LaborView({
  laborSubView,
  laborTableRows,
  laborOrdersRows,
  laborPlannerRows,
  laborPlannerQtyByGroup,
  setLaborPlannerQtyByGroup,
  loading,
}) {
  return (
    <>
      {laborSubView === "total" && !laborTableRows.length && !loading && <div className="empty">Нет данных по трудоемкости</div>}
      {laborSubView === "total" && laborTableRows.length > 0 && (
        <div className="sheet-table-wrap">
          <table className="sheet-table">
            <thead>
              <tr>
                <th>ID заказа</th>
                <th>Изделие</th>
                <th>План</th>
                <th>Кол-во</th>
                <th>Пилка (мин)</th>
                <th>Кромка (мин)</th>
                <th>Присадка (мин)</th>
                <th>Итого (мин)</th>
                <th>Дата завершения</th>
              </tr>
            </thead>
            <tbody>
              {laborTableRows.map((r) => (
                <tr key={`${r.orderId}-${r.item}`}>
                  <td>{r.orderId || "-"}</td>
                  <td>{r.item}</td>
                  <td>{r.week || "-"}</td>
                  <td>{r.qty}</td>
                  <td>{r.pilkaMin}</td>
                  <td>{r.kromkaMin}</td>
                  <td>{r.prasMin}</td>
                  <td><b>{r.totalMin}</b></td>
                  <td>{r.dateFinished || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {laborSubView === "orders" && !laborOrdersRows.length && !loading && (
        <div className="empty">Нет завершенных заказов для сводной трудоемкости</div>
      )}
      {laborSubView === "orders" && laborOrdersRows.length > 0 && (
        <div className="sheet-table-wrap">
          <table className="sheet-table">
            <thead>
              <tr>
                <th>Группа изделия</th>
                <th>Заказов</th>
                <th>Кол-во (шт)</th>
                <th>Пилка (мин)</th>
                <th>Кромка (мин)</th>
                <th>Присадка (мин)</th>
                <th>Итого (мин)</th>
                <th>Трудоемкость (ч/заказ)</th>
                <th>Трудоемкость (мин/шт)</th>
                <th>Трудоемкость (ч/шт)</th>
                <th>Доля пилки</th>
                <th>Доля кромки</th>
                <th>Доля присадки</th>
                <th>Последнее обновление</th>
              </tr>
            </thead>
            <tbody>
              {laborOrdersRows.map((r) => (
                <tr key={r.group}>
                  <td>{r.group}</td>
                  <td>{r.orders}</td>
                  <td>{r.qty}</td>
                  <td>{Math.round(r.pilkaMin)}</td>
                  <td>{Math.round(r.kromkaMin)}</td>
                  <td>{Math.round(r.prasMin)}</td>
                  <td><b>{Math.round(r.totalMin)}</b></td>
                  <td>{r.laborPerOrderHour.toFixed(2)}</td>
                  <td>{r.laborPerQtyMin.toFixed(2)}</td>
                  <td>{r.laborPerQtyHour.toFixed(2)}</td>
                  <td>{r.pilkaShare.toFixed(1)}%</td>
                  <td>{r.kromkaShare.toFixed(1)}%</td>
                  <td>{r.prasShare.toFixed(1)}%</td>
                  <td>{r.lastDate || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {laborSubView === "planner" && !laborPlannerRows.length && !loading && (
        <div className="empty">Нет данных для планировщика</div>
      )}
      {laborSubView === "planner" && laborPlannerRows.length > 0 && (
        <div className="sheet-table-wrap">
          <table className="sheet-table">
            <thead>
              <tr>
                <th>Группа изделия</th>
                <th>Норма (мин/комплект)</th>
                <th>План (комплектов)</th>
                <th>Время (мин)</th>
                <th>Время (ч:мм)</th>
              </tr>
            </thead>
            <tbody>
              {laborPlannerRows.map((r) => (
                <tr key={`planner-${r.group}`}>
                  <td>{r.group}</td>
                  <td>{r.laborPerQtyMin.toFixed(2)}</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={laborPlannerQtyByGroup[r.group] ?? ""}
                      onChange={(e) =>
                        setLaborPlannerQtyByGroup((prev) => ({
                          ...prev,
                          [r.group]: e.target.value,
                        }))
                      }
                      style={{ width: 120 }}
                      placeholder="0"
                    />
                  </td>
                  <td>{Math.round(r.totalMin)}</td>
                  <td><b>{r.hhmm}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
