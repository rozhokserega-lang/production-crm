import { Fragment, memo, useMemo, useState } from "react";
import { buildMaterialCard } from "../app/materialCardHelpers";

const HISTORY_LABELS = {
  consume: "Списание",
  leftover: "Остаток",
  pilka_done: "Пила готово",
};

export const WarehouseView = memo(function WarehouseView({
  warehouseSubView,
  warehouseTableRows,
  leftoversTableRows,
  consumeHistoryTableRows,
  warehouseOrderPlanRows,
  loading,
  canOperateWarehouse,
  onManualConsume,
}) {
  const [selectedMaterial, setSelectedMaterial] = useState("");
  const materialCard = useMemo(
    () =>
      buildMaterialCard(selectedMaterial, {
        warehouseTableRows,
        warehouseOrderPlanRows,
        consumeHistoryTableRows,
        leftoversTableRows,
      }),
    [
      consumeHistoryTableRows,
      leftoversTableRows,
      selectedMaterial,
      warehouseOrderPlanRows,
      warehouseTableRows,
    ],
  );
  const renderMaterialButton = (material) => {
    const value = String(material || "").trim();
    if (!value) return "-";
    return (
      <button type="button" className="material-link-button" onClick={() => setSelectedMaterial(value)}>
        {value}
      </button>
    );
  };

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
                    <td>{renderMaterialButton(r.material)}</td>
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
                    <th>Ближайшая неделя</th>
                    <th>Нужно</th>
                    <th>В наличии</th>
                    <th>Заказать сегодня</th>
                    <th>Блокирует</th>
                  </tr>
                </thead>
                <tbody>
                  {warehouseOrderPlanRows.map((r) => (
                    <Fragment key={`order-${r.material}`}>
                      <tr>
                        <td>{renderMaterialButton(r.material)}</td>
                        <td>{r.firstWeek || "-"}</td>
                        <td>{r.needed}</td>
                        <td>{r.available}</td>
                        <td><b>{r.toOrder}</b></td>
                        <td>{Number(r.blockedCount || 0)}</td>
                      </tr>
                      <tr className="warehouse-plan-details-row">
                        <td colSpan={6}>
                          <div className="warehouse-plan-details">
                            <div className="warehouse-plan-details__weeks">
                              {(r.weeks || []).map((week) => (
                                <span
                                  key={`${r.material}-${week.week}`}
                                  className={week.deficit > 0 ? "warehouse-plan-week warehouse-plan-week--deficit" : "warehouse-plan-week"}
                                >
                                  {week.week}: нужно {week.needed}, дефицит {week.deficit}
                                </span>
                              ))}
                            </div>
                            <div className="warehouse-plan-details__blocked">
                              {(r.blockerRows || []).map((row) => (
                                <span key={row.key} className="warehouse-plan-blocker">
                                  {row.orderId ? `#${row.orderId} · ` : ""}
                                  {row.week} · {row.item || row.article || "-"} · {row.sheets} л. · не хватает {row.shortage}
                                </span>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
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
                  <td>{renderMaterialButton(r.material)}</td>
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
                  <td>{renderMaterialButton(r.material)}</td>
                  <td>
                    {r.rowType === "consume" ? (
                      <b>{r.qtySheets}</b>
                    ) : r.rowType === "pilka_done" && Number(r.expectedSheets) > 0 ? (
                      <b className="warehouse-history__expected-sheets">{r.expectedSheets}</b>
                    ) : (
                      <b>-</b>
                    )}
                  </td>
                  <td><b>{r.rowType === "leftover" ? `${r.leftoversQty}${r.leftoverFormat ? ` (${r.leftoverFormat})` : ""}` : "-"}</b></td>
                  <td>{r.comment || "-"}</td>
                  <td>
                    {r.rowType === "pilka_done" && canOperateWarehouse ? (
                      <button
                        type="button"
                        className="mini ok"
                        onClick={() =>
                          onManualConsume?.(r.orderId, {
                            item: String(r.orderItem || "").trim(),
                            material: r.material || "",
                            defaultSheets: Number(r.expectedSheets) > 0 ? Number(r.expectedSheets) : 1,
                            week: String(r.orderWeek || "").trim(),
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
      {materialCard && (
        <div className="dialog-backdrop">
          <div className="dialog-card material-card-dialog" role="dialog" aria-modal="true">
            <div className="material-card-head">
              <div>
                <h3>{materialCard.material}</h3>
                <p>
                  {materialCard.updatedAt
                    ? new Date(materialCard.updatedAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })
                    : "Обновление не найдено"}
                </p>
              </div>
              <button type="button" className="mini" onClick={() => setSelectedMaterial("")}>
                Закрыть
              </button>
            </div>
            <div className="material-card-kpis">
              <div>
                <span>Остаток</span>
                <b>{materialCard.stockTotal}</b>
              </div>
              <div>
                <span>Нужно</span>
                <b>{materialCard.needed}</b>
              </div>
              <div>
                <span>Заказать</span>
                <b>{materialCard.toOrder}</b>
              </div>
              <div>
                <span>Расход 30 дней</span>
                <b>{materialCard.consumedLast30Days}</b>
              </div>
              <div>
                <span>В день</span>
                <b>{materialCard.avgDailyConsumption.toFixed(2)}</b>
              </div>
              <div>
                <span>Закончится</span>
                <b>
                  {materialCard.daysLeft != null
                    ? `${Math.ceil(materialCard.daysLeft)} дн. (${new Date(materialCard.runsOutAt).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })})`
                    : materialCard.toOrder > 0
                      ? `нед. ${materialCard.firstWeek || "-"}`
                      : "-"}
                </b>
              </div>
            </div>
            {materialCard.weeks.length > 0 && (
              <div className="material-card-section">
                <h4>По неделям</h4>
                <div className="warehouse-plan-details__weeks">
                  {materialCard.weeks.map((week) => (
                    <span
                      key={`${materialCard.material}-${week.week}`}
                      className={Number(week.deficit || 0) > 0 ? "warehouse-plan-week warehouse-plan-week--deficit" : "warehouse-plan-week"}
                    >
                      {week.week}: нужно {week.needed}, дефицит {week.deficit}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="material-card-grid">
              <div className="material-card-section">
                <h4>Заказы</h4>
                {materialCard.requiredRows.length === 0 ? (
                  <div className="empty material-card-empty">Нет заказов по материалу</div>
                ) : (
                  <div className="material-card-list">
                    {materialCard.requiredRows.slice(0, 12).map((row) => (
                      <span key={`${row.key || row.orderId}-${row.week}-${row.item}-${row.sheets}`}>
                        {row.orderId ? `#${row.orderId}: ` : ""}
                        {row.week} / {row.item || row.article || "-"} / {row.sheets} л.
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="material-card-section">
                <h4>Блокирует</h4>
                {materialCard.blockerRows.length === 0 ? (
                  <div className="empty material-card-empty">Блокировок нет</div>
                ) : (
                  <div className="material-card-list">
                    {materialCard.blockerRows.slice(0, 12).map((row) => (
                      <span key={`${row.key || row.orderId}-${row.week}-${row.item}-${row.shortage}`}>
                        {row.orderId ? `#${row.orderId}: ` : ""}
                        {row.week} / {row.item || row.article || "-"} / не хватает {row.shortage}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="material-card-section">
              <h4>История</h4>
              {materialCard.historyRows.length === 0 ? (
                <div className="empty material-card-empty">История списаний пуста</div>
              ) : (
                <div className="material-card-history">
                  {materialCard.historyRows.slice(0, 12).map((row) => (
                    <div key={row.moveId || `${row.createdAt}-${row.orderId}-${row.rowType}`}>
                      <span>{row.createdAt ? new Date(row.createdAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "-"}</span>
                      <b>{HISTORY_LABELS[row.rowType] || row.rowType || "Событие"}</b>
                      <span>{row.orderId ? `#${row.orderId}` : "-"}</span>
                      <span>
                        {row.rowType === "consume"
                          ? `${row.qtySheets} л.`
                          : row.rowType === "leftover"
                            ? `${row.leftoversQty}${row.leftoverFormat ? ` (${row.leftoverFormat})` : ""}`
                            : Number(row.expectedSheets || 0) > 0
                              ? `${row.expectedSheets} л.`
                              : "-"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
});
