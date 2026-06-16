function num(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function HardwareRequirementDialog({
  open,
  orderId,
  item,
  qty,
  lines,
  loading,
  error,
  onClose,
}) {
  if (!open) return null;

  const rows = Array.isArray(lines) ? lines : [];
  const hasLines = rows.length > 0;
  const deficitCount = rows.filter((l) => num(l.required) > num(l.available)).length;

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="dialog-card hw-req-dialog">
        <h3 className="hw-req-dialog__title">Фурнитура на заказ</h3>
        <div className="hw-req-dialog__meta">
          <span className="hw-req-dialog__item">{item || "—"}</span>
          {qty != null && qty !== "" ? <span>{qty} шт.</span> : null}
          <span>ID: {orderId || "—"}</span>
        </div>

        {loading && <div className="hw-req-dialog__status">Считаю потребность…</div>}

        {!loading && error && <div className="error">{error}</div>}

        {!loading && !error && !hasLines && (
          <div className="empty hw-req-dialog__empty">
            Для этого заказа нет норм расхода фурнитуры. Проверьте «Соответствие» во вкладке «Фурнитура».
          </div>
        )}

        {!loading && hasLines && (
          <>
            <div className="hw-req-dialog__summary">
              Позиций: <b>{rows.length}</b>
              {deficitCount > 0 ? (
                <>
                  {" "}
                  | Не хватает: <b className="hw-req-dialog__deficit">{deficitCount}</b>
                </>
              ) : (
                <>
                  {" "}
                  | <span className="hw-req-dialog__ok">на складе хватает</span>
                </>
              )}
            </div>
            <div className="hw-req-dialog__table-wrap">
              <table className="hw-req-table">
                <thead>
                  <tr>
                    <th className="hw-req-col-name">Фурнитура</th>
                    <th className="hw-req-col-size">Размер</th>
                    <th className="hw-req-col-num">Требуется</th>
                    <th className="hw-req-col-num">В наличии</th>
                    <th className="hw-req-col-num">Не хв.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => {
                    const required = num(l.required);
                    const available = num(l.available);
                    const miss = Math.max(0, required - available);
                    const rowClass = miss > 0 ? "hw-req-row--deficit" : required > 0 ? "hw-req-row--ok" : "";
                    return (
                      <tr key={l.hardwareItemId} className={rowClass}>
                        <td className="hw-req-col-name" title={l.name || ""}>
                          {l.name || "—"}
                        </td>
                        <td className="hw-req-col-size">{l.size || "—"}</td>
                        <td className="hw-req-col-num">{required > 0 ? required : "—"}</td>
                        <td className="hw-req-col-num">{available}</td>
                        <td className="hw-req-col-num">
                          {required > 0 ? (
                            miss > 0 ? (
                              <b className="hw-req-dialog__deficit">−{miss}</b>
                            ) : (
                              <span className="hw-req-dialog__ok">ок</span>
                            )
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="actions hw-req-dialog__actions">
          <button type="button" className="mini" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
