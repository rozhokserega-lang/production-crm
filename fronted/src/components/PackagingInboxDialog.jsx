export function PackagingInboxDialog({
  open,
  orders,
  acceptingId,
  onAccept,
  onClose,
}) {
  if (!open) return null;

  return (
    <div className="dialog-backdrop">
      <div className="dialog-card" style={{ maxWidth: 760, width: "95vw", maxHeight: "85vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Упаковка — входящие заказы ({orders.length})</h3>
          <button type="button" className="mini" onClick={onClose}>Закрыть</button>
        </div>
        {orders.length === 0 ? (
          <div className="empty">Новых заказов в упаковку нет.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {orders.map((order) => (
              <article key={order.id} className="card" style={{ padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <strong>{order.product} — {order.part}</strong>
                  <span>{order.qty} шт.</span>
                </div>
                <div style={{ marginTop: 6, color: "#64748b", fontSize: 13 }}>
                  Материал: {order.color || "—"}
                  {order.note ? ` | Примечание: ${order.note}` : ""}
                </div>
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="mini ok"
                    disabled={acceptingId === order.id}
                    onClick={() => onAccept(order.id)}
                  >
                    {acceptingId === order.id ? "Принимаю..." : "Принять в работу"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
