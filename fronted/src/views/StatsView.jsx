export function StatsView({
  statsList,
  loading,
  getStageLabel,
  actionLoading,
  getStatsDeleteActionKey,
  canManageOrders,
  deleteStatsOrder,
}) {
  return (
    <>
      {!statsList.length && !loading && <div className="empty">Нет данных для статистики</div>}
      {statsList.length > 0 && (
        <div className="sheet-table-wrap">
          <table className="sheet-table">
            <thead>
              <tr>
                <th>ID заказа</th>
                <th>Этап</th>
                <th>Изделие</th>
                <th>План</th>
                <th>Кол-во</th>
                <th>Пила</th>
                <th>Кромка</th>
                <th>Присадка</th>
                <th>Сборка</th>
                <th>Общий статус</th>
                <th>Удалить</th>
              </tr>
            </thead>
            <tbody>
              {statsList.map((o) => (
                <tr key={`stats-${o.orderId || o.row}`}>
                  <td>{o.orderId || "-"}</td>
                  <td>{getStageLabel(o)}</td>
                  <td>{o.item}</td>
                  <td>{o.week || "-"}</td>
                  <td>{o.qty || 0}</td>
                  <td>{o.pilkaStatus || "-"}</td>
                  <td>{o.kromkaStatus || "-"}</td>
                  <td>{o.prasStatus || "-"}</td>
                  <td>{o.assemblyStatus || "-"}</td>
                  <td>{o.overallStatus || "-"}</td>
                  <td>
                    <button
                      type="button"
                      className="mini warn stats-delete-btn"
                      title="Удалить заказ"
                      disabled={actionLoading === getStatsDeleteActionKey(o) || !canManageOrders}
                      onClick={() => deleteStatsOrder(o)}
                    >
                      X
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
