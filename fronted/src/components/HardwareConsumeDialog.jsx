export function HardwareConsumeDialog({
  open,
  orderId,
  item,
  lines,
  loading,
  saving,
  error,
  onSetLineQty,
  onSubmit,
  onClose,
}) {
  if (!open) return null;

  const hasLines = Array.isArray(lines) && lines.length > 0;

  return (
    <div className="dialog-backdrop">
      <div className="dialog-card" style={{ maxWidth: 560 }}>
        <h3 style={{ marginTop: 0 }}>Списание фурнитуры</h3>
        <div className="line2" style={{ marginBottom: 8 }}>
          <span>{item || "Заказ закрыт"}</span>
          <span>ID: {orderId || "-"}</span>
        </div>

        {loading && <div className="line2" style={{ marginBottom: 8 }}>Загружаю нормы расхода...</div>}

        {!loading && !hasLines && (
          <div className="empty" style={{ marginBottom: 8 }}>
            Для этого заказа нет норм расхода фурнитуры. Проверьте «Соответствие» во вкладке «Фурнитура».
          </div>
        )}

        {hasLines && (
          <div className="sheet-table-wrap" style={{ maxHeight: 360, overflow: "auto" }}>
            <table className="sheet-table">
              <thead>
                <tr>
                  <th>Фурнитура</th>
                  <th>Размер</th>
                  <th style={{ textAlign: "center" }}>В наличии</th>
                  <th style={{ textAlign: "center" }}>Списать</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const qtyNum = Number(String(l.qty).replace(",", ".")) || 0;
                  const shortage = qtyNum > Number(l.available || 0);
                  return (
                    <tr key={l.hardwareItemId} style={shortage ? { background: "#fff5f5" } : {}}>
                      <td>{l.name || "-"}</td>
                      <td>{l.size || "-"}</td>
                      <td style={{ textAlign: "center", color: shortage ? "#be123c" : undefined }}>
                        {l.available}
                      </td>
                      <td style={{ textAlign: "center", width: 110 }}>
                        <input
                          value={l.qty}
                          inputMode="decimal"
                          style={{ width: 90, textAlign: "center" }}
                          disabled={saving}
                          onChange={(e) => onSetLineQty(l.hardwareItemId, e.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="actions" style={{ marginTop: 10 }}>
          <button className="mini ok" disabled={saving || loading || !hasLines} onClick={onSubmit}>
            {saving ? "Списываю..." : "Подтвердить списание"}
          </button>
          <button className="mini warn" disabled={saving} onClick={onClose}>
            {hasLines ? "Отмена" : "Закрыть"}
          </button>
        </div>

        {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
      </div>
    </div>
  );
}
