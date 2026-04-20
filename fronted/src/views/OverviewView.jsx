export function OverviewView({
  overviewSubView,
  filtered,
  loading,
  overviewColumns,
  getStageLabel,
  overviewShippedOnly,
  formatDateTimeRu,
  onOpenOrderDrawer,
}) {
  return (
    <>
      {overviewSubView === "kanban" && (
        <>
          {!filtered.length && !loading && <div className="empty">Нет заказов для обзора</div>}
          {overviewColumns.some((c) => c.items.length) && (
            <div className="overview-board">
              {overviewColumns.map((col) => (
                <div key={col.id} className="overview-column">
                  <div className="overview-column__head">
                    <span>{col.title}</span>
                    <span className="section-count">{col.items.length}</span>
                  </div>
                  <div className="overview-column__list">
                    {col.items.map((o) => {
                      const orderId = String(o.orderId || o.order_id || "");
                      const openDrawer = () => {
                        if (orderId && typeof onOpenOrderDrawer === "function") onOpenOrderDrawer(orderId);
                      };
                      const onCardKeyDown = (e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        openDrawer();
                      };
                      return (
                        <article
                          key={`${col.id}-${orderId || o.item}`}
                          className={`overview-card overview-card--clickable lane-${col.id}`}
                          role={orderId && onOpenOrderDrawer ? "button" : undefined}
                          tabIndex={orderId && onOpenOrderDrawer ? 0 : undefined}
                          onClick={openDrawer}
                          onKeyDown={onCardKeyDown}
                        >
                          <div className="overview-card__id">Заказ #{orderId || "-"}</div>
                          <div className="overview-card__item">{o.item}</div>
                          <div className="overview-card__meta">
                            <span>План: {o.week || "-"}</span>
                            <span>Кол-во: {Number(o.qty || 0)}</span>
                          </div>
                          <div className={`overview-card__stage lane-${col.id}`}>{getStageLabel(o)}</div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {overviewSubView === "shipped" && (
        <>
          {!overviewShippedOnly.length && !loading && <div className="empty">Нет отгруженных заказов</div>}
          {overviewShippedOnly.length > 0 && (
            <div className="sheet-table-wrap">
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th>ID заказа</th>
                    <th>Изделие</th>
                    <th>План</th>
                    <th>Кол-во</th>
                    <th>Дата отгрузки</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {[...overviewShippedOnly]
                    .sort((a, b) => {
                      const at = new Date(
                        a.shippingDoneAt || a.shipping_done_at || a.updatedAt || a.updated_at || a.createdAt || a.created_at || 0
                      ).getTime();
                      const bt = new Date(
                        b.shippingDoneAt || b.shipping_done_at || b.updatedAt || b.updated_at || b.createdAt || b.created_at || 0
                      ).getTime();
                      return bt - at || String(a.item || "").localeCompare(String(b.item || ""), "ru");
                    })
                    .map((o) => {
                      const orderId = String(o.orderId || o.order_id || "");
                      const shippedAt =
                        o.shippingDoneAt ||
                        o.shipping_done_at ||
                        o.updatedAt ||
                        o.updated_at ||
                        o.createdAt ||
                        o.created_at ||
                        "";
                      return (
                        <tr key={`shipped-${orderId || o.item}`}>
                          <td>{orderId || "-"}</td>
                          <td>{o.item || "-"}</td>
                          <td>{o.week || "-"}</td>
                          <td>{Number(o.qty || 0)}</td>
                          <td>{formatDateTimeRu(shippedAt)}</td>
                          <td>{getStageLabel(o)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
