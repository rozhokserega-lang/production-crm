export function LaborView({
  laborSubView,
  laborTableRows,
  laborOrdersRows,
  laborPlannerRows,
  laborPlannerQtyByGroup,
  setLaborPlannerQtyByGroup,
  laborStageTimelineRows,
  laborSaveSelected,
  setLaborSaveSelected,
  laborSavingByKey,
  laborSavedByKey,
  saveImportedLaborRowToDb,
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
                <th>Сохранить в БД</th>
              </tr>
            </thead>
            <tbody>
              {laborTableRows.map((r) => (
                <tr key={`${r.orderId}-${r.item}-${r.importKey || "db"}`}>
                  <td>{r.orderId || "-"}</td>
                  <td>{r.item}</td>
                  <td>{r.week || "-"}</td>
                  <td>{r.qty}</td>
                  <td>{r.pilkaMin}</td>
                  <td>{r.kromkaMin}</td>
                  <td>{r.prasMin}</td>
                  <td><b>{r.totalMin}</b></td>
                  <td>{r.dateFinished || "-"}</td>
                  <td>
                    {r.importedLocal && r.importKey ? (
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={Boolean(laborSaveSelected[r.importKey])}
                          disabled={Boolean(laborSavingByKey[r.importKey]) || Boolean(laborSavedByKey[r.importKey])}
                          onChange={(e) => {
                            const checked = Boolean(e.target.checked);
                            setLaborSaveSelected((prev) => ({ ...prev, [r.importKey]: checked }));
                            if (checked) void saveImportedLaborRowToDb(r);
                          }}
                        />
                        <span>
                          {laborSavedByKey[r.importKey]
                            ? "Сохранено"
                            : laborSavingByKey[r.importKey]
                              ? "Сохраняю..."
                              : "Сохранить"}
                        </span>
                      </label>
                    ) : (
                      "—"
                    )}
                  </td>
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
                  <td className="labor-group-cell">
                    <span className="labor-group-name">{r.group}</span>
                    <div className="labor-share-tooltip">
                      <div className="labor-share-tooltip__title">Распределение этапов</div>
                      <div className="labor-share-tooltip__bar">
                        <span
                          className="labor-share-tooltip__seg labor-share-tooltip__seg--pilka"
                          style={{ width: `${Math.max(0, Math.min(100, Number(r.pilkaShare || 0)))}%` }}
                        />
                        <span
                          className="labor-share-tooltip__seg labor-share-tooltip__seg--kromka"
                          style={{ width: `${Math.max(0, Math.min(100, Number(r.kromkaShare || 0)))}%` }}
                        />
                        <span
                          className="labor-share-tooltip__seg labor-share-tooltip__seg--pras"
                          style={{ width: `${Math.max(0, Math.min(100, Number(r.prasShare || 0)))}%` }}
                        />
                      </div>
                      <div className="labor-share-tooltip__rows">
                        <div className="labor-share-tooltip__row">
                          <span className="dot pilka" /> Пила: <b>{r.pilkaShare.toFixed(1)}%</b>
                        </div>
                        <div className="labor-share-tooltip__row">
                          <span className="dot kromka" /> Кромка: <b>{r.kromkaShare.toFixed(1)}%</b>
                        </div>
                        <div className="labor-share-tooltip__row">
                          <span className="dot pras" /> Присадка: <b>{r.prasShare.toFixed(1)}%</b>
                        </div>
                      </div>
                    </div>
                  </td>
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
      {laborSubView === "stages" && !laborStageTimelineRows.length && !loading && (
        <div className="empty">Нет данных по этапам (нужны роли manager/admin)</div>
      )}
      {laborSubView === "stages" && laborStageTimelineRows.length > 0 && (
        <div className="sheet-table-wrap">
          <table className="sheet-table">
            <thead>
              <tr>
                <th>ID заказа</th>
                <th>Пила: статус</th>
                <th>Пила: начало</th>
                <th>Пила: конец</th>
                <th>Кромка: статус</th>
                <th>Кромка: начало</th>
                <th>Кромка: конец</th>
                <th>Присадка: статус</th>
                <th>Присадка: начало</th>
                <th>Присадка: конец</th>
                <th>Обновлено</th>
              </tr>
            </thead>
            <tbody>
              {laborStageTimelineRows.map((r) => (
                <tr key={`labor-stage-${r.orderId}`}>
                  <td>{r.orderId || "-"}</td>
                  <td>{r.pilkaStatus || "-"}</td>
                  <td>{r.pilkaStart ? new Date(r.pilkaStart).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "-"}</td>
                  <td>{r.pilkaEnd ? new Date(r.pilkaEnd).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "-"}</td>
                  <td>{r.kromkaStatus || "-"}</td>
                  <td>{r.kromkaStart ? new Date(r.kromkaStart).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "-"}</td>
                  <td>{r.kromkaEnd ? new Date(r.kromkaEnd).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "-"}</td>
                  <td>{r.prasStatus || "-"}</td>
                  <td>{r.prasStart ? new Date(r.prasStart).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "-"}</td>
                  <td>{r.prasEnd ? new Date(r.prasEnd).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "-"}</td>
                  <td>{r.lastEventAt ? new Date(r.lastEventAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
