export function PackagingInboxDialog({
  open,
  orders,
  acceptingId,
  actionError,
  onAccept,
  onClose,
}) {
  if (!open) return null;

  const isAccepting = (orderId, stage) => acceptingId === `${orderId}:${stage}`;

  return (
    <div className="dialog-backdrop">
      <div className="dialog-card" style={{ maxWidth: 760, width: "95vw", maxHeight: "85vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Упаковка — входящие заказы ({orders.length})</h3>
          <button type="button" className="mini" onClick={onClose}>Закрыть</button>
        </div>
        <p style={{ margin: "0 0 12px", color: "#64748b", fontSize: 13 }}>
          Выберите этап цеха: на пилу — обычный маршрут; сразу на сборку — если деталь уже готова после пилы, кромки и присадки.
        </p>
        {String(actionError || "").trim() ? (
          <div className="error" style={{ marginBottom: 12 }}>
            {actionError}
          </div>
        ) : null}
        {orders.length === 0 ? (
          <div className="empty">Новых заказов в упаковку нет.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {orders.map((order) => {
              const busyPilka = isAccepting(order.id, "pilka");
              const busyAssembly = isAccepting(order.id, "assembly");
              const busy = busyPilka || busyAssembly;
              return (
                <article key={order.id} className="card" style={{ padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <strong>{order.product} — {order.part}</strong>
                    <span>{order.qty} шт.</span>
                  </div>
                  <div style={{ marginTop: 6, color: "#64748b", fontSize: 13 }}>
                    Материал: {order.color || "—"}
                    {order.note ? ` | Примечание: ${order.note}` : ""}
                  </div>
                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="mini ok"
                      disabled={busy}
                      onClick={() => onAccept(order.id, "pilka")}
                    >
                      {busyPilka ? "Принимаю..." : "На пилу"}
                    </button>
                    <button
                      type="button"
                      className="mini"
                      disabled={busy}
                      onClick={() => onAccept(order.id, "assembly")}
                      title="Пила, кромка и присадка будут отмечены готовыми — заказ попадёт в сборку"
                    >
                      {busyAssembly ? "Принимаю..." : "Сразу на сборку"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
